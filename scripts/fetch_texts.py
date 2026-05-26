"""
Fetch law texts for every idNorma in graph.json and commit them.

Reads graph.json as the authoritative list of laws to process.  For each
law not yet committed, calls trace_one_law() which fetches all historical
versions from LeyChile and commits them.

Designed to run to completion on any server without session timeouts.
Progress persists in DATA_ROOT/fetch_progress.json so the script can be
interrupted and resumed at any time.

Usage:
    LEYCHILE_DATA_ROOT=./historial python scripts/fetch_texts.py
    LEYCHILE_DATA_ROOT=./historial python scripts/fetch_texts.py \\
        --notify-url https://ntfy.sh/MY_TOPIC --concurrency 2
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
import trace_graph as tg

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

GRAPH_FILE = "graph.json"
PROGRESS_FILE = "fetch_progress.json"
MAX_FAILURES = 3

# Serialise all git commits across workers (git is single-writer)
_git_lock = threading.Lock()
# Serialise graph.json reads/writes
_graph_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Thread-safe rate limiter
# ---------------------------------------------------------------------------

class _RateLimiter:
    def __init__(self, rate: float):
        self._interval = 1.0 / rate
        self._lock = threading.Lock()
        self._last = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            gap = self._last + self._interval - now
            if gap > 0:
                time.sleep(gap)
            self._last = time.monotonic()


_leychile_lim = _RateLimiter(1.0)   # LeyChile: 1 req/s
_bcn_lim = _RateLimiter(0.3)        # BCN: 0.3 req/s


def _safe_get(url: str, params: dict = {}, delay: float = 1.0) -> requests.Response:
    """Thread-safe drop-in for tg._rate_limited_get."""
    from urllib.parse import urlparse
    host = urlparse(url).netloc
    (_leychile_lim if "leychile" in host else _bcn_lim).wait()
    resp = requests.get(url, params=params, headers={"User-Agent": "ley-chile/1.0"}, timeout=30)
    resp.raise_for_status()
    return resp


# Monkey-patch so all trace_graph HTTP calls use the thread-safe limiter
tg._rate_limited_get = _safe_get


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------

def _progress_path() -> Path:
    return tg.DATA_ROOT / PROGRESS_FILE


def load_progress() -> dict:
    p = _progress_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception as exc:
            log.warning("Could not load %s: %s", PROGRESS_FILE, exc)
    return {"done": [], "failed": {}, "started": datetime.utcnow().isoformat()}


def save_progress(progress: dict) -> None:
    _progress_path().write_text(
        json.dumps(progress, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _commit_progress(progress: dict, msg: str) -> None:
    save_progress(progress)
    subprocess.run(
        ["git", "-C", str(tg.DATA_ROOT), "add", "--", str(_progress_path())],
        check=True, capture_output=True,
    )
    res = subprocess.run(
        ["git", "-C", str(tg.DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if res.returncode != 0:
        subprocess.run(
            ["git", "-C", str(tg.DATA_ROOT), "commit", "-m", msg],
            check=True, capture_output=True,
        )


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def load_graph() -> dict[int, dict]:
    g = tg.DATA_ROOT / GRAPH_FILE
    if not g.exists():
        log.error("graph.json not found at %s — run build_graph.py first", g)
        sys.exit(1)
    return {int(k): v for k, v in json.loads(g.read_text(encoding="utf-8")).items()}


def _save_graph_raw(graph: dict[int, dict]) -> None:
    (tg.DATA_ROOT / GRAPH_FILE).write_text(
        json.dumps({str(k): graph[k] for k in sorted(graph)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Filesystem scan (one-time done-set bootstrap)
# ---------------------------------------------------------------------------

def scan_committed(graph: dict[int, dict]) -> set[int]:
    """Scan data directories for laws already committed (used on first run)."""
    found: set[int] = set()
    graph_ids = set(graph.keys())
    for mf in tg.DATA_ROOT.rglob("metadata.json"):
        try:
            meta = json.loads(mf.read_text(encoding="utf-8"))
            idn = meta.get("idNorma", 0)
            if not idn or idn not in graph_ids:
                continue
            vf = mf.parent / "versiones.json"
            if vf.exists() and any(
                v.get("committed") for v in json.loads(vf.read_text(encoding="utf-8"))
            ):
                found.add(idn)
        except Exception:
            continue
    return found


# ---------------------------------------------------------------------------
# Per-law fetch
# ---------------------------------------------------------------------------

def _read_metadata_from_dir(id_norma: int) -> dict | None:
    """Read metadata.json written by trace_one_law() — avoids an extra HTTP call."""
    for mf in tg.DATA_ROOT.rglob("metadata.json"):
        try:
            meta = json.loads(mf.read_text(encoding="utf-8"))
            if meta.get("idNorma") == id_norma:
                return meta
        except Exception:
            continue
    return None


def fetch_one(id_norma: int) -> tuple[bool, dict | None]:
    """
    Fetch all versions of one law and commit them.

    For concurrency > 1: git commits are serialised by the caller patching
    tg.git_add_commit to hold _git_lock.  The HTTP requests (inside
    trace_one_law) can run in parallel across workers since each worker
    waits its own slot in the shared rate limiter.
    """
    try:
        tg.trace_one_law(id_norma, modifier_map={})
        meta = _read_metadata_from_dir(id_norma)
        return True, meta
    except Exception as exc:
        log.error("fetch_one(%d) failed: %s", id_norma, exc)
        return False, None


def enrich_graph(id_norma: int, metadata: dict) -> None:
    """Fill in titulo/clasificacion/fechaPublicacion for a graph node."""
    with _graph_lock:
        try:
            g_path = tg.DATA_ROOT / GRAPH_FILE
            graph = {int(k): v for k, v in json.loads(g_path.read_text(encoding="utf-8")).items()}
            node = graph.get(id_norma)
            if node and not node.get("titulo") and metadata.get("titulo"):
                node["titulo"] = metadata["titulo"]
                node["clasificacion"] = tg.classify(metadata["titulo"])
                node["fechaPublicacion"] = metadata.get(
                    "fechaPublicacion", node.get("fechaPublicacion", "")
                )
                _save_graph_raw(graph)
        except Exception as exc:
            log.warning("enrich_graph(%d): %s", id_norma, exc)


# ---------------------------------------------------------------------------
# Notification
# ---------------------------------------------------------------------------

def notify(url: str, message: str) -> None:
    if not url:
        return
    try:
        requests.post(url, data=message.encode("utf-8"), timeout=10)
        log.info("Notified: %s", message)
    except Exception as exc:
        log.warning("Notification failed: %s", exc)


# ---------------------------------------------------------------------------
# Core run function (callable from run_pipeline.py)
# ---------------------------------------------------------------------------

def run(notify_url: str = "", concurrency: int = 1) -> None:
    """Fetch all pending laws in graph.json.  Idempotent and resumable."""
    graph = load_graph()
    log.info("Graph: %d laws", len(graph))

    progress = load_progress()
    done_set: set[int] = set(progress.get("done", []))
    failed: dict[str, int] = {str(k): int(v) for k, v in progress.get("failed", {}).items()}

    if not done_set:
        log.info("First run — scanning filesystem for already-committed laws ...")
        done_set = scan_committed(graph)
        log.info("  Found %d already committed", len(done_set))
        progress["done"] = sorted(done_set)
        _commit_progress(progress, "chore(meta): fetch_texts — registrar progreso inicial")

    pending = [
        idn for idn in sorted(graph)
        if idn not in done_set and failed.get(str(idn), 0) < MAX_FAILURES
    ]
    n_exhausted = sum(1 for v in failed.values() if v >= MAX_FAILURES)
    log.info(
        "Status: %d done, %d pending, %d exhausted-failed",
        len(done_set), len(pending), n_exhausted,
    )

    if not pending:
        log.info("Nothing to fetch.")
        return

    # For concurrency > 1: patch git_add_commit to hold _git_lock around commits
    if concurrency > 1:
        _orig_git_add_commit = tg.git_add_commit
        def _locked_commit(paths, message):
            with _git_lock:
                return _orig_git_add_commit(paths, message)
        tg.git_add_commit = _locked_commit

    n_success = n_fail = 0
    t0 = time.monotonic()

    def _checkpoint(label: str = "") -> None:
        progress["done"] = sorted(done_set)
        progress["failed"] = failed
        _commit_progress(
            progress,
            f"chore(meta): fetch_texts — {len(done_set)}/{len(graph)} procesadas{' ' + label if label else ''}",
        )

    for i, idn in enumerate(pending):
        num = graph.get(idn, {}).get("numero", "?")
        log.info("[%d/%d] idNorma=%d (ley %s) ...", i + 1, len(pending), idn, num)

        success, meta = fetch_one(idn)

        if success:
            done_set.add(idn)
            n_success += 1
            failed.pop(str(idn), None)
            if meta:
                enrich_graph(idn, meta)
        else:
            cnt = failed.get(str(idn), 0) + 1
            failed[str(idn)] = cnt
            n_fail += 1
            log.warning("  idNorma=%d: failure %d/%d", idn, cnt, MAX_FAILURES)

        if (i + 1) % 10 == 0:
            elapsed = time.monotonic() - t0
            rate = n_success / max(elapsed, 1)
            remaining = len(pending) - i - 1
            eta_min = remaining / rate / 60 if rate > 0 else 0
            log.info(
                "  Progress: %d ok, %d fail | %.2f laws/s | ETA %.0f min",
                n_success, n_fail, rate, eta_min,
            )
            _checkpoint()

            if (i + 1) % 100 == 0 and notify_url:
                notify(
                    notify_url,
                    f"ley-chile: {len(done_set)}/{len(graph)} leyes — ETA {eta_min:.0f} min",
                )

    _checkpoint("(final)")

    # Commit enriched graph.json
    with _graph_lock:
        subprocess.run(
            ["git", "-C", str(tg.DATA_ROOT), "add", "--", str(tg.DATA_ROOT / GRAPH_FILE)],
            check=True, capture_output=True,
        )
        res = subprocess.run(
            ["git", "-C", str(tg.DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
        )
        if res.returncode != 0:
            subprocess.run(
                ["git", "-C", str(tg.DATA_ROOT), "commit", "-m",
                 "chore(graph): enriquecer graph.json tras fetch completo"],
                check=True,
            )

    elapsed = time.monotonic() - t0
    summary = (
        f"fetch_texts done in {elapsed/60:.1f} min: "
        f"{n_success} fetched, {n_fail} failed, "
        f"{len(done_set)}/{len(graph)} total committed"
    )
    log.info(summary)
    notify(notify_url, summary)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--notify-url", default="", help="ntfy.sh webhook URL")
    parser.add_argument(
        "--concurrency", type=int, default=1,
        help="Parallel workers (default 1; max 2 to respect LeyChile rate limit)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show pending laws without fetching")
    args = parser.parse_args()

    if args.dry_run:
        graph = load_graph()
        progress = load_progress()
        done_set: set[int] = set(progress.get("done", []))
        if not done_set:
            done_set = scan_committed(graph)
        failed = progress.get("failed", {})
        pending = [
            idn for idn in sorted(graph)
            if idn not in done_set and int(failed.get(str(idn), 0)) < MAX_FAILURES
        ]
        log.info(
            "=== fetch_texts — DATA_ROOT: %s ===\nGraph: %d | Done: %d | Pending: %d",
            tg.DATA_ROOT, len(graph), len(done_set), len(pending),
        )
        log.info("First 20 pending: %s", pending[:20])
        return

    log.info("=== fetch_texts — DATA_ROOT: %s ===", tg.DATA_ROOT)
    run(notify_url=args.notify_url, concurrency=max(1, min(args.concurrency, 3)))


if __name__ == "__main__":
    main()
