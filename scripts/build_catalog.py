"""
Build a complete catalog of all Chilean legal norms from BCN SPARQL.

Writes {DATA_ROOT}/catalog.json as a JSON array:
  [{"idNorma": 235507, "tipo": "ley", "fechaPublicacion": "2005-02-16"}, ...]

All norma types are included (ley, dl, dfl, dto, etc.). No filtering.

Usage:
    python scripts/build_catalog.py [--force] [--data-root PATH]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

# Add scripts dir to path so we can import utils
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils import detect_data_root, tipo_slug

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

BCN_SPARQL = "https://datos.bcn.cl/sparql"
CATALOG_FILE = "catalog.json"
CATALOG_MAX_AGE_DAYS = 7
SPARQL_PAGE_SIZE = 500
LOG_EVERY = 2000

# ---------------------------------------------------------------------------
# SPARQL query — keyset pagination by leychileCode, no OFFSET
# ---------------------------------------------------------------------------

_CATALOG_QUERY = """\
PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
SELECT DISTINCT ?code ?tipo ?date WHERE {{
  ?s bcn:leychileCode ?code .
  FILTER(xsd:integer(?code) > {last_code})
  OPTIONAL {{ ?s bcn:type ?t . BIND(STR(?t) AS ?tipo) }}
  OPTIONAL {{ ?s bcn:publishDate ?date }}
}}
ORDER BY xsd:integer(?code)
LIMIT {limit}
"""


# ---------------------------------------------------------------------------
# HTTP / SPARQL helpers
# ---------------------------------------------------------------------------

def _sparql_post(query: str, retries: int = 4) -> list[dict]:
    """Execute a SPARQL SELECT query via POST; return bindings list."""
    delay = 10.0
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.post(
                BCN_SPARQL,
                data={"query": query, "format": "application/json"},
                headers={"User-Agent": "ley-chile/2.0"},
                timeout=90,
            )
            resp.raise_for_status()
            return resp.json()["results"]["bindings"]
        except Exception as exc:
            last_exc = exc
            log.warning("SPARQL attempt %d/%d failed: %s", attempt + 1, retries, exc)
            if attempt + 1 < retries:
                retry_after = 0
                if hasattr(exc, "response") and exc.response is not None:
                    try:
                        retry_after = int(exc.response.headers.get("Retry-After", 0))
                    except (ValueError, TypeError):
                        pass
                wait = max(delay, retry_after)
                log.info("  Retrying in %.0fs ...", wait)
                time.sleep(wait)
                delay = min(delay * 2, 120)
    raise RuntimeError(f"SPARQL query failed after {retries} attempts: {last_exc}")


# ---------------------------------------------------------------------------
# Catalog fetch
# ---------------------------------------------------------------------------

def _parse_tipo(tipo_uri: str) -> str:
    """Extract the short tipo slug from a BCN tipo URI."""
    if not tipo_uri:
        return "otras"
    fragment = tipo_uri.split("#")[-1] if "#" in tipo_uri else tipo_uri.split("/")[-1]
    return tipo_slug(fragment) or "otras"


def fetch_catalog() -> list[dict]:
    """
    Paginate through BCN SPARQL to collect ALL norma types.
    Uses keyset pagination (FILTER code > last_code) to avoid Virtuoso timeouts.

    Returns list of {idNorma, tipo, fechaPublicacion} sorted by idNorma.
    Deduplicates by leychileCode.
    """
    seen: dict[int, dict] = {}
    last_code = 0
    last_log_count = 0

    while True:
        query = _CATALOG_QUERY.format(last_code=last_code, limit=SPARQL_PAGE_SIZE)
        bindings = _sparql_post(query)

        if not bindings:
            break

        for row in bindings:
            code_val = row.get("code", {}).get("value", "")
            if not code_val or not code_val.isdigit():
                continue

            id_norma = int(code_val)
            if id_norma in seen:
                continue

            tipo_uri = row.get("tipo", {}).get("value", "")
            tipo = _parse_tipo(tipo_uri)

            fecha_raw = row.get("date", {}).get("value", "")
            fecha = fecha_raw[:10] if fecha_raw else ""

            seen[id_norma] = {
                "idNorma": id_norma,
                "tipo": tipo,
                "fechaPublicacion": fecha,
            }

        # Advance keyset cursor
        last_code = max(
            int(r["code"]["value"])
            for r in bindings
            if r.get("code", {}).get("value", "").isdigit()
        )

        count = len(seen)
        if count - last_log_count >= LOG_EVERY:
            log.info("  … %d entries fetched (last_code=%d)", count, last_code)
            last_log_count = count

        if len(bindings) < SPARQL_PAGE_SIZE:
            break  # last page

        time.sleep(1.0)  # respect the endpoint's rate limit

    catalog = sorted(seen.values(), key=lambda e: e["idNorma"])
    log.info("Catalog complete: %d normas", len(catalog))
    return catalog


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _catalog_path(data_root: Path) -> Path:
    return data_root / CATALOG_FILE


def _catalog_age_days(data_root: Path) -> float:
    p = _catalog_path(data_root)
    if not p.exists():
        return float("inf")
    mtime = datetime.fromtimestamp(p.stat().st_mtime)
    return (datetime.now() - mtime).total_seconds() / 86400


def load_catalog(data_root: Path) -> list[dict]:
    p = _catalog_path(data_root)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Failed to load %s: %s", p, exc)
        return []


def save_catalog(catalog: list[dict], data_root: Path) -> None:
    p = _catalog_path(data_root)
    p.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("Wrote %d entries to %s", len(catalog), p)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch a complete BCN SPARQL catalog of all Chilean legal norms."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch even if catalog.json is recent (< 7 days old).",
    )
    parser.add_argument(
        "--data-root",
        metavar="PATH",
        help="Override DATA_ROOT (default: auto-detect via detect_data_root()).",
    )
    args = parser.parse_args()

    data_root = Path(args.data_root).resolve() if args.data_root else detect_data_root()
    log.info("DATA_ROOT: %s", data_root)

    age = _catalog_age_days(data_root)

    if not args.force and age < CATALOG_MAX_AGE_DAYS:
        existing = load_catalog(data_root)
        log.info(
            "catalog.json is %.1f days old (%d entries) — skipping fetch. "
            "Use --force to re-fetch.",
            age, len(existing),
        )
        return

    if age == float("inf"):
        log.info("catalog.json not found — fetching from BCN SPARQL ...")
    else:
        log.info("catalog.json is %.1f days old — refreshing ...", age)

    catalog = fetch_catalog()
    if not catalog:
        log.error("SPARQL returned no results — aborting")
        sys.exit(1)

    save_catalog(catalog, data_root)


if __name__ == "__main__":
    main()
