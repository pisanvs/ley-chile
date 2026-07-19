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

from utils import AdaptiveLimiter, classify, detect_data_root, load_graph, save_graph  # noqa: E402

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
    # Full browser-ish header set — the endpoint sits behind a CloudFront WAF
    # that returns small non-JSON bodies (HTTP 200 with ~264 bytes) to cloud-IP
    # requests with sparse headers.  Real-browser headers reliably get the
    # actual JSON from Azure (GH Actions) IPs.  See fetch_versions.py for the
    # same set + diagnostic notes.
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
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

    # tipo/numero live in metadatos.tipos_numeros[0]. The top-level
    # `tipo` and `numero` keys are typically null in this dataset, so without
    # this lift every node ends up tipo=None/numero=None and downstream code
    # falls back to idNorma in commit subjects ("Ley N°1077207") and to
    # generic labels ("Ley" for everything).
    tipo_abr = ""
    numero = ""
    tipos_numeros = meta.get("tipos_numeros") or []
    if tipos_numeros:
        first = tipos_numeros[0]
        tipo_abr = (first.get("abreviacion") or "").lower().strip()
        numero = first.get("numero") or ""

    node = dict(existing_node) if existing_node else {}
    node.update(
        {
            "idNorma": id_norma,
            "titulo": titulo,
            "tipo": tipo_abr or node.get("tipo"),
            "numero": numero or node.get("numero"),
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
    node.update(_lift_extra_metadata(meta))

    return node


# Metadata LeyChile publishes that the graph used to discard entirely. Each is
# stored only when present, so the ~357k-node graph grows by roughly the size of
# the data that actually exists rather than by an empty key per norma.
#
# `resumenes` is deliberately NOT lifted: it is HTML, it is large, and we build
# our own text. Everything here is short.
_EXTRA_META = (
    # How people actually refer to a norma — "Código de Comercio", "ley de
    # partidos". A reader searching the common name currently matches nothing,
    # because only the formal título is indexed.
    ("nombres_uso_comun", "nombresUsoComun"),
    # BCN's subject classification; the best free signal for topic pages and
    # for ranking a text search that misses the título.
    ("materias", "materias"),
    ("terminos_libres", "terminosLibres"),
    ("categorias_norma", "categoriasNorma"),
    # Official warnings, and the reason this matters: they flag article-
    # numbering anomalies ("LA NUMERACION DE LOS ARTICULOS DEL TEXTO PUBLICADO
    # REPITE EL Nº 2"). Citing an article number in such a norma is actively
    # dangerous, and LeyChile already tells us so.
    ("observaciones", "observaciones"),
    ("doble_articulado", "dobleArticulado"),
    # "DFL-2; DFL-2-95" — note these are tipo-numero tokens, NOT idNormas, so
    # they cannot be resolved to a norma on their own (which "DFL 2"? there are
    # 138). Kept for display and corroboration; the authoritative refundido
    # edges come from BCN's recasts/isRecastedBy in bulk_fetch.py.
    ("refundido_por", "refundidoPor"),
    ("derogacion_tacita", "derogacionTacita"),
)


def _lift_extra_metadata(meta: dict) -> dict:
    """Carry through the metadata fields the graph previously dropped.

    Empty values are skipped rather than stored as ``""``/``[]`` so a node only
    grows when LeyChile actually published something.
    """
    out: dict = {}
    for src, dest in _EXTRA_META:
        value = meta.get(src)
        if value in (None, "", [], {}, False):
            continue
        out[dest] = value
    return out


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
    # Delegates to utils.load_graph (sharded graph_shards/ with monolithic fallback).
    return load_graph(path)


def _save_graph(path: Path, graph: dict) -> None:
    # Delegates to utils.save_graph (writes graph_shards/NN.json under the 100MB limit).
    save_graph(path, graph)


# ---------------------------------------------------------------------------
# Worker thread function (synchronous, runs in ThreadPoolExecutor)
# ---------------------------------------------------------------------------

def _worker(id_norma: int, cache_dir: Path, session: requests.Session) -> tuple[int, dict | None, Exception | None]:
    """Returns (id_norma, parsed_data_or_None, error_or_None).

    Retries genuinely transient errors (502 bad gateway, 504 gateway timeout,
    read timeouts, connection drops) up to MAX_RETRIES with exponential
    backoff.  Bubbles up immediately for cases where retry is pointless:
      - 4xx client errors (dead idNorma).
      - 500 — LeyChile returns this for missing idNormas (not transient), so
        retrying just wastes ~3s per bad id across contiguous dead ranges.
      - 429 / 503 rate-limits — the caller's AdaptiveLimiter handles backoff.
    Runs in a thread pool, so the blocking time.sleep does not stall the loop.
    """
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            data = fetch_one(id_norma, cache_dir, session)
            return (id_norma, data, None)
        except requests.HTTPError as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (429, 503, 500) or (status is not None and 400 <= status < 500):
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

async def run(data_root: Path, limit: int | None, reparse_cache: bool = False) -> None:
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

    # Reconcile graph from cache.  Across cancelled runs, normas often get
    # fetched (JSON written to cache + idNorma added to done_set) but the
    # run is killed BEFORE the periodic _save_graph runs — so the next run
    # sees the cache file, marks done, and skips graphing it entirely.  Over
    # time this creates a permanent gap between done_set and the graph that
    # never heals.  Fix: walk the cache once at startup and parse anything
    # missing from the graph back in.  Cheap after the first reconciliation
    # (only net-new files need parsing).
    #
    # `--reparse-cache` widens the same walk to nodes that ARE already in the
    # graph. Without it a change to what parse_node lifts can never reach the
    # ~357k nodes parsed by earlier runs: they are in the graph, so the
    # reconcile skips them, and they are in done_set, so the work queue skips
    # them too. The node is rebuilt from its cached JSON with the existing node
    # passed through, so fields written by other phases (bulk_fetch's refundido
    # edges, boletín) survive. Local cache only — no network.
    if cache_dir.exists():
        reconciled = 0
        reparsed = 0
        for cache_file in cache_dir.iterdir():
            if cache_file.suffix != ".json":
                continue
            try:
                id_norma = int(cache_file.stem)
            except ValueError:
                continue
            existing = graph.get(str(id_norma))
            if existing is not None and not reparse_cache:
                continue
            try:
                data = json.loads(cache_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            graph[str(id_norma)] = parse_node(id_norma, data, existing)
            done_set.add(id_norma)
            if existing is None:
                reconciled += 1
            else:
                reparsed += 1
        if reconciled or reparsed:
            logger.info(
                f"Reconciled {reconciled:,} cached normas into graph "
                f"(closing done/graph drift); re-parsed {reparsed:,} existing nodes"
            )
            _save_graph(graph_path, graph)
            progress["done"] = list(done_set)
            _save_progress(progress_path, progress)

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
            # LeyChile returns 500 for missing idNormas — treat as permanent,
            # same as 4xx.  These are dead ids in the catalog and must NOT
            # drop limiter concurrency or queue up for the next 2 runs.
            is_permanent = (
                status_code == 500
                or (status_code is not None and 400 <= status_code < 500)
            )
            if status_code in (429, 503):
                await limiter.on_rate_limit()
                logger.warning(f"Rate limited on {id_norma}: {err}")
                failed_map[str(id_norma)] = failed_map.get(str(id_norma), 0) + 1
            elif is_permanent:
                # Quietly skip — log only once per ~LOG_EVERY to avoid noise;
                # mark permanent so future runs don't redo the work.
                failed_map[str(id_norma)] = 3
            else:
                failure_count = failed_map.get(str(id_norma), 0)
                await limiter.on_error(failure_count)
                logger.warning(f"Error fetching {id_norma}: {err}")
                failed_map[str(id_norma)] = failure_count + 1
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
    parser.add_argument(
        "--reparse-cache",
        action="store_true",
        help="Re-derive every graph node from its cached norma JSON, including "
             "nodes already present. Use after changing what parse_node lifts — "
             "the normal reconcile only fills in nodes MISSING from the graph, so "
             "a parser change would otherwise never reach already-parsed nodes. "
             "Reads the local cache only; no network.",
    )
    args = parser.parse_args()

    data_root = Path(args.data_root).resolve() if args.data_root else detect_data_root()
    logger.info(f"DATA_ROOT: {data_root}")

    asyncio.run(run(data_root, args.limit, args.reparse_cache))


if __name__ == "__main__":
    main()
