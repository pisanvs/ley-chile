"""
compute_watermark.py — compute the safe historial advance window.

W = last commit date on the historial branch (passed in or read via git log)
D = highest fechaPublicacion such that every dated norma with date <= D
    has its diffs file present in cache_dir/diffs/

Usage:
    python scripts/compute_watermark.py \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        --historial-dir ./historial \\
        [--output-env]   # write W/D/stats to $GITHUB_OUTPUT

Exit code 0 on success. Exits 1 if graph.json is missing.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import find_diff_path, graph_exists, load_diff_file, load_graph  # noqa: E402


def get_historial_watermark(historial_dir: Path) -> str:
    """Return YYYY-MM-DD of the most recent commit on historial, or '' if empty."""
    result = subprocess.run(
        ["git", "log", "--format=%ci", "-1"],
        cwd=str(historial_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return ""
    return result.stdout.strip()[:10]


def compute_watermark(
    graph: dict,
    cache_dir: Path,
    W: str,
    historial_dir: Path | None = None,
) -> dict:
    """Compute the diffs-side completion frontier.

    With build_history --rebuild, historial is a derived artifact regenerated
    each run from the diffs cache.  W (last commit date on historial) is no
    longer load-bearing for advance decisions — it's reported for visibility
    only.  watermark_advanced fires whenever D is non-empty (there's any
    complete prefix of dated normas to rebuild from).

    Returns:
        D                  — highest date where every dated norma <= D has a
                             complete diffs file (entries + version JSONs).
        cached             — total normas with complete diffs in cache_dir/diffs/.
        total              — total normas in graph.
        historial_count    — number of <type>/<numero>/metadata.json files
                             actually present in historial_dir (0 if not given).
                             Replaces the previous misleading "graph entries
                             with fechaPublicacion <= W" projection.
        watermark_advanced — bool(D).  Rebuild whenever there's any complete
                             data; the build itself is deterministic and
                             idempotent so re-running is cheap if nothing
                             changed.
        W                  — informational; the last historial commit date.
    """
    diffs_dir = cache_dir / "diffs"
    versions_dir = cache_dir / "versions"

    # All normas in graph (for counting total and cached)
    all_normas = list(graph.keys())
    total = len(all_normas)

    # Only dated normas (for D and historial_count)
    dated = sorted(
        [
            (id_str, node["fechaPublicacion"])
            for id_str, node in graph.items()
            if node.get("fechaPublicacion")
        ],
        key=lambda t: t[1],
    )

    def _diffs_complete(id_str: str) -> bool:
        diff_path = find_diff_path(diffs_dir, id_str)
        if diff_path is None:
            # Zero-vigencia stubs (e.g. SPARQL placeholders LeyChile doesn't
            # serve) are skipped by fetch_versions, so the absence of a diff
            # file is expected. Treat them as complete — nothing to fetch.
            node = graph.get(id_str) or {}
            if "vigencias" in node and not node["vigencias"]:
                return True
            return False
        try:
            diffs = load_diff_file(diff_path)
        except Exception:
            return False
        if not isinstance(diffs, list):
            return False
        if not diffs:
            # Empty diff list is correct when every vigencia is a sentinel
            # date (year > 2100, e.g. LeyChile's open-ended "2222-02-02").
            # fetch_versions filters those out before writing versions but
            # still emits the diff stub. Treat as complete in that case.
            node = graph.get(id_str) or {}
            vigs = node.get("vigencias", [])
            if vigs and all(
                v.get("desde", "")[:4].isdigit() and int(v["desde"][:4]) > 2100
                for v in vigs
            ):
                return True
            return False
        base_dir = versions_dir / str(id_str)
        for entry in diffs:
            if not isinstance(entry, dict):
                return False
            fecha = entry.get("fecha", "")
            if not fecha:
                return False
            if not (base_dir / f"{fecha}.json").exists():
                return False
        return True

    complete_set = {id_str for id_str in all_normas if _diffs_complete(id_str)}
    total_cached = len(complete_set)
    missing_ids = sorted(set(all_normas) - complete_set, key=lambda x: int(x) if x.isdigit() else 0)

    D = ""
    for id_str, fecha in dated:
        if not _diffs_complete(id_str):
            break
        D = fecha

    if historial_dir is not None and historial_dir.is_dir():
        # Real count: dirs that have a metadata.json under any norma type.
        historial_count = sum(1 for _ in historial_dir.glob("*/*/metadata.json"))
    else:
        historial_count = 0

    # cache_complete: every norma in the graph has a complete diffs file.
    # This is the correctness gate — historial should only be built when True.
    cache_complete = total_cached == total

    # watermark_advanced: any complete prefix exists to rebuild from.
    watermark_advanced = bool(D)

    return {
        "W": W,
        "D": D,
        "total": total,
        "cached": total_cached,
        "missing": len(missing_ids),
        "cache_complete": cache_complete,
        "historial_count": historial_count,
        "watermark_advanced": watermark_advanced,
        # Only include missing IDs list when it's small to avoid huge JSON blobs.
        "missing_ids_sample": missing_ids[:50] if missing_ids else [],
    }


def _write_github_output(stats: dict) -> None:
    """Write key=value pairs to $GITHUB_OUTPUT (if set) and stdout."""
    lines = [
        f"W={stats['W']}",
        f"D={stats['D']}",
        f"watermark_advanced={'true' if stats['watermark_advanced'] else 'false'}",
        f"cache_complete={'true' if stats['cache_complete'] else 'false'}",
        f"total_normas={stats['total']}",
        f"cached_normas={stats['cached']}",
        f"missing_normas={stats['missing']}",
        f"historial_count={stats['historial_count']}",
    ]
    for line in lines:
        print(line)
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph-path", required=True, metavar="PATH")
    parser.add_argument("--cache-dir", required=True, metavar="PATH")
    parser.add_argument("--historial-dir", metavar="PATH", default=None)
    parser.add_argument("--W", dest="W_override", metavar="DATE", default=None,
                        help="Override W instead of reading from historial git log")
    parser.add_argument("--output-env", action="store_true",
                        help="Write stats to $GITHUB_OUTPUT and stdout")
    args = parser.parse_args()

    graph_path = Path(args.graph_path)
    if not graph_exists(graph_path):
        print(f"ERROR: graph not found at {graph_path} (no graph_shards/ or graph.json)", file=sys.stderr)
        sys.exit(1)

    graph = load_graph(graph_path)
    cache_dir = Path(args.cache_dir)

    if args.W_override is not None:
        W = args.W_override
    elif args.historial_dir:
        W = get_historial_watermark(Path(args.historial_dir))
    else:
        W = ""

    historial_dir = Path(args.historial_dir) if args.historial_dir else None
    stats = compute_watermark(graph, cache_dir, W=W, historial_dir=historial_dir)

    if args.output_env:
        _write_github_output(stats)
    else:
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
