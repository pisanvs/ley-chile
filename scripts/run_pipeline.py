"""
End-to-end pipeline: build graph → fetch texts → rebuild history → notify.

Each phase is idempotent — re-running picks up where it left off.
Designed to run unattended on any server (nohup / tmux / systemd).

Usage:
    # Full pipeline (graph already built from previous run, skip graph phase)
    LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py --skip-graph \\
        --notify-url https://ntfy.sh/YOUR_TOPIC

    # From scratch with custom seeds
    LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py \\
        --seeds 235507 29815 30733 \\
        --notify-url https://ntfy.sh/YOUR_TOPIC

    # Background (nohup):
    nohup LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py \\
        --skip-graph --notify-url https://ntfy.sh/YOUR_TOPIC > pipeline.log 2>&1 &

ntfy.sh notification: subscribe at https://ntfy.sh/YOUR_TOPIC in a browser or
the ntfy mobile app.  Pick a random topic name to keep it private.
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path
import sys

import requests

sys.path.insert(0, str(Path(__file__).parent))
import trace_graph as tg
import rebuild_history as rh
import build_graph as bg
import fetch_texts as ft

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DEFAULT_SEEDS = [235507, 29815, 30733]   # ley 20000, ley 18403, ley 19366


def _notify(url: str, message: str) -> None:
    if not url:
        return
    try:
        requests.post(url, data=message.encode(), timeout=10)
    except Exception as exc:
        log.warning("Notification failed: %s", exc)


def _phase(name: str, fn, notify_url: str) -> None:
    log.info("")
    log.info("=" * 60)
    log.info("PHASE: %s", name)
    log.info("=" * 60)
    t0 = time.monotonic()
    try:
        fn()
    except SystemExit as exc:
        if exc.code not in (0, None):
            msg = f"ley-chile ERROR in phase {name} (exit {exc.code})"
            log.error(msg)
            _notify(notify_url, msg)
            raise
    elapsed = time.monotonic() - t0
    log.info("Phase [%s] done in %.1f min", name, elapsed / 60)
    _notify(notify_url, f"ley-chile [{name}] done in {elapsed/60:.1f} min")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--seeds", type=int, nargs="+", default=DEFAULT_SEEDS, metavar="IDNORMA",
        help="Seed idNormas for SPARQL BFS (default: ley 20000, 18403, 19366)",
    )
    parser.add_argument(
        "--notify-url", default="",
        help="ntfy.sh or other webhook URL (e.g. https://ntfy.sh/my-topic)",
    )
    parser.add_argument(
        "--skip-graph", action="store_true",
        help="Skip graph-building phase (graph.json already complete)",
    )
    parser.add_argument(
        "--skip-fetch", action="store_true",
        help="Skip text-fetching phase",
    )
    parser.add_argument(
        "--skip-rebuild", action="store_true",
        help="Skip final history rebuild",
    )
    parser.add_argument(
        "--concurrency", type=int, default=1,
        help="Parallel fetch workers (default 1; max 2 to respect LeyChile rate limit)",
    )
    args = parser.parse_args()

    log.info("=== ley-chile run_pipeline ===")
    log.info("DATA_ROOT  : %s", tg.DATA_ROOT)
    log.info("Seeds      : %s", args.seeds)
    log.info("Concurrency: %d", args.concurrency)
    log.info("Notify URL : %s", args.notify_url or "(none)")
    _notify(args.notify_url, f"ley-chile pipeline started — seeds {args.seeds}")

    t_total = time.monotonic()

    # Phase 1 — Build complete relationship graph via SPARQL BFS
    if not args.skip_graph:
        _phase("build_graph", lambda: bg.build(args.seeds), args.notify_url)
    else:
        log.info("Skipping build_graph (--skip-graph)")

    graph = ft.load_graph()
    log.info("Graph: %d laws", len(graph))

    # Phase 2 — Fetch law texts from LeyChile
    if not args.skip_fetch:
        _phase(
            "fetch_texts",
            lambda: ft.run(notify_url=args.notify_url, concurrency=args.concurrency),
            args.notify_url,
        )
    else:
        log.info("Skipping fetch_texts (--skip-fetch)")

    # Phase 3 — Rebuild chronological git history via fast-import
    if not args.skip_rebuild:
        _phase("rebuild_history", lambda: rh.rebuild(dry_run=False), args.notify_url)
    else:
        log.info("Skipping rebuild_history (--skip-rebuild)")

    elapsed = time.monotonic() - t_total
    done = len(set(ft.load_progress().get("done", [])))
    summary = (
        f"ley-chile pipeline COMPLETE in {elapsed/60:.1f} min — "
        f"{done}/{len(graph)} laws committed"
    )
    log.info(summary)
    _notify(args.notify_url, summary)


if __name__ == "__main__":
    main()
