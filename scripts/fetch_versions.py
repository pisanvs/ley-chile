"""
fetch_versions.py — Fetch historical versions of each norma and compute article-level diffs.

For each idNorma in {DATA_ROOT}/graph.json where node["vigencias"] has 2+ entries:
  1. Sort vigencias by "desde" ascending (oldest first)
  2. For each vigencia, fetch the versioned norma JSON and cache it
  3. Compute consecutive article-level diffs
  4. Write {DATA_ROOT}/cache/diffs/{idNorma}.json
  5. Write {DATA_ROOT}/{law_dir}/versiones.json

Usage:
    python scripts/fetch_versions.py [--data-root PATH] [--limit N] [--id IDNORMA]
"""

import argparse
import asyncio
import html
import json
import logging
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import threading

import requests

# ---------------------------------------------------------------------------
# Bootstrap sys.path
# ---------------------------------------------------------------------------
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import AdaptiveLimiter, detect_data_root, law_dir  # noqa: E402

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

PROGRESS_SAVE_EVERY = 20
LOG_EVERY = 50

# ---------------------------------------------------------------------------
# Thread-local session
# ---------------------------------------------------------------------------

_thread_local = threading.local()


def _get_session() -> requests.Session:
    if not hasattr(_thread_local, "session"):
        s = requests.Session()
        s.headers.update(HEADERS)
        _thread_local.session = s
    return _thread_local.session

# ---------------------------------------------------------------------------
# HTML flattening
# ---------------------------------------------------------------------------


def _flatten_html(items: list) -> dict[int, str]:
    """Recursively flatten html items to {part_id: html_text}."""
    result = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        if "i" in item and "t" in item:
            result[item["i"]] = item["t"]
        if "h" in item:
            result.update(_flatten_html(item["h"]))
    return result


# ---------------------------------------------------------------------------
# texto.md generation
# ---------------------------------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")


def _html_to_text(h: str) -> str:
    """Strip HTML tags, decode entities, collapse whitespace."""
    text = _TAG_RE.sub("", h)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _flatten_to_text(items: list) -> str:
    """Flatten html items tree to plain text lines."""
    parts = _flatten_html(items)
    lines = [_html_to_text(v) for v in parts.values() if v]
    return "\n".join(line for line in lines if line)


# ---------------------------------------------------------------------------
# Diff computation
# ---------------------------------------------------------------------------


def _compute_diff(prev: dict[int, str], curr: dict[int, str]) -> dict:
    """Compute article-level diff between two flattened part dicts."""
    prev_ids = set(prev.keys())
    curr_ids = set(curr.keys())

    added = [
        {"part_id": pid, "old": None, "new": curr[pid]}
        for pid in sorted(curr_ids - prev_ids)
    ]
    removed = [
        {"part_id": pid, "old": prev[pid], "new": None}
        for pid in sorted(prev_ids - curr_ids)
    ]
    changed = [
        {"part_id": pid, "old": prev[pid], "new": curr[pid]}
        for pid in sorted(prev_ids & curr_ids)
        if prev[pid] != curr[pid]
    ]

    return {"added": added, "removed": removed, "changed": changed}


# ---------------------------------------------------------------------------
# Fetch one version
# ---------------------------------------------------------------------------


def fetch_version(
    id_norma: int,
    fecha: str,
    cache_dir: Path,
    session: requests.Session | None = None,
) -> dict:
    """Fetch versioned norma JSON and cache it. Returns parsed dict."""
    cache_file = cache_dir / str(id_norma) / f"{fecha}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    cache_file.parent.mkdir(parents=True, exist_ok=True)

    params = {
        "idNorma": id_norma,
        "idVersion": fecha,
        "idLey": "",
        "tipoVersion": "",
        "cve": "",
        "agrupa_partes": "1",
        "r": "",
    }
    headers = {
        **HEADERS,
        "Referer": f"https://nuevo.leychile.cl/Navegar?idNorma={id_norma}",
    }

    sess = _get_session() if session is None else session
    resp = sess.get(BASE_URL, params=params, headers=headers, timeout=30)
    resp.raise_for_status()

    data = resp.json()
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


# ---------------------------------------------------------------------------
# Process one norma — fetch all versions + compute diffs
# ---------------------------------------------------------------------------


