"""
Bulk fetch all Chilean laws (Ley, Decreto Ley) from the BCN SPARQL endpoint.

Workflow per run:
  1. Fetch/refresh SPARQL catalog (idNorma list) → bulk_catalog.json in DATA_ROOT
  2. Load bulk_progress.json; on first run, scan existing dirs to pre-populate done set
  3. Pick next --batch-size unprocessed idNormas (not done, not failed ≥ MAX_FAILURES)
  4. For each: call trace_one_law() with empty modifier_map (idempotent)
  5. Add new laws to graph.json as stub entries
  6. Commit catalog + progress + graph.json together
  7. Optionally run rebuild_history

The catalog is rebuilt from SPARQL when missing or older than CATALOG_MAX_AGE_DAYS.
Progress persists between runs in bulk_progress.json (also committed to historial branch).

Usage:
    LEYCHILE_DATA_ROOT=./historial python scripts/bulk_fetch.py
    python scripts/bulk_fetch.py --batch-size 30 --skip-rebuild
    python scripts/bulk_fetch.py --refresh-catalog
    python scripts/bulk_fetch.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests

# Import shared helpers from sibling scripts
import trace_graph as tg
import rebuild_history as rh

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

BCN_SPARQL = "https://datos.bcn.cl/sparql"
CATALOG_FILE = "bulk_catalog.json"
PROGRESS_FILE = "bulk_progress.json"
CATALOG_MAX_AGE_DAYS = 7
SPARQL_PAGE_SIZE = 500
MAX_FAILURES = 3

# SPARQL norm type URIs we want to include
_LEY_URI = "http://datos.bcn.cl/recurso/cl/norma/tipo#ley"
_DL_URI = "http://datos.bcn.cl/recurso/cl/norma/tipo#dl"

# Numeric-only check: we skip laws whose numero is not a proper integer
# (e.g. "s/n", "s-n") because they would collide in the same directory.
_SKIP_NUMERO_PATTERNS = {"s/n", "s-n", "s-n.", "sn", ""}


# ---------------------------------------------------------------------------
# SPARQL helpers
# ---------------------------------------------------------------------------

def _sparql_query(query: str, retries: int = 5) -> list[dict]:
    """Execute a SPARQL SELECT query; return bindings list. Raises on failure."""
    delay = 10.0  # start at 10s — the BCN endpoint rate-limits at ~500ms between requests
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.get(
                BCN_SPARQL,
                params={"query": query},
                headers={
                    "Accept": "application/sparql-results+json",
                    "User-Agent": tg.UA,
                },
                timeout=90,
            )
            resp.raise_for_status()
            return resp.json()["results"]["bindings"]
        except Exception as exc:
            last_exc = exc
            log.warning("SPARQL attempt %d/%d: %s", attempt + 1, retries, exc)
            if attempt + 1 < retries:
                # Honor Retry-After header if present (common with 429 responses)
                retry_after = 0
                if hasattr(exc, "response") and exc.response is not None:
                    try:
                        retry_after = int(exc.response.headers.get("Retry-After", 0))
                    except (ValueError, TypeError):
                        pass
                wait = max(delay, retry_after)
                log.info("  Waiting %.0fs before retry ...", wait)
                time.sleep(wait)
                delay = min(delay * 2, 120)  # cap at 2 minutes
    raise RuntimeError(f"SPARQL query failed after {retries} attempts: {last_exc}")


_CATALOG_QUERY = """\
PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
SELECT ?code (SAMPLE(?tipo) AS ?norm_type) (SAMPLE(?fecha) AS ?pub_date) WHERE {{
  ?s a <http://datos.bcn.cl/ontologies/bcn-norms#RootNorm> .
  VALUES ?tipo {{
    <http://datos.bcn.cl/recurso/cl/norma/tipo#ley>
    <http://datos.bcn.cl/recurso/cl/norma/tipo#dl>
  }}
  ?s bcn:type ?tipo .
  ?s bcn:leychileCode ?code .
  FILTER(xsd:integer(?code) > {last_code})
  OPTIONAL {{
    ?s bcn:publishDate ?fecha .
    FILTER(YEAR(?fecha) <= 2100)
  }}
}} GROUP BY ?code ORDER BY ASC(xsd:integer(?code)) LIMIT {limit}
"""


def fetch_sparql_catalog() -> list[dict]:
    """
    Paginate through BCN SPARQL to collect all ley + decreto ley idNormas.
    Uses keyset pagination (FILTER code > last_seen) instead of OFFSET, which
    avoids the Virtuoso timeout that occurs at high offsets on aggregate queries.

    Returns list of {idNorma, tipo, fechaPublicacion} sorted by idNorma.
    Deduplicates by leychileCode (multiple URIs can share the same code).
    """
    seen: dict[int, dict] = {}
    last_code = 0

    while True:
        log.info("SPARQL catalog: last_code=%d, collected=%d ...", last_code, len(seen))
        query = _CATALOG_QUERY.format(limit=SPARQL_PAGE_SIZE, last_code=last_code)
        bindings = _sparql_query(query)

        if not bindings:
            break  # no more results

        for row in bindings:
            code_val = row.get("code", {}).get("value", "")
            if not code_val or not code_val.isdigit():
                continue

            id_norma = int(code_val)
            if id_norma in seen:
                continue

            tipo_uri = row.get("norm_type", {}).get("value", "")
            tipo = "dl" if tipo_uri == _DL_URI else "ley"

            fecha_raw = row.get("pub_date", {}).get("value", "")
            fecha = fecha_raw[:10] if fecha_raw else ""  # strip time component

            seen[id_norma] = {"idNorma": id_norma, "tipo": tipo, "fechaPublicacion": fecha}

        # Advance the keyset cursor to the largest code seen so far
        last_code = max(int(r["code"]["value"]) for r in bindings if r.get("code", {}).get("value", "").isdigit())

        log.info("  … %d distinct idNormas so far (last_code=%d)", len(seen), last_code)

        if len(bindings) < SPARQL_PAGE_SIZE:
            break  # last page (fewer rows than page size)

        time.sleep(1.0)  # respect the SPARQL endpoint; it rate-limits at ~500ms

    catalog = sorted(seen.values(), key=lambda e: e["idNorma"])
    log.info("SPARQL catalog complete: %d idNormas", len(catalog))
    return catalog


# ---------------------------------------------------------------------------
# Graph discovery — trace each law's relationships (backward + forward)
# ---------------------------------------------------------------------------

# Relationship predicates worth following:
#   modifiesTo   — laws this norma amends/derogates (backward)
#   isModifiedBy — laws that amend this norma (forward)
#   recasts      — texto refundido this norma consolidates (older ids)
#   isRecastedBy — consolidated text that supersedes this norma (newer ids)
_RELATIONS_QUERY = """\
PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
SELECT DISTINCT ?src ?rel ?code ?ttipo ?tnum ?tdate WHERE {{
  VALUES ?src {{ {ids} }}
  ?s bcn:leychileCode ?sc . FILTER(xsd:integer(?sc) = ?src)
  ?s ?rel ?target .
  FILTER(?rel = bcn:modifiesTo || ?rel = bcn:isModifiedBy
         || ?rel = bcn:recasts || ?rel = bcn:isRecastedBy)
  ?target bcn:leychileCode ?code .
  OPTIONAL {{ ?target bcn:type ?tt . BIND(STR(?tt) AS ?ttipo) }}
  OPTIONAL {{ ?target bcn:hasNumber ?tnum }}
  OPTIONAL {{ ?target bcn:publishDate ?tdate }}
}}
"""


def fetch_relations_batch(id_normas: list[int]) -> dict[int, list[dict]]:
    """
    Query BCN SPARQL for the relationships of each idNorma in one request.

    Returns {src_idNorma: [{rel, idNorma, tipo, numero, fecha}, ...]}.
    Every requested idNorma is present as a key (empty list if no relations).
    Targets are resolved by leychileCode, so a related law is identified by its
    real idNorma even when the BCN URI carries an older/newer numero.
    """
    if not id_normas:
        return {}
    out: dict[int, list[dict]] = {i: [] for i in id_normas}
    ids = " ".join(str(i) for i in id_normas)
    bindings = _sparql_query(_RELATIONS_QUERY.format(ids=ids))

    seen: set[tuple[int, str, int]] = set()
    for row in bindings:
        try:
            src = int(row["src"]["value"])
            code = int(row["code"]["value"])
        except (KeyError, ValueError):
            continue
        rel = row.get("rel", {}).get("value", "").split("#")[-1]
        if not rel or src == code:
            continue
        key = (src, rel, code)
        if key in seen:
            continue
        seen.add(key)
        tipo_uri = row.get("ttipo", {}).get("value", "")
        fecha_raw = row.get("tdate", {}).get("value", "")
        out.setdefault(src, []).append({
            "rel": rel,
            "idNorma": code,
            "tipo": tipo_uri.split("#")[-1] if tipo_uri else "",
            "numero": row.get("tnum", {}).get("value", ""),
            "fecha": fecha_raw[:10] if fecha_raw else "",
        })
    return out


# ---------------------------------------------------------------------------
# Catalog and progress I/O
# ---------------------------------------------------------------------------

def _catalog_path() -> Path:
    return tg.DATA_ROOT / CATALOG_FILE


def _progress_path() -> Path:
    return tg.DATA_ROOT / PROGRESS_FILE


def load_catalog() -> list[dict]:
    p = _catalog_path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Failed to load %s: %s", CATALOG_FILE, exc)
        return []


def save_catalog(catalog: list[dict]) -> None:
    _catalog_path().write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _catalog_age_days() -> float:
    p = _catalog_path()
    if not p.exists():
        return float("inf")
    mtime = datetime.fromtimestamp(p.stat().st_mtime)
    return (datetime.now() - mtime).total_seconds() / 86400


def load_progress() -> dict:
    p = _progress_path()
    if not p.exists():
        return {"done": [], "discovered": [], "failed": {}, "last_sync": ""}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        # Normalise: ensure expected keys exist
        raw.setdefault("done", [])
        raw.setdefault("discovered", [])
        raw.setdefault("failed", {})
        raw.setdefault("last_sync", "")
        return raw
    except Exception as exc:
        log.warning("Failed to load %s: %s", PROGRESS_FILE, exc)
        return {"done": [], "discovered": [], "failed": {}, "last_sync": ""}


def save_progress(progress: dict) -> None:
    _progress_path().write_text(
        json.dumps(progress, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Already-committed detection (one-time disk scan on first run)
# ---------------------------------------------------------------------------

_META_FILES = {"bulk_catalog.json", "bulk_progress.json", "graph.json"}
_NON_LAW_DIRS = {".git", ".github", "scripts", "__pycache__"}


def _law_collection_dirs() -> list[Path]:
    """Return every top-level directory under DATA_ROOT that holds law subdirs."""
    dirs: list[Path] = []
    for entry in sorted(tg.DATA_ROOT.iterdir()):
        if entry.is_dir() and entry.name not in _NON_LAW_DIRS:
            dirs.append(entry)
    return dirs


def _scan_committed_ids(catalog_ids: set[int]) -> set[int]:
    """
    Walk every law-collection directory in DATA_ROOT.
    For each directory that has versiones.json with at least one committed=true entry,
    read metadata.json to get the idNorma and return the set of such idNormas.
    Only returns idNormas that are in catalog_ids (avoids polluting progress with
    laws not from the bulk catalog).
    """
    found: set[int] = set()
    for base in _law_collection_dirs():
        for law_dir in base.iterdir():
            if law_dir.is_symlink() or not law_dir.is_dir():
                continue
            vf = law_dir / "versiones.json"
            if not vf.exists():
                continue
            try:
                versions = json.loads(vf.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not any(v.get("committed") for v in versions):
                continue
            mf = law_dir / "metadata.json"
            if not mf.exists():
                continue
            try:
                meta = json.loads(mf.read_text(encoding="utf-8"))
                id_norma = meta.get("idNorma", 0)
                if id_norma and id_norma in catalog_ids:
                    found.add(id_norma)
            except Exception:
                continue
    return found


# ---------------------------------------------------------------------------
# Batch selection
# ---------------------------------------------------------------------------

def get_pending(catalog: list[dict], progress: dict) -> list[int]:
    """
    Return idNormas from catalog that are neither done nor exhausted-failed,
    in catalog order (ascending idNorma = oldest first).
    """
    done_set = set(progress["done"])
    failed_counts: dict[str, int] = {
        str(k): v if isinstance(v, int) else v.get("count", 0)
        for k, v in progress.get("failed", {}).items()
    }
    result = []
    for entry in catalog:
        id_norma = entry["idNorma"]
        if id_norma in done_set:
            continue
        fail_count = failed_counts.get(str(id_norma), 0)
        if fail_count >= MAX_FAILURES:
            continue
        result.append(id_norma)
    return result


# ---------------------------------------------------------------------------
# Processing one law
# ---------------------------------------------------------------------------

def process_one(id_norma: int) -> tuple[bool, dict | None]:
    """
    Trace one law via trace_graph.trace_one_law().
    Returns (success: bool, metadata: dict | None).
    metadata is the LeyChile XML metadata dict if we could fetch it; None on hard failure.
    """
    try:
        root = tg.fetch_norma_xml(id_norma)
    except Exception as exc:
        log.error("  idNorma=%d: failed to fetch base XML: %s", id_norma, exc)
        return False, None

    metadata = tg.extract_metadata(root)
    numero = metadata.get("numero", "")

    # Skip laws without a proper numeric identifier (s/n etc.) — they would
    # collide in the same directory as other s/n laws.
    if numero.lower().replace("/", "-").replace(".", "") in _SKIP_NUMERO_PATTERNS:
        log.warning("  idNorma=%d: skipping non-numeric numero=%r", id_norma, numero)
        # Mark as done so we never try again
        return True, metadata

    titulo = metadata.get("titulo", "")
    clasificacion = tg.classify(titulo)
    dest = tg.law_dir(
        numero, clasificacion,
        tipo=metadata.get("tipo", ""), id_norma=metadata.get("idNorma"),
    )

    if dest.is_symlink():
        log.info("  idNorma=%d (Ley %s): dir is a derog symlink — already handled", id_norma, numero)
        return True, metadata

    log.info("  idNorma=%d → Ley %s (%s)", id_norma, numero, clasificacion)
    try:
        tg.trace_one_law(id_norma, modifier_map={})
    except Exception as exc:
        log.error("  idNorma=%d: trace_one_law failed: %s", id_norma, exc)
        return False, metadata

    return True, metadata


# ---------------------------------------------------------------------------
# Graph.json update
# ---------------------------------------------------------------------------

def _graph_path() -> Path:
    return tg.DATA_ROOT / "graph.json"


def _load_graph() -> dict[int, dict]:
    p = _graph_path()
    if not p.exists():
        return {}
    try:
        return {int(k): v for k, v in json.loads(p.read_text(encoding="utf-8")).items()}
    except Exception as exc:
        log.warning("Could not load graph.json: %s", exc)
        return {}


def _save_and_commit_graph(graph: dict[int, dict], msg: str) -> None:
    gpath = _graph_path()
    gpath.write_text(
        json.dumps(
            {str(k): graph[k] for k in sorted(graph)},
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )
    subprocess.run(["git", "-C", str(tg.DATA_ROOT), "add", "--", str(gpath)], check=True)
    result = subprocess.run(
        ["git", "-C", str(tg.DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if result.returncode != 0:
        subprocess.run(
            ["git", "-C", str(tg.DATA_ROOT), "commit", "-m", msg], check=True
        )


def _blank_node(id_norma: int) -> dict:
    return {
        "idNorma": id_norma,
        "numero": "",
        "titulo": "",
        "clasificacion": "",
        "fechaPublicacion": "",
        "modifica": [],
        "modificadaPor": [],
    }


def _update_graph(new_laws: list[tuple[int, dict]]) -> None:
    """
    Add or enrich graph.json entries for newly processed laws.

    A discovery stub (created earlier with only idNorma/numero) is enriched in
    place with titulo/clasificacion/fechaPublicacion while keeping any
    modifica/modificadaPor links already recorded.
    """
    if not new_laws:
        return

    graph = _load_graph()
    changed = 0
    for id_norma, metadata in new_laws:
        titulo = metadata.get("titulo", "")
        node = graph.setdefault(id_norma, _blank_node(id_norma))
        # Enrich only if the descriptive fields are still empty (stub).
        if not node.get("titulo"):
            node["numero"] = metadata.get("numero", node.get("numero", ""))
            node["titulo"] = titulo
            node["clasificacion"] = tg.classify(titulo)
            node["fechaPublicacion"] = metadata.get(
                "fechaPublicacion", node.get("fechaPublicacion", "")
            )
            changed += 1

    if changed == 0:
        return

    log.info("graph.json: added/enriched %d entries", changed)
    _save_and_commit_graph(
        graph, f"chore(meta): bulk — añadir/enriquecer {changed} entradas en graph.json"
    )


def _record_relations(rel_map: dict[int, list[dict]]) -> set[int]:
    """
    Merge backward (modifica) and forward (modificadaPor) relationships from
    fetch_relations_batch() into graph.json.

    Returns the set of every idNorma referenced (sources + targets) so the
    caller can enqueue newly discovered laws.
    """
    referenced: set[int] = set()
    if not rel_map:
        return referenced

    graph = _load_graph()
    changed = False

    def node(idn: int, numero: str = "", fecha: str = "") -> dict:
        n = graph.setdefault(idn, _blank_node(idn))
        if numero and not n.get("numero"):
            n["numero"] = numero
        if fecha and not n.get("fechaPublicacion"):
            n["fechaPublicacion"] = fecha
        return n

    for src, rels in rel_map.items():
        referenced.add(src)
        src_node = node(src)
        for r in rels:
            tgt = r["idNorma"]
            referenced.add(tgt)
            tgt_node = node(tgt, r.get("numero", ""), r.get("fecha", ""))
            rel = r["rel"]
            if rel == "modifiesTo":
                tnum = r.get("numero", "")
                if tnum and tnum not in src_node["modifica"]:
                    src_node["modifica"].append(tnum)
                    changed = True
                if src not in tgt_node["modificadaPor"]:
                    tgt_node["modificadaPor"].append(src)
                    changed = True
            elif rel == "isModifiedBy":
                if tgt not in src_node["modificadaPor"]:
                    src_node["modificadaPor"].append(tgt)
                    changed = True
                src_num = src_node.get("numero", "")
                if src_num and src_num not in tgt_node["modifica"]:
                    tgt_node["modifica"].append(src_num)
                    changed = True
            # recasts / isRecastedBy: followed for ingestion only (referenced),
            # no dedicated graph fields.

    if changed:
        _save_and_commit_graph(
            graph, "chore(meta): bulk — registrar relaciones del grafo legislativo"
        )
    return referenced


# ---------------------------------------------------------------------------
# Metadata / progress commit
# ---------------------------------------------------------------------------

def _commit_meta(msg: str) -> None:
    """Stage catalog + progress files and commit if anything changed."""
    files = [str(_catalog_path()), str(_progress_path())]
    existing = [f for f in files if Path(f).exists()]
    if not existing:
        return
    subprocess.run(["git", "-C", str(tg.DATA_ROOT), "add", "--"] + existing, check=True)
    result = subprocess.run(
        ["git", "-C", str(tg.DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if result.returncode != 0:
        subprocess.run(
            ["git", "-C", str(tg.DATA_ROOT), "commit", "-m", msg],
            check=True,
        )


# ---------------------------------------------------------------------------
# Discovery pass
# ---------------------------------------------------------------------------

def run_discovery(
    to_discover: list[int],
    catalog: list[dict],
    catalog_ids: set[int],
    progress: dict,
) -> int:
    """
    Fetch the relationships of the given laws, record them in graph.json, and
    append any newly discovered normas to the catalog so later runs ingest them.

    Tracing follows both directions: modifiesTo/recasts (backward) and
    isModifiedBy/isRecastedBy (forward). Returns the count of new catalog
    entries added.
    """
    if not to_discover:
        return 0

    log.info("Discovery: tracing relationships for %d laws ...", len(to_discover))
    try:
        rel_map = fetch_relations_batch(to_discover)
    except Exception as exc:
        log.warning("Discovery SPARQL failed — will retry next run: %s", exc)
        return 0

    _record_relations(rel_map)

    # Collect related normas not yet in the catalog.
    targets: dict[int, dict] = {}
    for rels in rel_map.values():
        for r in rels:
            tid = r["idNorma"]
            if tid not in catalog_ids and tid not in targets:
                targets[tid] = {"tipo": r.get("tipo", ""), "fecha": r.get("fecha", "")}

    new_entries = [
        {"idNorma": tid, "tipo": m["tipo"], "fechaPublicacion": m["fecha"]}
        for tid, m in sorted(targets.items())
    ]
    if new_entries:
        catalog.extend(new_entries)
        catalog.sort(key=lambda e: e["idNorma"])
        catalog_ids.update(targets)
        save_catalog(catalog)
        log.info("Discovery: appended %d newly discovered normas to catalog", len(new_entries))

    discovered = set(progress.get("discovered", []))
    discovered.update(to_discover)
    progress["discovered"] = sorted(discovered)
    return len(new_entries)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bulk fetch all Chilean Ley/DL laws from BCN SPARQL into historial."
    )
    parser.add_argument(
        "--batch-size", type=int, default=20, metavar="N",
        help="Laws to process per run (default: 20).",
    )
    parser.add_argument(
        "--refresh-catalog", action="store_true",
        help="Force-refresh the SPARQL catalog even if it is recent.",
    )
    parser.add_argument(
        "--skip-rebuild", action="store_true",
        help="Skip git fast-import history rebuild after the batch.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be done without fetching or committing.",
    )
    args = parser.parse_args()

    log.info("=== Bulk fetch — DATA_ROOT: %s ===", tg.DATA_ROOT)

    # ── 1. Catalog ──────────────────────────────────────────────────────────
    catalog_stale = args.refresh_catalog or _catalog_age_days() > CATALOG_MAX_AGE_DAYS
    catalog = load_catalog()

    if not catalog or catalog_stale:
        log.info("Fetching fresh SPARQL catalog (age=%.1f days) ...", _catalog_age_days())
        fresh = fetch_sparql_catalog()
        if not fresh:
            log.error("SPARQL catalog is empty — aborting")
            sys.exit(1)
        # Preserve normas discovered via graph traversal that the SPARQL
        # catalog query (Ley + DL only) does not return — e.g. DFLs, Decretos.
        fresh_ids = {e["idNorma"] for e in fresh}
        extras = [e for e in catalog if e["idNorma"] not in fresh_ids]
        catalog = sorted(fresh + extras, key=lambda e: e["idNorma"])
        if extras:
            log.info("  Kept %d discovered normas not in the SPARQL catalog", len(extras))
        if not args.dry_run:
            save_catalog(catalog)
            log.info("Catalog saved: %d entries", len(catalog))
    else:
        log.info("Using existing catalog (%d entries, %.1f days old)", len(catalog), _catalog_age_days())

    catalog_ids = {e["idNorma"] for e in catalog}

    # ── 2. Progress ──────────────────────────────────────────────────────────
    progress = load_progress()
    done_set = set(progress["done"])

    # One-time scan: pre-populate done set from existing directories
    if not done_set:
        log.info("First run: scanning existing law dirs to pre-populate done set ...")
        already_committed = _scan_committed_ids(catalog_ids)
        log.info("  Found %d already-committed laws in catalog", len(already_committed))
        if already_committed and not args.dry_run:
            done_set.update(already_committed)
            progress["done"] = sorted(done_set)
            save_progress(progress)

    pending = get_pending(catalog, progress)
    total = len(catalog)
    n_done = len(done_set)
    n_failed = sum(
        1 for cnt in progress["failed"].values()
        if (cnt if isinstance(cnt, int) else cnt.get("count", 0)) >= MAX_FAILURES
    )
    log.info(
        "Status: %d/%d done, %d exhausted-failed, %d pending",
        n_done, total, n_failed, len(pending),
    )

    discovered = set(progress.get("discovered", []))
    backlog_count = len([i for i in done_set if i not in discovered])
    log.info("Discovery backlog: %d traced laws pending relationship lookup", backlog_count)

    if args.dry_run:
        log.info("[dry-run] Would process: %s", pending[: args.batch_size][:10])
        log.info("[dry-run] Would run discovery on up to %d laws", args.batch_size * 2)
        return

    # ── 3. Process a batch of pending laws ──────────────────────────────────
    batch = pending[: args.batch_size]
    new_graph_entries: list[tuple[int, dict]] = []
    batch_done: list[int] = []

    if batch:
        log.info(
            "Processing batch of %d laws (next pending idNorma=%d) ...",
            len(batch), batch[0],
        )
        for id_norma in batch:
            success, metadata = process_one(id_norma)

            if success:
                done_set.add(id_norma)
                batch_done.append(id_norma)
                progress["failed"].pop(str(id_norma), None)
                if metadata:
                    new_graph_entries.append((id_norma, metadata))
            else:
                failed_entry = progress["failed"].get(str(id_norma), {"count": 0, "last_error": ""})
                if isinstance(failed_entry, int):
                    failed_entry = {"count": failed_entry, "last_error": ""}
                failed_entry["count"] = failed_entry.get("count", 0) + 1
                progress["failed"][str(id_norma)] = failed_entry
                log.warning(
                    "  idNorma=%d: failure %d/%d",
                    id_norma, failed_entry["count"], MAX_FAILURES,
                )

        progress["done"] = sorted(done_set)
        progress["last_sync"] = date.today().isoformat()
        save_progress(progress)
        _commit_meta(
            f"chore(meta): bulk — progreso {len(done_set)}/{total} leyes procesadas"
        )
        _update_graph(new_graph_entries)
        log.info(
            "Batch complete: %d/%d succeeded, %d failed",
            len(batch_done), len(batch), len(batch) - len(batch_done),
        )
    else:
        log.info("No pending catalog laws — running discovery only.")

    # ── 4. Discovery: trace relationships backwards and forwards ─────────────
    backlog = [i for i in done_set if i not in discovered and i not in batch_done]
    to_discover = (batch_done + backlog)[: args.batch_size * 2]
    n_new = run_discovery(to_discover, catalog, catalog_ids, progress)
    if to_discover:
        save_progress(progress)
        _commit_meta(
            f"chore(meta): bulk — {n_new} normas relacionadas descubiertas, "
            f"{len(progress['discovered'])}/{len(done_set)} leyes trazadas"
        )

    if not batch and not to_discover:
        log.info("Nothing to process and nothing to discover — done.")
        return

    # ── 5. Rebuild history ───────────────────────────────────────────────────
    if not args.skip_rebuild:
        log.info("Rebuilding chronological history ...")
        try:
            rh.rebuild(dry_run=False)
            log.info("History rebuilt successfully.")
        except SystemExit as exc:
            log.error("rebuild_history exited with code %s", exc.code)
            sys.exit(exc.code or 1)
    else:
        log.info("Skipping history rebuild (--skip-rebuild).")

    log.info(
        "=== Done — %d/%d laws committed, %d traced, catalog size %d ===",
        len(done_set), total, len(progress["discovered"]), len(catalog),
    )


if __name__ == "__main__":
    main()
