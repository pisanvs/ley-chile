"""
update_readme_status.py — regenerate a status block in README.md.

Two independent sections live between HTML comment sentinels:

  Pipeline status (Historial + Cache — written by fetch-and-build.yml):
    <!-- PIPELINE_STATUS_START -->
    ...
    <!-- PIPELINE_STATUS_END -->

  Graph build status (fetch_normas progress — written by update-graph.yml):
    <!-- GRAPH_STATUS_START -->
    ...
    <!-- GRAPH_STATUS_END -->

The two sections are updated by separate workflows: update-graph.yml has no
historial worktree, so it touches *only* the graph section and leaves the
pipeline section untouched.

Usage:
    # Pipeline section (default):
    python scripts/update_readme_status.py \\
        --readme README.md \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        --historial-dir ./historial

    # Graph / fetch_normas section:
    python scripts/update_readme_status.py --section graph \\
        --readme README.md \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        --catalog-path ./catalog.json
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from compute_watermark import compute_watermark, get_historial_watermark  # noqa: E402
from utils import load_graph  # noqa: E402

START_MARKER = "<!-- PIPELINE_STATUS_START -->"
END_MARKER = "<!-- PIPELINE_STATUS_END -->"

GRAPH_START_MARKER = "<!-- GRAPH_STATUS_START -->"
GRAPH_END_MARKER = "<!-- GRAPH_STATUS_END -->"


def render_bar(fraction: float, width: int = 20) -> str:
    """Unicode block progress bar."""
    if fraction <= 0:
        return "░" * width
    if fraction >= 1:
        return "█" * width
    filled = round(fraction * width)
    return "█" * filled + "░" * (width - filled)


def _replace_section(
    readme_path: Path, start_marker: str, end_marker: str, block: str
) -> None:
    """Replace content between a pair of sentinel markers with `block`."""
    content = readme_path.read_text(encoding="utf-8")

    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    if start_idx == -1 or end_idx == -1:
        raise ValueError(f"{start_marker} / {end_marker} markers not found in README.md")

    new_content = content[:start_idx] + block + content[end_idx + len(end_marker):]
    readme_path.write_text(new_content, encoding="utf-8")


def load_catalog_count(catalog_path: Path) -> tuple[int, bool]:
    """Return (total_entries, complete) for catalog.json (list or dict form)."""
    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return len(raw), True
    entries = raw.get("entries", [])
    return len(entries), bool(raw.get("complete", False))


def update_readme_status(readme_path: Path, stats: dict) -> None:
    """Replace content between sentinel markers with fresh stats."""
    total = stats["total"] or 1  # avoid division by zero
    hist_pct = stats["historial_count"] / total
    cache_pct = stats["cached"] / total
    W = stats["W"] or "—"
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    block = (
        f"{START_MARKER}\n"
        f"## Pipeline Status\n"
        f"| | |\n"
        f"|---|---|\n"
        f"| **Historial** | `{render_bar(hist_pct)}` {hist_pct:.0%}"
        f" · watermark {W} · {stats['historial_count']:,} normas |\n"
        f"| **Cache**     | `{render_bar(cache_pct)}` {cache_pct:.0%}"
        f" · {stats['cached']:,} / {stats['total']:,} normas fetched |\n"
        f"| **Last run**  | {now} |\n"
        f"{END_MARKER}"
    )

    _replace_section(readme_path, START_MARKER, END_MARKER, block)


def update_graph_status(
    readme_path: Path, graph_count: int, catalog_total: int, catalog_complete: bool
) -> None:
    """Replace the GRAPH_STATUS section with fetch_normas progress."""
    denom = catalog_total or 1  # avoid division by zero
    pct = min(graph_count / denom, 1.0)
    # Mirrors the publish gate in update-graph.yml: 95% fetched + catalog done.
    ready = catalog_complete and catalog_total and graph_count >= catalog_total * 0.95
    state = "complete ✅" if ready else "fetching…"
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    block = (
        f"{GRAPH_START_MARKER}\n"
        f"## Graph Build Status\n"
        f"| | |\n"
        f"|---|---|\n"
        f"| **Fetch normas** | `{render_bar(pct)}` {pct:.0%}"
        f" · {graph_count:,} / {catalog_total:,} normas · {state} |\n"
        f"| **Last run**     | {now} |\n"
        f"{GRAPH_END_MARKER}"
    )

    _replace_section(readme_path, GRAPH_START_MARKER, GRAPH_END_MARKER, block)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readme", default="README.md", metavar="PATH")
    parser.add_argument("--graph-path", required=True, metavar="PATH")
    parser.add_argument("--cache-dir", metavar="PATH", default=None)
    parser.add_argument("--catalog-path", metavar="PATH", default="catalog.json")
    parser.add_argument("--historial-dir", metavar="PATH", default=None)
    parser.add_argument("--section", choices=["pipeline", "graph"], default="pipeline",
                        help="Which README section to update")
    parser.add_argument("--W", dest="W_override", metavar="DATE", default=None)
    args = parser.parse_args()

    graph = load_graph(Path(args.graph_path))

    if args.section == "graph":
        catalog_total, catalog_complete = load_catalog_count(Path(args.catalog_path))
        graph_count = len(graph)
        update_graph_status(Path(args.readme), graph_count, catalog_total, catalog_complete)
        print(f"README graph status updated — fetch_normas {graph_count}/{catalog_total}"
              f" ({graph_count / (catalog_total or 1):.0%})"
              f", catalog_complete={catalog_complete}")
        return

    if not args.cache_dir:
        parser.error("--cache-dir is required for --section pipeline")
    cache_dir = Path(args.cache_dir)

    if args.W_override is not None:
        W = args.W_override
    elif args.historial_dir:
        W = get_historial_watermark(Path(args.historial_dir))
    else:
        W = ""

    stats = compute_watermark(graph, cache_dir, W=W)
    update_readme_status(Path(args.readme), stats)
    print(f"README updated — historial {stats['historial_count']}/{stats['total']}"
          f" ({stats['historial_count'] / (stats['total'] or 1):.0%})"
          f", cache {stats['cached']}/{stats['total']}"
          f" ({stats['cached'] / (stats['total'] or 1):.0%})")


if __name__ == "__main__":
    main()