def _process_norma_sync(
    id_norma: int,
    node: dict,
    versions_cache_dir: Path,
    session: requests.Session | None = None,
) -> tuple[int, list | None, dict[int, str] | None, Exception | None]:
    """Fetch all versions for a norma and compute diffs.

    Returns (id_norma, diff_list, latest_flat, error_or_None).
    diff_list is the full versiones structure; latest_flat is used for texto.md.
    """
    try:
        vigencias: list[dict] = node.get("vigencias", [])
        # Sort oldest first
        vigencias = sorted(vigencias, key=lambda v: v.get("desde", ""))

        # Filter sentinel dates (e.g. 2222-02-02)
        vigencias = [
            v for v in vigencias
            if v.get("desde", "") and int(v["desde"][:4]) <= 2100
        ]

        fetched: list[tuple[str, str, dict]] = []  # (fecha, tipo_version_s, data)
        for vig in vigencias:
            fecha = vig.get("desde", "")
            tipo_v = vig.get("tipo_version_s", "")
            if not fecha:
                continue
            data = fetch_version(id_norma, fecha, versions_cache_dir)
            fetched.append((fecha, tipo_v, data))

        if not fetched:
            return (id_norma, [], {}, None)

        # Compute diffs between consecutive versions
        result = []
        prev_flat: dict[int, str] | None = None
        latest_flat: dict[int, str] = {}
        for i, (fecha, tipo_v, data) in enumerate(fetched):
            curr_flat = _flatten_html(data.get("html", []))
            if i == 0 or prev_flat is None:
                diff = None
            else:
                diff = _compute_diff(prev_flat, curr_flat)
            result.append({
                "fecha": fecha,
                "tipo_version_s": tipo_v,
                "diff": diff,
            })
            prev_flat = curr_flat
            latest_flat = curr_flat

        return (id_norma, result, latest_flat, None)

    except Exception as exc:
        return (id_norma, None, None, exc)


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
# Write output files
# ---------------------------------------------------------------------------


