"""
End-to-end pipeline orchestrator — 4 phases:

  Phase 1: build_catalog   →  catalog.json
  Phase 2: fetch_normas    →  graph.json + cache/normas/
  Phase 3: fetch_versions  →  cache/versions/ + cache/diffs/ + versiones.json
  Phase 4: build_history   →  git history on historial branch

Each phase is idempotent — re-running picks up where it left off.
Designed to run unattended (nohup / tmux / systemd).

Usage:
    # Full pipeline (recommended)
    LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py \\
        --notify-url https://ntfy.sh/YOUR_TOPIC

    # Skip catalog if catalog.json is fresh
    python scripts/run_pipeline.py --skip-catalog --notify-url https://ntfy.sh/YOUR_TOPIC

    # Test with limited normas
    python scripts/run_pipeline.py --limit 50

    # Background (nohup):
    nohup python scripts/run_pipeline.py --notify-url https://ntfy.sh/YOUR_TOPIC \\
        > pipeline.log 2>&1 &

ntfy.sh: subscribe at https://ntfy.sh/YOUR_TOPIC in a browser or the ntfy mobile app.
Pick a random topic name to keep it private.
"""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys
import time
from pathlib import Path

try:
    import requests as _requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

SCRIPTS_DIR = Path(__file__).parent.resolve()


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def _notify(url: str, title: str, message: str) -> None:
    """Fire-and-forget ntfy.sh notification — errors are silently ignored."""
    if not url or not _HAS_REQUESTS:
        return
    try:
        _requests.post(url, json={"title": title, "message": message}, timeout=5)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Phase runner
# ---------------------------------------------------------------------------

