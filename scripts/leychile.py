#!/usr/bin/env python3
"""leychile — the ley-chile pipeline CLI.

Single entrypoint for every pipeline operation. Works identically
in any environment: local dev, GitHub Actions, Docker, or bare server.

Commands
--------
  fetch-graph     Refresh catalog + norma graph (BCN SPARQL → graph_shards/)
  fetch-versions  Fetch per-norma version data and compute article diffs
  build           Generate historial git branch from the diffs cache
  verify          Verify pipeline artifact integrity and report inconsistencies
  status          Show pipeline watermark and completion statistics
  pipeline        Run all phases end-to-end (fetch-graph skipped if fresh)

Environment variables
---------------------
  LEYCHILE_DATA_ROOT   Data root directory.
                       Default: auto-detect (./historial worktree, then .)
  LEYCHILE_CACHE_DIR   Cache directory.
                       Default: {data-root}/cache
  LEYCHILE_GRAPH_PATH  Explicit graph path.
                       Default: {data-root}/graph.json

Examples
--------
  # Full pipeline run (local):
  python scripts/leychile.py pipeline

  # Fetch versions for one shard (CI / different IP):
  python scripts/leychile.py fetch-versions --shard 0/8 --budget 600000

  # Build historial from cache:
  python scripts/leychile.py build --rebuild

  # Status report:
  python scripts/leychile.py status

  # Verify integrity:
  python scripts/leychile.py verify
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Bootstrap: scripts/ must be on sys.path for sibling imports
# ---------------------------------------------------------------------------

_SCRIPTS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

# ---------------------------------------------------------------------------
# Lazy imports — each command only imports what it needs so help/status
# work without all deps installed
# ---------------------------------------------------------------------------

log = logging.getLogger("leychile")


# ---------------------------------------------------------------------------
# Environment resolution
# ---------------------------------------------------------------------------


def _resolve_data_root(explicit: str | None) -> Path:
    """Resolve DATA_ROOT from explicit arg → env var → auto-detect."""
    if explicit:
        return Path(explicit).resolve()
    env = os.environ.get("LEYCHILE_DATA_ROOT")
    if env:
        return Path(env).resolve()
    # Auto-detect: historial worktree or repo root
    hist = _REPO_ROOT / "historial"
    if hist.is_dir() and (hist / ".git").exists():
        return hist
    return _REPO_ROOT


def _resolve_cache_dir(explicit: str | None, data_root: Path) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env = os.environ.get("LEYCHILE_CACHE_DIR")
    if env:
        return Path(env).resolve()
    return data_root / "cache"


def _resolve_graph_path(explicit: str | None, data_root: Path) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env = os.environ.get("LEYCHILE_GRAPH_PATH")
    if env:
        return Path(env).resolve()
    return data_root / "graph.json"


# ---------------------------------------------------------------------------
# In-process script runner
# ---------------------------------------------------------------------------


def _run_script_main(module_name: str, argv: list[str]) -> None:
    """Import ``module_name`` and call its ``main()`` with a patched ``sys.argv``.

    This keeps the entire pipeline in one process, giving us real Python
    tracebacks and a shared log stream rather than the silent exit-code-only
    interface subprocess calls provide.

    Each script guards its ``main()`` with ``if __name__ == "__main__":`` so
    importing them is safe; their top-level code is pure configuration.
    """
    import importlib
    old_argv = sys.argv
    try:
        sys.argv = [module_name] + list(argv)
        mod = importlib.import_module(module_name)
        mod.main()
    finally:
        sys.argv = old_argv


# ---------------------------------------------------------------------------
# Notification helper
# ---------------------------------------------------------------------------


def _notify(url: str, title: str, message: str) -> None:
    """Fire-and-forget ntfy.sh notification. Silently swallows errors."""
    if not url:
        return
    try:
        import urllib.request
        data = json.dumps({"title": title, "message": message}).encode()
        req = urllib.request.Request(url, data=data,
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception as exc:
        log.debug("Notification failed (ignored): %s", exc)


# ---------------------------------------------------------------------------
# Command: fetch-graph
# ---------------------------------------------------------------------------


def cmd_fetch_graph(args: argparse.Namespace) -> int:
    """Phase 1+2: BCN SPARQL catalog → LeyChile norma metadata → graph_shards/."""
    data_root = _resolve_data_root(args.data_root)
    cache_dir = _resolve_cache_dir(args.cache_dir, data_root)
    log.info("fetch-graph: DATA_ROOT=%s", data_root)

    from utils import setup_logging, detect_data_root
    setup_logging(verbose=args.verbose)

    # Phase 1: catalog (build_catalog.py exposes load_catalog_state / fetch_catalog
    # at module level; we call its main() with sys.argv patched to stay in-process)
    _run_script_main("build_catalog", ["--data-root", str(data_root)])

    # Phase 2: norma metadata → graph
    _run_script_main("fetch_normas", ["--data-root", str(data_root)])

    _notify(args.notify_url, "leychile fetch-graph done", f"data_root={data_root}")
    return 0


# ---------------------------------------------------------------------------
# Command: fetch-versions
# ---------------------------------------------------------------------------


def cmd_fetch_versions(args: argparse.Namespace) -> int:
    """Phase 3: per-norma version data + article diffs → cache/diffs/ + cache/versions/."""
    data_root = _resolve_data_root(args.data_root)
    cache_dir = _resolve_cache_dir(args.cache_dir, data_root)
    graph_path = _resolve_graph_path(args.graph_path, data_root)
    log.info("fetch-versions: DATA_ROOT=%s CACHE=%s", data_root, cache_dir)

    from utils import setup_logging
    setup_logging(verbose=args.verbose)

    # Parse shard argument (format: "K/N")
    shard: tuple[int, int] | None = None
    if args.shard:
        try:
            k_str, n_str = args.shard.split("/")
            shard = (int(k_str), int(n_str))
        except (ValueError, AttributeError):
            log.error("--shard must be K/N (e.g. 0/8), got: %s", args.shard)
            return 2

    import asyncio
    import fetch_versions
    asyncio.run(fetch_versions.run(
        data_root=data_root,
        limit=None,
        only_id=None,
        cache_dir=cache_dir,
        version_budget=args.budget,
        shard=shard,
        max_transient_failures=args.max_transient_failures,
    ))

    _notify(args.notify_url, "leychile fetch-versions done",
            f"shard={args.shard or 'all'} cache={cache_dir}")
    return 0


# ---------------------------------------------------------------------------
# Command: build
# ---------------------------------------------------------------------------


def cmd_build(args: argparse.Namespace) -> int:
    """Phase 4: diffs cache → historial git branch via fast-import."""
    data_root = _resolve_data_root(args.data_root)
    cache_dir = _resolve_cache_dir(args.cache_dir, data_root)
    log.info("build: DATA_ROOT=%s CACHE=%s", data_root, cache_dir)

    from utils import setup_logging
    setup_logging(verbose=args.verbose)

    bh_args = ["--data-root", str(data_root), "--cache-dir", str(cache_dir)]
    if args.rebuild:
        bh_args.append("--rebuild")
    if args.append:
        bh_args.append("--append")
    if args.dry_run:
        bh_args.append("--dry-run")
    if args.enrichers:
        bh_args += ["--enrichers", args.enrichers]
    if args.from_date:
        bh_args += ["--from", args.from_date]
    if args.to_date:
        bh_args += ["--to", args.to_date]
    if args.skip_final_chore:
        bh_args.append("--skip-final-chore")
    _run_script_main("build_history", bh_args)

    _notify(args.notify_url, "leychile build done",
            f"rebuild={args.rebuild} data_root={data_root}")
    return 0


# ---------------------------------------------------------------------------
# Command: verify
# ---------------------------------------------------------------------------


def cmd_verify(args: argparse.Namespace) -> int:
    """Verify pipeline artifact integrity. Exit 1 on inconsistencies."""
    data_root = _resolve_data_root(args.data_root)
    cache_dir = _resolve_cache_dir(args.cache_dir, data_root)
    graph_path = _resolve_graph_path(args.graph_path, data_root)
    historial_dir = Path(args.historial_dir) if args.historial_dir else (data_root / ".." / "historial")

    from utils import setup_logging
    setup_logging(verbose=args.verbose)

    import verify_pipeline
    catalog_path = data_root / "catalog.json"
    report = verify_pipeline.gather_report(
        catalog_path=catalog_path,
        graph_path=graph_path,
        cache_dir=cache_dir,
        historial_dir=historial_dir if historial_dir.is_dir() else None,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if not report["inconsistencies"] else 1


# ---------------------------------------------------------------------------
# Command: status
# ---------------------------------------------------------------------------


def cmd_status(args: argparse.Namespace) -> int:
    """Show pipeline watermark, completion statistics, and inconsistency count."""
    data_root = _resolve_data_root(args.data_root)
    cache_dir = _resolve_cache_dir(args.cache_dir, data_root)
    graph_path = _resolve_graph_path(args.graph_path, data_root)
    historial_dir = Path(args.historial_dir) if args.historial_dir else data_root

    from utils import setup_logging, graph_exists, load_graph
    setup_logging(verbose=args.verbose)

    if not graph_exists(graph_path):
        log.error("No graph found at %s", graph_path)
        return 2

    import compute_watermark
    graph = load_graph(graph_path)
    W = compute_watermark.get_historial_watermark(historial_dir) if historial_dir.is_dir() else ""
    stats = compute_watermark.compute_watermark(graph, cache_dir, W=W, historial_dir=historial_dir)
    print(json.dumps(stats, indent=2))
    return 0


# ---------------------------------------------------------------------------
# Command: pipeline (all phases)
# ---------------------------------------------------------------------------


def cmd_pipeline(args: argparse.Namespace) -> int:
    """Run all pipeline phases end-to-end.

    fetch-graph is skipped automatically if the graph is fresh (<7 days old
    and catalog is complete), unless --force-fetch-graph is passed.
    """
    data_root = _resolve_data_root(args.data_root)
    graph_path = _resolve_graph_path(args.graph_path, data_root)

    from utils import setup_logging, graph_exists
    setup_logging(verbose=args.verbose)

    # Decide whether to run fetch-graph
    run_fetch_graph = args.force_fetch_graph
    if not run_fetch_graph:
        if not graph_exists(graph_path):
            log.info("pipeline: graph not found — running fetch-graph")
            run_fetch_graph = True
        else:
            # Check catalog age
            catalog_path = data_root / "catalog.json"
            if catalog_path.exists():
                age_days = (
                    __import__("time").time() - catalog_path.stat().st_mtime
                ) / 86400
                if age_days > 7:
                    log.info("pipeline: catalog is %.1f days old — running fetch-graph", age_days)
                    run_fetch_graph = True
            else:
                run_fetch_graph = True

    # Build a fake args namespace for each sub-command and call it directly.
    # No subprocess — same process, same stack, same logger.
    _common = dict(
        data_root=args.data_root,
        cache_dir=getattr(args, "cache_dir", None),
        graph_path=getattr(args, "graph_path", None),
        notify_url="",  # suppress per-phase notifications; we fire one at end
        verbose=args.verbose,
    )

    phases: list[tuple[str, callable]] = []

    if run_fetch_graph:
        fg_args = argparse.Namespace(**_common)
        phases.append(("fetch-graph", lambda a=fg_args: cmd_fetch_graph(a)))

    fv_args = argparse.Namespace(
        **_common,
        shard=getattr(args, "shard", None),
        budget=getattr(args, "budget", None),
        max_transient_failures=8,
    )
    phases.append(("fetch-versions", lambda a=fv_args: cmd_fetch_versions(a)))

    b_args = argparse.Namespace(
        **_common,
        rebuild=True,
        append=False,
        dry_run=False,
        enrichers="tramitacion",
        from_date=None,
        to_date=None,
    )
    phases.append(("build", lambda a=b_args: cmd_build(a)))

    total = len(phases)
    for i, (name, func) in enumerate(phases, 1):
        log.info("pipeline [%d/%d]: %s", i, total, name)
        rc = func()
        if rc != 0:
            log.error("pipeline: phase %s failed (exit %d)", name, rc)
            _notify(args.notify_url, f"leychile pipeline FAILED at {name}",
                    f"data_root={data_root}")
            return rc

    _notify(args.notify_url, "leychile pipeline done", f"data_root={data_root}")
    return 0


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------


def _add_common_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--data-root", metavar="PATH",
                   help="Data root (default: LEYCHILE_DATA_ROOT env or auto-detect)")
    p.add_argument("--cache-dir", metavar="PATH",
                   help="Cache directory (default: {data-root}/cache)")
    p.add_argument("--graph-path", metavar="PATH",
                   help="Explicit graph path (default: {data-root}/graph.json)")
    p.add_argument("--notify-url", metavar="URL", default="",
                   help="ntfy.sh webhook URL for completion notification")
    p.add_argument("--verbose", action="store_true", help="Enable DEBUG logging")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="leychile",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # -- fetch-graph --
    p_fg = sub.add_parser("fetch-graph",
                          help="Refresh catalog + norma graph from BCN SPARQL + LeyChile")
    _add_common_args(p_fg)
    p_fg.set_defaults(func=cmd_fetch_graph)

    # -- fetch-versions --
    p_fv = sub.add_parser("fetch-versions",
                           help="Fetch per-norma version data and compute article diffs")
    _add_common_args(p_fv)
    p_fv.add_argument("--shard", metavar="K/N", default=None,
                      help="Run only id_norma %% N == K (e.g. 0/8 for first of 8 shards)")
    p_fv.add_argument("--budget", metavar="N", type=int, default=None,
                      help="Max version-fetch operations for this run")
    p_fv.add_argument("--max-transient-failures", metavar="N", type=int, default=8,
                      help="Max transient failures before marking a norma as permanently failed")
    p_fv.set_defaults(func=cmd_fetch_versions)

    # -- build --
    p_b = sub.add_parser("build",
                          help="Generate historial git branch from the diffs cache")
    _add_common_args(p_b)
    p_b.add_argument("--rebuild", action="store_true",
                     help="Atomically wipe and regenerate historial from scratch (deterministic)")
    p_b.add_argument("--append", action="store_true",
                     help="Append commits after existing historial tip (incremental)")
    p_b.add_argument("--dry-run", action="store_true",
                     help="Print commit list without writing to git")
    p_b.add_argument("--enrichers", default="tramitacion",
                     help="Comma-separated enrichers to enable (default: tramitacion)")
    p_b.add_argument("--from", dest="from_date", metavar="DATE", default=None,
                     help="Only include causes with date > DATE (exclusive, YYYY-MM-DD)")
    p_b.add_argument("--to", dest="to_date", metavar="DATE", default=None,
                     help="Only include causes with date <= DATE (inclusive, YYYY-MM-DD)")
    p_b.add_argument("--skip-final-chore", action="store_true",
                     help="Skip the 'Fin del historial' marker (chunked builds invoke this script multiple times)")
    p_b.set_defaults(func=cmd_build)

    # -- verify --
    p_v = sub.add_parser("verify",
                          help="Verify pipeline artifact integrity")
    _add_common_args(p_v)
    p_v.add_argument("--historial-dir", metavar="PATH",
                     help="Historial worktree path (default: {data-root}/../historial)")
    p_v.set_defaults(func=cmd_verify)

    # -- status --
    p_s = sub.add_parser("status",
                          help="Show pipeline watermark and completion statistics")
    _add_common_args(p_s)
    p_s.add_argument("--historial-dir", metavar="PATH",
                     help="Historial directory for watermark calculation")
    p_s.set_defaults(func=cmd_status)

    # -- pipeline --
    p_p = sub.add_parser("pipeline",
                          help="Run all phases end-to-end")
    _add_common_args(p_p)
    p_p.add_argument("--force-fetch-graph", action="store_true",
                     help="Force fetch-graph even if the graph is fresh")
    p_p.add_argument("--shard", metavar="K/N", default=None,
                     help="Shard argument forwarded to fetch-versions")
    p_p.add_argument("--budget", metavar="N", type=int, default=None,
                     help="Version budget forwarded to fetch-versions")
    p_p.set_defaults(func=cmd_pipeline)

    return parser


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    # Basic logging before args are parsed (verbose flag may not be set yet)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = build_parser()
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        rc = args.func(args)
    except KeyboardInterrupt:
        log.info("Interrupted.")
        rc = 130
    except Exception as exc:
        log.error("Unhandled error: %s", exc, exc_info=args.verbose)
        rc = 1

    sys.exit(rc)


if __name__ == "__main__":
    main()
