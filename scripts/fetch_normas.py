"""
fetch_normas.py — Fetch LeyChile JSON for each norma in catalog.json.

For each idNorma in {DATA_ROOT}/catalog.json:
  1. Skip if cache/normas/{idNorma}.json already exists.
  2. GET https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma=...
  3. Save raw response to cache/normas/{idNorma}.json
  4. Extract metadata + modificadaPor_edges and update graph.json

Usage:
    python scripts/fetch_normas.py [--data-root PATH] [--limit N]
"""

import argparse
import asyncio
import json
import logging
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Bootstrap sys.path so we can import utils even when running as a script
# ---------------------------------------------------------------------------
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import AdaptiveLimiter, classify, detect_data_root  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://nuevo.leychile.cl/servicios/Navegar/get_norma_json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Accept": "application/json, */*",
    "X-Requested-With": "XMLHttpRequest",
}

PROGRESS_SAVE_EVERY = 50   # flush progress every N completions
LOG_EVERY = 100            # log stats every N fetches
MAX_RETRIES = 3            # in-worker retries for transient server errors

# ---------------------------------------------------------------------------
# HTML reference extraction
# ---------------------------------------------------------------------------

_HREF_RE = re.compile(
    r'href=["\'](?:/Navegar\?|navegar\?)idNorma=(\d+)(?:&amp;|&)idParte=\d+(?:&amp;|&)idVersion=([^"\'&]+)',
    re.IGNORECASE,
)


def _extract_edges_from_html(html_items: list) -> list[dict]:
    """Walk html item tree; return deduplicated [{idNorma, fecha}] edges."""
    edges: dict[int, str] = {}

    def _walk(items):
        for item in items:
            if not isinstance(item, dict):
                continue
            t = item.get("t", "")
            if t:
                for m in _HREF_RE.finditer(t):
                    id_ref = int(m.group(1))
                    fecha = m.group(2).strip()
                    # keep first-seen fecha for each modifier idNorma
                    if id_ref not in edges:
                        edges[id_ref] = fecha
            children = item.get("h", [])
            if children:
                _walk(children)

    _walk(html_items)
    return [{"idNorma": k, "fecha": v} for k, v in edges.items()]


# ---------------------------------------------------------------------------
# Fetch one norma
# ---------------------------------------------------------------------------

