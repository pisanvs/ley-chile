"""
Daily sync: fetch new norma versions and rebuild chronological history.

Workflow:
  1. Load graph.json from DATA_ROOT
  2. Query LeyChile opt=40 for recently dispatched normas
  3. Add new modificatoria laws that touch primary chain to the graph
  4. Re-trace every law in the graph (idempotent — committed versions are skipped)
  5. Write updated graph.json
  6. Run rebuild_history to rewrite commits in chronological order

Usage:
    python scripts/sync_daily.py
    python scripts/sync_daily.py --dry-run
    python scripts/sync_daily.py --skip-rebuild
    python scripts/sync_daily.py --days 7
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET

# Reuse DATA_ROOT detection, HTTP helpers, and graph operations from trace_graph.
# Both scripts share the same _detect_data_root() logic, so importing trace_graph
# will inherit whatever LEYCHILE_DATA_ROOT is set in the environment.
import trace_graph as tg
import rebuild_history as rh

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Primary chain idNormas: the root law + predecessor seeds defined in trace_graph.
# These are the only laws whose modifier graph is actively maintained.
PRIMARY_IDS: frozenset[int] = frozenset({235507} | set(tg.EXTRA_SEEDS))

LEYCHILE_URL = "https://www.leychile.cl/Consulta/obtxml"


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class SyncResult:
    new_laws: list[int] = field(default_factory=list)          # idNormas added to graph
    new_versions: list[tuple[int, str]] = field(default_factory=list)  # (idNorma, fecha) committed
    errors: list[str] = field(default_factory=list)
    skipped: int = 0  # already-committed versions skipped

    @property
    def changed(self) -> bool:
        return bool(self.new_laws or self.new_versions)


# ---------------------------------------------------------------------------
# Graph I/O
# ---------------------------------------------------------------------------

def load_graph() -> dict:
    """Load graph.json from DATA_ROOT. Returns {} if missing or unreadable."""
    gpath = tg.DATA_ROOT / "graph.json"
    if not gpath.exists():
        return {}
    try:
        raw = json.loads(gpath.read_text(encoding="utf-8"))
        # graph.json stores keys as strings; normalise to int for internal use
        return {int(k): v for k, v in raw.items()}
    except Exception as exc:
        log.warning("Failed to load graph.json: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# opt=40 parsing
# ---------------------------------------------------------------------------

def _parse_recent_response(xml_bytes: bytes) -> list[dict]:
    """
    Parse a LeyChile opt=40 XML response.

    The endpoint returns a container element whose children are Norma elements
    (same schema as opt=7 single-norma responses). Each child is parsed with
    extract_metadata() so the caller gets the same dict shape as the rest of
    the pipeline.  Unrecognised or malformed children are silently skipped.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        log.warning("Could not parse opt=40 response: %s", exc)
        return []

    NS = tg.NS
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag

    # If the root itself is a single Norma treat it as a one-element list.
    candidates: list[ET.Element]
    if tag == "Norma":
        candidates = [root]
    else:
        # Container element — look for namespaced Norma children anywhere in the tree.
        candidates = root.findall(f".//{{{NS}}}Norma")
        if not candidates:
            candidates = root.findall(".//Norma")
        if not candidates:
            candidates = list(root)

    results: list[dict] = []
    for el in candidates:
        try:
            meta = tg.extract_metadata(el)
            if meta.get("idNorma"):
                results.append(meta)
        except Exception:
            continue

    return results


def fetch_recent_normas(days: int = 3) -> list[dict]:
    """
    Fetch recently dispatched normas from LeyChile (opt=40).

    Returns a list of metadata dicts (same shape as extract_metadata()).
    Returns [] on any network or parse failure so the caller can still
    fall back to re-tracing the existing graph.
    """
    try:
        resp = tg._rate_limited_get(LEYCHILE_URL, {"opt": 40})
        return _parse_recent_response(resp.content)
    except Exception as exc:
        log.warning("Could not fetch recent normas (opt=40): %s — continuing without it", exc)
        return []


# ---------------------------------------------------------------------------
# New-modifier detection
# ---------------------------------------------------------------------------

def find_new_modifiers(
    recent: list[dict],
    graph: dict,
    primary_ids: frozenset[int] | set[int] = PRIMARY_IDS,
) -> list[int]:
    """
    Filter a list of recently dispatched norma metadata dicts to those that are:
      - tipo == "Ley"
      - not already in the graph (or KNOWN_RECENT)
      - classified as modificatoria (pre-filter; BCN JSON confirms later)

    Returns a list of idNorma integers to resolve further.
    """
    known_ids: set[int] = set(graph.keys()) | set(tg.KNOWN_RECENT.keys())
    new_ids: list[int] = []
    for meta in recent:
        id_norma = meta.get("idNorma", 0)
        if not id_norma or id_norma in known_ids:
            continue
        if meta.get("tipo", "") != "Ley":
            continue
        if tg.classify(meta.get("titulo", "")) == "modificatoria":
            new_ids.append(id_norma)
    return new_ids


