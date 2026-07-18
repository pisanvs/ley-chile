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
import math
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from compute_watermark import get_historial_watermark  # noqa: E402
from utils import load_graph  # noqa: E402
from verify_pipeline import gather_report  # noqa: E402

START_MARKER = "<!-- PIPELINE_STATUS_START -->"
END_MARKER = "<!-- PIPELINE_STATUS_END -->"

GRAPH_START_MARKER = "<!-- GRAPH_STATUS_START -->"
GRAPH_END_MARKER = "<!-- GRAPH_STATUS_END -->"


def render_bar(fraction: float, width: int = 20) -> str:
    """Unicode block progress bar.

    Uses floor (int), NOT round, for the fill so an incomplete corpus never
    displays as full: at 99.7% round() would fill all 20 blocks and read as
    done, hiding the missing normas. Only a fraction >= 1.0 (genuinely
    complete) renders a full bar.
    """
    if fraction <= 0:
        return "░" * width
    if fraction >= 1:
        return "█" * width
    filled = int(fraction * width)  # floor: 0.997 * 20 -> 19, leaves a gap
    return "█" * filled + "░" * (width - filled)


def fmt_pct(fraction: float) -> str:
    """Honest integer percentage: floor, and only '100%' when truly complete.

    Mirrors render_bar so the number and the bar agree. 99.7% reads as '99%',
    not a rounded-up '100%' that hides an incomplete corpus.
    """
    if fraction >= 1:
        return "100%"
    if fraction <= 0:
        return "0%"
    # round(...,6) first so exact ratios like 58/100 (which float to
    # 57.9999999999) don't floor down to 57; 99.7 stays 99, never 100.
    return f"{math.floor(round(fraction * 100, 6))}%"


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
    """Replace content between sentinel markers with fresh stats.

    `total` is the count of BUILDABLE normas (dated, non-sentinel, >=1 real
    vigencia), NOT raw catalog.entries — so 100% is actually reachable. The
    ~19k structurally un-buildable normas are reported as `excluded`.
    """
    total = stats["total"] or 1  # avoid division by zero
    excluded = stats.get("excluded", 0)
    hist_pct = min(stats["historial_count"] / total, 1.0)
    cache_pct = min(stats["cached"] / total, 1.0)
    W = stats["W"] or "—"
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    excluded_note = f" · {excluded:,} excluded (undated/sentinel)" if excluded else ""

    block = (
        f"{START_MARKER}\n"
        f"## Pipeline Status\n"
        f"| | |\n"
        f"|---|---|\n"
        f"| **Historial** | `{render_bar(hist_pct)}` {fmt_pct(hist_pct)}"
        f" · watermark {W} · {stats['historial_count']:,} / {stats['total']:,} buildable"
        f"{excluded_note} |\n"
        f"| **Cache**     | `{render_bar(cache_pct)}` {fmt_pct(cache_pct)}"
        f" · {stats['cached']:,} / {stats['total']:,} buildable fetched |\n"
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
        f"| **Fetch normas** | `{render_bar(pct)}` {fmt_pct(pct)}"
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

    historial_dir = Path(args.historial_dir) if args.historial_dir else None

    # Source REAL counts from verify_pipeline (honest reporter) so the README
    # reflects on-disk artifacts.  The denominator is `catalog.entries` (the
    # only target that's meaningful for "how complete is the pipeline?"),
    # the historial bar shows real metadata.json count, and the cache bar
    # shows actual diff files.  W is just for the watermark date label.
    report = gather_report(
        catalog_path=Path(args.catalog_path),
        graph_path=Path(args.graph_path),
        cache_dir=cache_dir,
        historial_dir=historial_dir,
    )
    # Denominator is BUILDABLE normas, not raw catalog.entries: ~19k catalog
    # entries are undated / sentinel-dated / zero-vigencia and can NEVER be
    # built, so using catalog.entries structurally caps the bar below 100%.
    buildable = report["graph"].get("buildable", 0)
    catalog_entries = report["catalog"]["entries"]
    excluded = max(catalog_entries - buildable, 0)
    stats = {
        "W": W,
        "D": "",  # no longer driving advance decisions; omitted from the bar
        "total": buildable,
        "excluded": excluded,
        "catalog_entries": catalog_entries,
        "cached": report["cache"]["diff_files"],
        "historial_count": report["historial"]["norma_dirs"],
    }
    update_readme_status(Path(args.readme), stats)
    _denom = stats["total"] or 1
    print(f"README updated — historial {stats['historial_count']}/{stats['total']} buildable"
          f" ({fmt_pct(stats['historial_count'] / _denom)})"
          f", cache {stats['cached']}/{stats['total']}"
          f" ({fmt_pct(stats['cached'] / _denom)})"
          f", excluded {excluded:,} (undated/sentinel), catalog {catalog_entries:,}")
    if report["inconsistencies"]:
        # Print to stderr — visible in CI logs without breaking the success path.
        # (verify_pipeline.py is the place to exit non-zero on these; this script's
        # job is just to update the README.)
        print(
            f"  warning: {len(report['inconsistencies'])} pipeline inconsistency(ies) detected",
            file=sys.stderr,
        )
        for item in report["inconsistencies"][:5]:
            print(f"    - {item}", file=sys.stderr)


if __name__ == "__main__":
    main()