def fetch_one(id_norma: int, cache_dir: Path, session: requests.Session) -> dict:
    """Fetch raw JSON for id_norma and save to cache_dir/{id_norma}.json.

    Returns the parsed JSON dict.
    Raises requests.HTTPError on non-200 responses.
    """
    cache_file = cache_dir / f"{id_norma}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    url = BASE_URL
    params = {
        "idNorma": id_norma,
        "idVersion": "",
        "idLey": "",
        "tipoVersion": "",
        "cve": "",
        "agrupa_partes": "1",
        "r": "",
    }
    headers = {
        **HEADERS,
        "Referer": f"https://www.leychile.cl/Navegar?idNorma={id_norma}",
    }

    resp = session.get(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()

    data = resp.json()
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


# ---------------------------------------------------------------------------
# Parse norma JSON → graph node
# ---------------------------------------------------------------------------

def parse_node(id_norma: int, data: dict, existing_node: dict | None = None) -> dict:
    """Build / update a graph node dict from raw norma JSON."""
    meta = data.get("metadatos", {})

    # --- boletin ---
    boletin = None
    for proj in data.get("proyectos", []):
        if proj.get("categoria") == "Proyecto original":
            pls = proj.get("pls", [])
            if pls:
                boletin = pls[0].get("nroBoletin")
                break

    titulo = meta.get("titulo_norma", "")
    clasificacion = classify(titulo)

    node = dict(existing_node) if existing_node else {}
    node.update(
        {
            "idNorma": id_norma,
            "titulo": titulo,
            "clasificacion": clasificacion,
            "organismos": meta.get("organismos", []),
            "derogado": bool(meta.get("derogado", False)),
            "fechaPublicacion": meta.get("fecha_publicacion", ""),
            "fechaPromulgacion": meta.get("fecha_promulgacion", ""),
            "vigencias": meta.get("vigencias", []),
            "modificadaPor_edges": _extract_edges_from_html(data.get("html", [])),
        }
    )
    if boletin is not None:
        node["boletin"] = boletin

    return node


# ---------------------------------------------------------------------------
# Progress helpers
# ---------------------------------------------------------------------------

def _load_progress(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"done": [], "failed": {}, "started": time.strftime("%Y-%m-%dT%H:%M:%S")}


def _save_progress(path: Path, progress: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------

def _load_graph(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_graph(path: Path, graph: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Worker thread function (synchronous, runs in ThreadPoolExecutor)
# ---------------------------------------------------------------------------

def _worker(id_norma: int, cache_dir: Path, session: requests.Session) -> tuple[int, dict | None, Exception | None]:
    """Returns (id_norma, parsed_data_or_None, error_or_None).

    Retries transient server errors (502/504/500, read timeouts, connection
    drops) up to MAX_RETRIES with exponential backoff, since LeyChile's gateway
    is intermittently flaky.  Two cases are returned immediately without retry:
      - 429/503 rate-limits — the caller's AdaptiveLimiter must react to these.
      - permanent 4xx client errors — they won't change on retry (dead idNorma).
    Runs in a thread pool, so the blocking time.sleep does not stall the loop.
    """
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            data = fetch_one(id_norma, cache_dir, session)
            return (id_norma, data, None)
        except requests.HTTPError as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (429, 503) or (status is not None and 400 <= status < 500):
                return (id_norma, None, exc)
            last_exc = exc
        except Exception as exc:
            last_exc = exc  # timeout / connection error — transient
        if attempt < MAX_RETRIES - 1:
            time.sleep(min(8, 2 ** attempt))  # 1s, 2s
    return (id_norma, None, last_exc)


# ---------------------------------------------------------------------------
# Main async orchestrator
# ---------------------------------------------------------------------------

async def run(data_root: Path, limit: int | None) -> None:
    catalog_path = data_root / "catalog.json"
    if not catalog_path.exists():
        logger.error(f"catalog.json not found at {catalog_path}")
        logger.error("Run build_catalog.py first.")
        sys.exit(1)

    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    # catalog.json may be either a plain list (legacy) or
    # {entries, last_code, complete} (resumable build_catalog.py format).
    catalog: list[dict] = raw if isinstance(raw, list) else raw.get("entries", [])
    logger.info(f"Loaded catalog: {len(catalog)} normas")

    if limit:
        catalog = catalog[:limit]
        logger.info(f"--limit applied: processing first {len(catalog)} normas")

    cache_dir = data_root / "cache" / "normas"
    cache_dir.mkdir(parents=True, exist_ok=True)

    graph_path = data_root / "graph.json"
    progress_path = data_root / "fetch_normas_progress.json"

    graph = _load_graph(graph_path)
    progress = _load_progress(progress_path)

    done_set: set[int] = set(progress.get("done", []))
    failed_map: dict[str, int] = progress.get("failed", {})

    # Build work queue
    work = []
    for entry in catalog:
        id_norma = int(entry["idNorma"])
        if id_norma in done_set:
            continue
        if failed_map.get(str(id_norma), 0) >= 3:
            continue
        # Already cached on disk but not in progress (e.g. script was killed mid-graph-write)
        if (cache_dir / f"{id_norma}.json").exists():
            done_set.add(id_norma)
            continue
        work.append((id_norma, entry))

    total = len(catalog)
    already_done = len(done_set)
    logger.info(f"To fetch: {len(work)}, already done: {already_done}, skipped (failed≥3): {len([k for k,v in failed_map.items() if v >= 3])}")

    if not work:
        logger.info("Nothing to do.")
        return

    # AdaptiveLimiter drives concurrency; we use a ThreadPoolExecutor for blocking HTTP
    limiter = AdaptiveLimiter(start=3, min_c=1, max_c=10)
    session = requests.Session()

    completions_since_save = 0
    fetches_since_log = 0
    fetch_count = 0

    loop = asyncio.get_running_loop()
    executor = ThreadPoolExecutor(max_workers=10)

    async def process(id_norma: int, entry: dict) -> None:
        nonlocal completions_since_save, fetches_since_log, fetch_count

        await limiter.acquire()
        try:
            id_n, data, err = await loop.run_in_executor(
                executor, _worker, id_norma, cache_dir, session
            )
        finally:
            limiter.release()

        fetch_count += 1
        fetches_since_log += 1

        if err is not None:
            status_code = getattr(getattr(err, "response", None), "status_code", None)
            if status_code in (429, 503):
                await limiter.on_rate_limit()
                logger.warning(f"Rate limited on {id_norma}: {err}")
            else:
                failure_count = failed_map.get(str(id_norma), 0)
                await limiter.on_error(failure_count)
                logger.warning(f"Error fetching {id_norma}: {err}")
            failed_map[str(id_norma)] = failed_map.get(str(id_norma), 0) + 1
        else:
            await limiter.on_success()
            # Update graph node
            existing = graph.get(str(id_norma))
            node = parse_node(id_norma, data, existing)
            # Preserve catalog fields (numero, tipo) that may already be on the node
            for k in ("numero", "tipo"):
                if k not in node and entry.get(k):
                    node[k] = entry[k]
            graph[str(id_norma)] = node
            done_set.add(id_norma)
            completions_since_save += 1

        # Periodic progress log
        if fetches_since_log >= LOG_EVERY:
            fetches_since_log = 0
            logger.info(
                f"[{fetch_count}/{len(work)}] done={len(done_set)} "
                f"failed={len(failed_map)} concurrency={limiter.concurrency}"
            )

        # Periodic save
        if completions_since_save >= PROGRESS_SAVE_EVERY:
            completions_since_save = 0
            progress["done"] = list(done_set)
            progress["failed"] = failed_map
            _save_progress(progress_path, progress)
            _save_graph(graph_path, graph)

    # Feed work through a bounded queue consumed by a fixed pool of workers.
    # Materializing one task per norma (358k+) parks that many coroutines on the
    # limiter at once — a multi-GB memory storm that stalls the event loop before
    # any progress is made.  A worker pool keeps only POOL_SIZE coroutines live.
    POOL_SIZE = max(limiter._max if hasattr(limiter, "_max") else 10, 10)
    queue: asyncio.Queue = asyncio.Queue()
    for item in work:
        queue.put_nowait(item)

    async def worker() -> None:
        while True:
            try:
                id_norma, entry = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                await process(id_norma, entry)
            finally:
                queue.task_done()

    tasks = [asyncio.create_task(worker()) for _ in range(POOL_SIZE)]

    try:
        await asyncio.gather(*tasks)
    finally:
        # Final save
        progress["done"] = list(done_set)
        progress["failed"] = failed_map
        _save_progress(progress_path, progress)
        _save_graph(graph_path, graph)
        executor.shutdown(wait=True)
        session.close()

    logger.info(
        f"Done. total_done={len(done_set)} failed={len([v for v in failed_map.values() if v >= 3])} graph_nodes={len(graph)}"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch LeyChile JSON for each norma in catalog.json and build graph.json."
    )
    parser.add_argument(
        "--data-root",
        metavar="PATH",
        help="Override DATA_ROOT (default: auto-detect from LEYCHILE_DATA_ROOT env or ./historial/)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        metavar="N",
        default=None,
        help="Process only the first N normas (for testing)",
    )
    args = parser.parse_args()

    data_root = Path(args.data_root).resolve() if args.data_root else detect_data_root()
    logger.info(f"DATA_ROOT: {data_root}")

    asyncio.run(run(data_root, args.limit))


if __name__ == "__main__":
    main()