def _write_outputs(
    id_norma: int,
    node: dict,
    diff_list: list,
    latest_flat: dict[int, str],
    diffs_cache_dir: Path,
    data_root: Path,
) -> None:
    """Write cache/diffs/{idNorma}.json and {law_dir}/versiones.json + texto.md."""
    # 1. cache/diffs/{idNorma}.json
    diffs_cache_dir.mkdir(parents=True, exist_ok=True)
    diff_path = diffs_cache_dir / f"{id_norma}.json"
    diff_path.write_text(json.dumps(diff_list, ensure_ascii=False, indent=2), encoding="utf-8")

    # 2. Resolve law_dir
    numero = node.get("numero", str(id_norma))
    clasificacion = node.get("clasificacion", "sustantiva")
    tipo = node.get("tipo", "")
    organismos = node.get("organismos", [])
    organismo = organismos[0] if organismos else ""
    fecha_pub = node.get("fechaPublicacion", "")
    fecha_promulgacion = node.get("fechaPromulgacion", "")

    ldir = law_dir(
        numero=numero,
        clasificacion=clasificacion,
        tipo=tipo,
        id_norma=id_norma,
        fecha=fecha_pub,
        fecha_promulgacion=fecha_promulgacion,
        organismo=organismo,
        data_root=data_root,
    )
    ldir.mkdir(parents=True, exist_ok=True)

    # 3. Enrich with modificadaPor edges matched by date (may be multiple per date)
    modif_by_date: dict[str, list] = {}
    for edge in node.get("modificadaPor_edges", []):
        fecha_edge = edge.get("fecha", "")
        if fecha_edge:
            modif_by_date.setdefault(fecha_edge, []).append(edge)

    versiones_list = []
    for entry in diff_list:
        v = dict(entry)
        fecha = entry.get("fecha", "")
        if fecha in modif_by_date:
            v["modificadaPor"] = modif_by_date[fecha]
        versiones_list.append(v)

    versiones_path = ldir / "versiones.json"
    versiones_path.write_text(
        json.dumps(versiones_list, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 4. texto.md from latest version (using in-memory flat dict)
    if latest_flat:
        try:
            lines = [
                _html_to_text(v)
                for v in (latest_flat[k] for k in sorted(latest_flat.keys()))
                if v
            ]
            text = "\n".join(line for line in lines if line)
            (ldir / "texto.md").write_text(text, encoding="utf-8")
        except Exception as exc:
            logger.warning(f"texto.md failed for {id_norma}: {exc}")


# ---------------------------------------------------------------------------
# Main async orchestrator
# ---------------------------------------------------------------------------


async def run(data_root: Path, limit: int | None, only_id: int | None) -> None:
    graph_path = data_root / "graph.json"
    if not graph_path.exists():
        logger.error(f"graph.json not found at {graph_path}")
        logger.error("Run fetch_normas.py first.")
        sys.exit(1)

    graph: dict = json.loads(graph_path.read_text(encoding="utf-8"))
    logger.info(f"Loaded graph: {len(graph)} nodes")

    # Filter: only nodes with 1+ vigencias (single-version laws also need diffs cache)
    if only_id is not None:
        candidates = [(str(only_id), graph[str(only_id)])] if str(only_id) in graph else []
    else:
        candidates = [
            (id_str, node)
            for id_str, node in graph.items()
            if len(node.get("vigencias", [])) >= 1
        ]

    logger.info(f"Nodes with 1+ vigencias: {len(candidates)}")

    if limit:
        candidates = candidates[:limit]
        logger.info(f"--limit applied: processing {len(candidates)}")

    versions_cache_dir = data_root / "cache" / "versions"
    diffs_cache_dir = data_root / "cache" / "diffs"
    versions_cache_dir.mkdir(parents=True, exist_ok=True)
    diffs_cache_dir.mkdir(parents=True, exist_ok=True)

    progress_path = data_root / "fetch_versions_progress.json"
    progress = _load_progress(progress_path)

    done_set: set[int] = set(progress.get("done", []))
    failed_map: dict[str, int] = progress.get("failed", {})

    # Build work queue
    work = []
    for id_str, node in candidates:
        id_norma = int(id_str)
        if id_norma in done_set:
            continue
        if failed_map.get(id_str, 0) >= 3:
            continue
        work.append((id_norma, node))

    logger.info(
        f"To process: {len(work)}, already done: {len(done_set)}, "
        f"skipped (failed≥3): {len([k for k, v in failed_map.items() if v >= 3])}"
    )

    if not work:
        logger.info("Nothing to do.")
        return

    limiter = AdaptiveLimiter(start=3, min_c=1, max_c=10)

    completions_since_save = 0
    fetches_since_log = 0
    fetch_count = 0

    loop = asyncio.get_running_loop()
    executor = ThreadPoolExecutor(max_workers=10)

    async def process(id_norma: int, node: dict) -> None:
        nonlocal completions_since_save, fetches_since_log, fetch_count

        await limiter.acquire()
        try:
            id_n, diff_list, latest_flat, err = await loop.run_in_executor(
                executor,
                _process_norma_sync,
                id_norma,
                node,
                versions_cache_dir,
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
                logger.warning(f"Error processing {id_norma}: {err}")
            failed_map[str(id_norma)] = failed_map.get(str(id_norma), 0) + 1
        else:
            await limiter.on_success()
            _write_outputs(id_norma, node, diff_list, latest_flat or {}, diffs_cache_dir, data_root)
            done_set.add(id_norma)
            completions_since_save += 1

        if fetches_since_log >= LOG_EVERY:
            fetches_since_log = 0
            logger.info(
                f"[{fetch_count}/{len(work)}] done={len(done_set)} "
                f"failed={len(failed_map)} concurrency={limiter.concurrency}"
            )

        if completions_since_save >= PROGRESS_SAVE_EVERY:
            completions_since_save = 0
            progress["done"] = list(done_set)
            progress["failed"] = failed_map
            _save_progress(progress_path, progress)

    tasks = [asyncio.create_task(process(id_norma, node)) for id_norma, node in work]

    try:
        await asyncio.gather(*tasks)
    finally:
        progress["done"] = list(done_set)
        progress["failed"] = failed_map
        _save_progress(progress_path, progress)
        executor.shutdown(wait=True)

    logger.info(
        f"Done. total_done={len(done_set)} "
        f"failed={len([v for v in failed_map.values() if v >= 3])}"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch historical versions of each norma and compute article-level diffs."
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
        "--id",
        type=int,
        metavar="IDNORMA",
        default=None,
        help="Process only this specific idNorma (for testing)",
    )
    args = parser.parse_args()

    data_root = Path(args.data_root).resolve() if args.data_root else detect_data_root()
    logger.info(f"DATA_ROOT: {data_root}")

    asyncio.run(run(data_root, args.limit, args.id))


if __name__ == "__main__":
    main()
