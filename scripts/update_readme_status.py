"""
update_readme_status.py — regenerate the pipeline status block in README.md.

The block lives between HTML comment sentinels:
  <!-- PIPELINE_STATUS_START -->
  ...
  <!-- PIPELINE_STATUS_END -->

Usage:
    python scripts/update_readme_status.py \\
        --readme README.md \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        --historial-dir ./historial
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

START_MARKER = "<!-- PIPELINE_STATUS_START -->"
END_MARKER = "<!-- PIPELINE_STATUS_END -->"


def render_bar(fraction: float, width: int = 20) -> str:
    """Unicode block progress bar."""
    if fraction <= 0:
        return "░" * width
    if fraction >= 1:
        return "█" * width
    filled = round(fraction * width)
    return "█" * filled + "░" * (width - filled)


def update_readme_status(readme_path: Path, stats: dict) -> None:
    """Replace content between sentinel markers with fresh stats."""
    content = readme_path.read_text(encoding="utf-8")

    start_idx = content.find(START_MARKER)
    end_idx = content.find(END_MARKER)
    if start_idx == -1 or end_idx == -1:
        raise ValueError("Pipeline status markers not found in README.md")

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

    new_content = content[:start_idx] + block + content[end_idx + len(END_MARKER):]
    readme_path.write_text(new_content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readme", default="README.md", metavar="PATH")
    parser.add_argument("--graph-path", required=True, metavar="PATH")
    parser.add_argument("--cache-dir", required=True, metavar="PATH")
    parser.add_argument("--historial-dir", metavar="PATH", default=None)
    parser.add_argument("--W", dest="W_override", metavar="DATE", default=None)
    args = parser.parse_args()

    graph = json.loads(Path(args.graph_path).read_text(encoding="utf-8"))
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