def _resolve_and_add_to_graph(id_norma: int, graph: dict) -> bool:
    """
    Confirm via BCN JSON that a modifier candidate actually touches a primary
    chain law, then add it to the graph with back-links.  Returns True if added.
    """
    try:
        root = tg.fetch_norma_xml(id_norma)
        meta = tg.extract_metadata(root)
    except Exception as exc:
        log.warning("Could not fetch metadata for idNorma=%d: %s", id_norma, exc)
        return False

    numero = meta.get("numero", "")
    if not numero:
        return False

    info = tg.get_bcn_info("ley", numero)
    if info is None:
        log.info("  No BCN data for Ley %s — skipping", numero)
        return False

    # Check whether it modifies at least one primary-chain law
    primary_numeros: set[str] = {
        graph.get(pid, {}).get("numero", "")
        for pid in PRIMARY_IDS
        if pid in graph
    }
    modifies = [
        ref["numero"]
        for ref in info.get("modifiesTo", [])
        if ref.get("numero") in primary_numeros
    ]
    if not modifies:
        log.info("  Ley %s does not modify any primary chain law — skipping", numero)
        return False

    log.info("  Adding Ley %s (modifies: %s) to graph", numero, modifies)
    titulo = meta.get("titulo", "")
    graph[id_norma] = {
        "idNorma": id_norma,
        "numero": numero,
        "titulo": titulo,
        "clasificacion": tg.classify(titulo),
        "fechaPublicacion": meta.get("fechaPublicacion", ""),
        "modifica": modifies,
        "modificadaPor": [],
    }

    # Back-link in each primary chain node's modificadaPor list
    for pid in PRIMARY_IDS:
        pnode = graph.get(pid)
        if pnode and pnode.get("numero") in primary_numeros:
            mods = pnode.setdefault("modificadaPor", [])
            if id_norma not in mods:
                mods.append(id_norma)

    return True


# ---------------------------------------------------------------------------
# Main sync orchestration
# ---------------------------------------------------------------------------

def sync(
    dry_run: bool = False,
    skip_rebuild: bool = False,
    days: int = 3,
) -> SyncResult:
    """
    Run the daily sync. Returns a SyncResult describing what changed.

    Designed to be called from both the CLI (main()) and tests (via mocking
    of tg.fetch_norma_xml, tg.trace_one_law, etc.).
    """
    result = SyncResult()
    log.info("=== Daily sync — DATA_ROOT: %s ===", tg.DATA_ROOT)

    # 1. Load existing graph
    graph = load_graph()
    if not graph:
        log.warning(
            "graph.json not found or empty. "
            "Run trace_graph.py --id <idNorma> --ley <numero> first to bootstrap."
        )
        return result

    log.info("Loaded graph with %d laws", len(graph))

    if dry_run:
        log.info("[dry-run] Would trace %d laws and check opt=40 for new modifiers", len(graph))
        return result

    # 2. Discover new modifier laws via opt=40
    log.info("Fetching recently dispatched normas (last %d days) ...", days)
    recent = fetch_recent_normas(days=days)
    log.info("  opt=40 returned %d normas", len(recent))

    candidates = find_new_modifiers(recent, graph)
    log.info("  %d new modificatoria candidate(s) to evaluate", len(candidates))

    for id_norma in candidates:
        if _resolve_and_add_to_graph(id_norma, graph):
            result.new_laws.append(id_norma)

    # 3. Trace all laws in commit order (idempotent — skips committed versions)
    log.info("Tracing %d laws ...", len(graph))
    for id_norma in tg.commit_order(graph):
        node = graph[id_norma]
        try:
            modifier_map = tg.build_modifier_map(graph, id_norma)
        except Exception as exc:
            log.warning("Could not build modifier_map for idNorma=%d: %s", id_norma, exc)
            modifier_map = {}

        log.info(
            "--- Ley %s (idNorma=%d, %s) ---",
            node.get("numero", "?"), id_norma, node.get("clasificacion", "?"),
        )
        try:
            tg.trace_one_law(id_norma, modifier_map)
        except Exception as exc:
            msg = f"idNorma={id_norma}: {exc}"
            log.error("Failed to trace: %s", msg)
            result.errors.append(msg)

    # 4. Update graph.json
    log.info("Writing graph.json ...")
    try:
        tg.write_graph_json(graph)
    except Exception as exc:
        msg = f"graph.json write: {exc}"
        log.error(msg)
        result.errors.append(msg)

    # 5. Rebuild chronological history
    if not skip_rebuild:
        log.info("Rebuilding chronological history ...")
        try:
            rh.rebuild(dry_run=False)
            log.info("History rebuilt successfully.")
        except SystemExit as exc:
            msg = f"rebuild_history exited with code {exc.code}"
            log.error(msg)
            result.errors.append(msg)
    else:
        log.info("Skipping history rebuild (--skip-rebuild).")

    log.info(
        "=== Sync complete — %d new law(s), %d error(s) ===",
        len(result.new_laws), len(result.errors),
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Daily sync: fetch new norma versions and rebuild chronological history."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be done without fetching or committing.",
    )
    parser.add_argument(
        "--skip-rebuild", action="store_true",
        help="Skip git fast-import history rebuild (useful for incremental runs).",
    )
    parser.add_argument(
        "--days", type=int, default=3, metavar="N",
        help="How many recent days to check via opt=40 (default: 3).",
    )
    args = parser.parse_args()

    result = sync(dry_run=args.dry_run, skip_rebuild=args.skip_rebuild, days=args.days)
    if result.errors:
        log.error("Sync completed with %d error(s) — see log above", len(result.errors))
        sys.exit(1)


if __name__ == "__main__":
    main()
