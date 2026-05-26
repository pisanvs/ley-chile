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
) -> dict:
    """
    Returns:
        D              — highest date where all dated normas up to D are cached
        cached         — total normas with a diffs file in cache_dir/diffs/
        total          — total normas in graph (both dated and undated)
        historial_count — normas with fechaPublicacion <= W
        watermark_advanced — bool: D > W (or D non-empty and W is empty)
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
        diff_path = diffs_dir / f"{id_str}.json"
        if not diff_path.exists():
            return False
        try:
            diffs = json.loads(diff_path.read_text(encoding="utf-8"))
        except Exception:
            return False
        if not isinstance(diffs, list) or not diffs:
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

    total_cached = sum(1 for id_str in all_normas if _diffs_complete(id_str))

    D = ""
    for id_str, fecha in dated:
        if not _diffs_complete(id_str):
            break
        D = fecha

    historial_count = sum(1 for _, fecha in dated if fecha <= W) if W else 0

    if D and W:
        watermark_advanced = D > W
    else:
        watermark_advanced = bool(D)

    return {
        "W": W,
        "D": D,
        "total": total,
        "cached": total_cached,
        "historial_count": historial_count,
        "watermark_advanced": watermark_advanced,
    }


def _write_github_output(stats: dict) -> None:
    """Write key=value pairs to $GITHUB_OUTPUT (if set) and stdout."""
    lines = [
        f"W={stats['W']}",
        f"D={stats['D']}",
        f"watermark_advanced={'true' if stats['watermark_advanced'] else 'false'}",
        f"total_normas={stats['total']}",
        f"cached_normas={stats['cached']}",
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
    if not graph_path.exists():
        print(f"ERROR: graph.json not found at {graph_path}", file=sys.stderr)
        sys.exit(1)

    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    cache_dir = Path(args.cache_dir)

    if args.W_override is not None:
        W = args.W_override
    elif args.historial_dir:
        W = get_historial_watermark(Path(args.historial_dir))
    else:
        W = ""

    stats = compute_watermark(graph, cache_dir, W=W)

    if args.output_env:
        _write_github_output(stats)
    else:
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
