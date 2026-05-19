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
        return {"done": [], "failed": {}, "last_sync": ""}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        # Normalise: ensure expected keys exist
        raw.setdefault("done", [])
        raw.setdefault("failed", {})
        raw.setdefault("last_sync", "")
        return raw
    except Exception as exc:
        log.warning("Failed to load %s: %s", PROGRESS_FILE, exc)
        return {"done": [], "failed": {}, "last_sync": ""}


def save_progress(progress: dict) -> None:
    _progress_path().write_text(
        json.dumps(progress, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Already-committed detection (one-time disk scan on first run)
# ---------------------------------------------------------------------------

def _scan_committed_ids(catalog_ids: set[int]) -> set[int]:
    """
    Walk leyes/ and modificaciones/ in DATA_ROOT.
    For each directory that has versiones.json with at least one committed=true entry,
    read metadata.json to get the idNorma and return the set of such idNormas.
    Only returns idNormas that are in catalog_ids (avoids polluting progress with
    laws not from the bulk catalog).
    """
    found: set[int] = set()
    for subdir in ("leyes", "modificaciones"):
        base = tg.DATA_ROOT / subdir
        if not base.is_dir():
            continue
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
    dest = tg.law_dir(numero, clasificacion)

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

def _update_graph(new_laws: list[tuple[int, dict]]) -> None:
    """
    Add stub entries for newly processed laws to graph.json.
    Does not overwrite existing entries (they may have richer modifier info).
    Commits the updated graph.json if changed.
    """
    if not new_laws:
        return

    gpath = tg.DATA_ROOT / "graph.json"
    graph: dict = {}
    if gpath.exists():
        try:
            graph = {int(k): v for k, v in json.loads(gpath.read_text(encoding="utf-8")).items()}
        except Exception as exc:
            log.warning("Could not load graph.json: %s", exc)

    added = 0
    for id_norma, metadata in new_laws:
        if id_norma in graph:
            continue
        titulo = metadata.get("titulo", "")
        graph[id_norma] = {
            "idNorma": id_norma,
            "numero": metadata.get("numero", ""),
            "titulo": titulo,
            "clasificacion": tg.classify(titulo),
            "fechaPublicacion": metadata.get("fechaPublicacion", ""),
            "modifica": [],
            "modificadaPor": [],
        }
        added += 1

    if added == 0:
        return

    log.info("graph.json: adding %d new stub entries", added)
    # Write with string keys (graph.json convention)
    gpath.write_text(
        json.dumps({str(k): v for k, v in sorted(graph.items())}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    subprocess.run(["git", "-C", str(tg.DATA_ROOT), "add", "--", str(gpath)], check=True)
    result = subprocess.run(
        ["git", "-C", str(tg.DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if result.returncode != 0:
        subprocess.run(
            ["git", "-C", str(tg.DATA_ROOT), "commit", "-m",
             f"chore(meta): bulk — añadir {added} stubs a graph.json"],
            check=True,
        )


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
        catalog = fetch_sparql_catalog()
        if not catalog:
            log.error("SPARQL catalog is empty — aborting")
            sys.exit(1)
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

    if not pending:
        log.info("All laws processed — nothing to do.")
        return

    batch = pending[: args.batch_size]
    log.info(
        "Processing batch of %d laws (next pending idNorma=%d) ...",
        len(batch), batch[0],
    )

    if args.dry_run:
        log.info("[dry-run] Would process: %s", batch[:10])
        return

    # ── 3. Process batch ─────────────────────────────────────────────────────
    new_graph_entries: list[tuple[int, dict]] = []

    for id_norma in batch:
        success, metadata = process_one(id_norma)

        if success:
            done_set.add(id_norma)
            # Remove from failed if previously failed
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

    # ── 4. Persist progress + graph ──────────────────────────────────────────
    save_progress(progress)
    _commit_meta(
        f"chore(meta): bulk — progreso {len(done_set)}/{total} leyes procesadas"
    )

    _update_graph(new_graph_entries)

    # ── 5. Rebuild history ───────────────────────────────────────────────────
    n_processed = len(batch)
    n_success = sum(1 for idn in batch if idn in done_set)
    log.info(
        "Batch complete: %d/%d succeeded, %d failed",
        n_success, n_processed, n_processed - n_success,
    )

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
        "=== Done — %d/%d laws total ===",
        len(done_set), total,
    )


if __name__ == "__main__":
    main()