def _run_phase(
    name: str,
    cmd: list[str],
    notify_url: str,
    fail_fast: bool = True,
) -> bool:
    """
    Run one pipeline phase via subprocess.

    Returns True on success, False on failure.
    Raises SystemExit if fail_fast=True and the phase fails.
    """
    log.info("")
    log.info("=" * 60)
    log.info("PHASE: %s", name)
    log.info("CMD  : %s", " ".join(cmd))
    log.info("=" * 60)

    _notify(notify_url, f"ley-chile [{name}] started", " ".join(cmd))
    t0 = time.monotonic()

    try:
        result = subprocess.run(cmd, check=False)
    except Exception as exc:
        elapsed = time.monotonic() - t0
        msg = f"Failed to launch phase {name}: {exc}"
        log.error(msg)
        _notify(notify_url, f"ley-chile [{name}] ERROR", msg)
        if fail_fast:
            sys.exit(1)
        return False

    elapsed = time.monotonic() - t0

    if result.returncode != 0:
        msg = f"Phase {name} exited with code {result.returncode}"
        log.error(msg)
        _notify(notify_url, f"ley-chile [{name}] FAILED", msg)
        if fail_fast:
            sys.exit(result.returncode)
        return False

    log.info("Phase [%s] done in %.1f min", name, elapsed / 60)
    _notify(
        notify_url,
        f"ley-chile [{name}] done",
        f"Completed in {elapsed / 60:.1f} min",
    )
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Skip flags
    parser.add_argument("--skip-catalog",  action="store_true", help="Skip phase 1 (build_catalog)")
    parser.add_argument("--skip-normas",   action="store_true", help="Skip phase 2 (fetch_normas)")
    parser.add_argument("--skip-versions", action="store_true", help="Skip phase 3 (fetch_versions)")
    parser.add_argument("--skip-history",  action="store_true", help="Skip phase 4 (build_history)")

    # Early-exit shortcut
    parser.add_argument("--only-catalog",  action="store_true", help="Run only phase 1 then exit")

    # Common options
    parser.add_argument(
        "--data-root", metavar="PATH",
        help="Override DATA_ROOT (default: auto-detect via detect_data_root())",
    )
    parser.add_argument(
        "--limit", type=int, metavar="N",
        help="Pass --limit N to fetch_normas and fetch_versions (for testing)",
    )
    parser.add_argument(
        "--notify-url", default="",
        metavar="URL",
        help="ntfy.sh or other webhook URL (e.g. https://ntfy.sh/my-topic)",
    )

    # build_history options
    parser.add_argument("--dry-run",   action="store_true", help="Pass --dry-run to build_history")
    parser.add_argument(
        "--enrichers", metavar="LIST",
        help="Pass --enrichers LIST to build_history (default: tramitacion)",
    )
    parser.add_argument("--append",    action="store_true", help="Pass --append to build_history")

    args = parser.parse_args()

    python = sys.executable

    # ------------------------------------------------------------------
    # Header
    # ------------------------------------------------------------------
    log.info("=== ley-chile run_pipeline ===")
    log.info("Python     : %s", python)
    log.info("Data root  : %s", args.data_root or "(auto-detect)")
    log.info("Notify URL : %s", args.notify_url or "(none)")
    log.info("Limit      : %s", args.limit or "(all)")

    _notify(args.notify_url, "ley-chile pipeline started", f"data_root={args.data_root or 'auto'}")

    t_total = time.monotonic()
    failed_phase: str | None = None

    # ------------------------------------------------------------------
    # Helper: build base args for a script
    # ------------------------------------------------------------------
    def _base(script: str) -> list[str]:
        cmd = [python, str(SCRIPTS_DIR / script)]
        if args.data_root:
            cmd += ["--data-root", args.data_root]
        return cmd

    # ------------------------------------------------------------------
    # Phase 1: build_catalog
    # ------------------------------------------------------------------
    if args.only_catalog or not args.skip_catalog:
        cmd = _base("build_catalog.py")
        ok = _run_phase("build_catalog", cmd, args.notify_url)
        if not ok:
            failed_phase = "build_catalog"
    else:
        log.info("Skipping phase 1 (build_catalog) — --skip-catalog")

    if args.only_catalog:
        _finish(None, t_total, args.notify_url)
        return

    if failed_phase:
        _finish(failed_phase, t_total, args.notify_url)
        return

    # ------------------------------------------------------------------
    # Phase 2: fetch_normas
    # ------------------------------------------------------------------
    if not args.skip_normas:
        cmd = _base("fetch_normas.py")
        if args.limit:
            cmd += ["--limit", str(args.limit)]
        ok = _run_phase("fetch_normas", cmd, args.notify_url)
        if not ok:
            failed_phase = "fetch_normas"
    else:
        log.info("Skipping phase 2 (fetch_normas) — --skip-normas")

    if failed_phase:
        _finish(failed_phase, t_total, args.notify_url)
        return

    # ------------------------------------------------------------------
    # Phase 3: fetch_versions
    # ------------------------------------------------------------------
    if not args.skip_versions:
        cmd = _base("fetch_versions.py")
        if args.limit:
            cmd += ["--limit", str(args.limit)]
        ok = _run_phase("fetch_versions", cmd, args.notify_url)
        if not ok:
            failed_phase = "fetch_versions"
    else:
        log.info("Skipping phase 3 (fetch_versions) — --skip-versions")

    if failed_phase:
        _finish(failed_phase, t_total, args.notify_url)
        return

    # ------------------------------------------------------------------
    # Phase 4: build_history
    # ------------------------------------------------------------------
    if not args.skip_history:
        cmd = _base("build_history.py")
        if args.dry_run:
            cmd.append("--dry-run")
        if args.enrichers:
            cmd += ["--enrichers", args.enrichers]
        if args.append:
            cmd.append("--append")
        ok = _run_phase("build_history", cmd, args.notify_url)
        if not ok:
            failed_phase = "build_history"
    else:
        log.info("Skipping phase 4 (build_history) — --skip-history")

    # ------------------------------------------------------------------
    # Final summary
    # ------------------------------------------------------------------
    _finish(failed_phase, t_total, args.notify_url)


def _finish(failed_phase: str | None, t_total: float, notify_url: str) -> None:
    elapsed = time.monotonic() - t_total
    if failed_phase:
        msg = f"Pipeline FAILED at phase {failed_phase} — {elapsed / 60:.1f} min elapsed"
        log.error(msg)
        _notify(notify_url, "ley-chile pipeline FAILED", msg)
        sys.exit(1)
    else:
        msg = f"Pipeline complete in {elapsed / 60:.1f} min"
        log.info(msg)
        _notify(notify_url, "ley-chile pipeline complete", msg)


if __name__ == "__main__":
    main()
