"""
verify_pipeline.py — honest pipeline reporter.

Compares REAL artifact counts on disk (catalog entries, graph nodes, cache
files, historial metadata.json files) and surfaces internal inconsistencies
(corrupt cache, stale historial, orphan references).  Replaces the
self-reported progress numbers that have lied repeatedly during development.

Output: JSON to stdout, deterministic given the same inputs.

Exit codes:
  0 — all observed counts are internally consistent.
  1 — at least one inconsistency detected (details in `inconsistencies`).
  2 — an input artifact was missing (catalog/graph not found).

Usage:
    python scripts/verify_pipeline.py \\
        --catalog-path ./catalog.json \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        [--historial-dir ./historial]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import (  # noqa: E402
    diff_id_from_path,
    graph_exists,
    iter_diff_files,
    load_diff_file,
    load_graph,
)


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def _load_catalog(catalog_path: Path) -> tuple[list[dict], bool]:
    """Return (entries, complete).  Tolerates plain-list legacy format."""
    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return raw, True
    entries = raw.get("entries", [])
    return entries, bool(raw.get("complete", False))


# ---------------------------------------------------------------------------
# Inconsistency detectors
# ---------------------------------------------------------------------------

def _check_cache_completeness(cache_dir: Path) -> tuple[int, int, list[str]]:
    """For each diffs/{id}.json, every entry's `fecha` must have a
    matching versions/{id}/{fecha}.json on disk.

    Returns (diff_file_count, version_file_count, list_of_missing_pairs).
    """
    diffs_dir = cache_dir / "diffs"
    versions_dir = cache_dir / "versions"
    diff_files = list(iter_diff_files(diffs_dir))
    inconsistencies: list[str] = []
    for diff_file in diff_files:
        id_str = diff_id_from_path(diff_file)
        try:
            entries = load_diff_file(diff_file)
        except (json.JSONDecodeError, OSError) as exc:
            inconsistencies.append(f"corrupt diff file: {id_str} ({exc})")
            continue
        if not isinstance(entries, list):
            inconsistencies.append(f"diff file not a list: {id_str}")
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            fecha = entry.get("fecha", "")
            if not fecha:
                continue
            if not (versions_dir / id_str / f"{fecha}.json").exists():
                inconsistencies.append(
                    f"diff references missing version: {id_str}/{fecha}"
                )

    version_files = (
        sum(1 for _ in versions_dir.glob("*/*.json"))
        if versions_dir.is_dir() else 0
    )
    return len(diff_files), version_files, inconsistencies


def _check_historial_against_graph(
    historial_dir: Path, graph_ids: set[str]
) -> tuple[int, list[str]]:
    """Each metadata.json under historial must reference an idNorma that's in
    the current graph.  Stale entries (norma removed from graph but still in
    historial) are reported.  Returns (real_dir_count, inconsistencies).
    """
    inconsistencies: list[str] = []
    real_dirs = 0
    for meta in historial_dir.glob("*/*/metadata.json"):
        real_dirs += 1
        try:
            payload = json.loads(meta.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            inconsistencies.append(f"unreadable metadata.json: {meta.relative_to(historial_dir)}")
            continue
        id_norma = str(payload.get("idNorma", "")) if isinstance(payload, dict) else ""
        if id_norma and id_norma not in graph_ids:
            inconsistencies.append(
                f"historial has stale norma not in graph: {id_norma} "
                f"({meta.relative_to(historial_dir)})"
            )
    return real_dirs, inconsistencies


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def gather_report(
    catalog_path: Path,
    graph_path: Path,
    cache_dir: Path,
    historial_dir: Path | None = None,
) -> dict:
    """Build the full report dict.  Pure read-only operation."""
    entries, complete = _load_catalog(catalog_path)
    catalog_ids = {str(e["idNorma"]) for e in entries if isinstance(e, dict) and "idNorma" in e}

    graph = load_graph(graph_path) if graph_exists(graph_path) else {}
    graph_ids = set(graph.keys())

    diff_count, version_count, cache_issues = _check_cache_completeness(cache_dir)

    inconsistencies: list[str] = list(cache_issues)

    # Cross-check: graph nodes that aren't in the catalog (orphan metadata).
    catalog_orphans = sorted(graph_ids - catalog_ids)
    if catalog_orphans:
        inconsistencies.append(
            f"graph has {len(catalog_orphans)} nodes not in catalog (e.g. {catalog_orphans[:3]})"
        )

    historial_count = 0
    if historial_dir is not None and historial_dir.is_dir():
        historial_count, hist_issues = _check_historial_against_graph(
            historial_dir, graph_ids
        )
        inconsistencies.extend(hist_issues)

    # Deterministic ordering for downstream consumers (README, CI logs).
    inconsistencies.sort()

    return {
        "catalog": {
            "entries": len(entries),
            "complete": complete,
        },
        "graph": {
            "nodes": len(graph),
        },
        "cache": {
            "diff_files": diff_count,
            "version_files": version_count,
        },
        "historial": {
            "norma_dirs": historial_count,
        },
        "inconsistencies": inconsistencies,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-path", required=True, metavar="PATH")
    parser.add_argument("--graph-path", required=True, metavar="PATH")
    parser.add_argument("--cache-dir", required=True, metavar="PATH")
    parser.add_argument("--historial-dir", metavar="PATH", default=None)
    args = parser.parse_args()

    catalog_path = Path(args.catalog_path)
    graph_path = Path(args.graph_path)
    cache_dir = Path(args.cache_dir)
    historial_dir = Path(args.historial_dir) if args.historial_dir else None

    if not catalog_path.exists():
        print(json.dumps({"error": f"catalog not found at {catalog_path}"}), file=sys.stderr)
        sys.exit(2)
    if not graph_exists(graph_path):
        print(json.dumps({"error": f"graph not found at {graph_path}"}), file=sys.stderr)
        sys.exit(2)

    report = gather_report(
        catalog_path=catalog_path,
        graph_path=graph_path,
        cache_dir=cache_dir,
        historial_dir=historial_dir,
    )

    # JSON to stdout, sorted keys for deterministic byte output.
    print(json.dumps(report, indent=2, sort_keys=True))
    sys.exit(0 if not report["inconsistencies"] else 1)


if __name__ == "__main__":
    main()
