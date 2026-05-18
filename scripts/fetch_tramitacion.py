"""
Fetch and store parliamentary tramitación data for a law.

Usage:
    python scripts/fetch_tramitacion.py --numero 20000
    python scripts/fetch_tramitacion.py --numero 20000 --boletin 3182

Writes {law_dir}/tramitacion.json with:
{
  "boletin": "3182-07",
  "titulo": "...",
  "camara_origen": "C.Diputados",
  "fecha_ingreso": "2001-07-19",
  "etapa": "Tramitación terminada",
  "tramitacion": [
    {"fecha": "2001-07-19", "sesion": "47/347", "camara": "Senado", "etapa": "...", "descripcion": "..."},
    ...
  ],
  "votaciones_camara": [
    {"fecha": "2004-12-15", "sesion_id": 123, "sesion_numero": 45, "tipo": "General", "resultado": "Aprobado",
     "afirmativos": 67, "negativos": 12, "abstenciones": 3, "tramite": "TERCER TRÁMITE"},
    ...
  ]
}
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent

SENATE_BASE = "https://tramitacion.senado.cl/wspublico/tramitacion.php"
CHAMBER_BASE = "https://opendata.congreso.cl/wscamaradiputados.asmx/getVotaciones_Boletin"

RATE_DELAY = 0.3  # seconds between requests per domain

USER_AGENT = "ley-chile/0.1 (https://github.com/pisanvs/ley-chile; civic open data)"

# Approximate boletín ranges by year of law introduction
YEAR_BOLETIN_RANGES = [
    (1990, 1995, 800, 1800),
    (1996, 2000, 1800, 2600),
    (2001, 2005, 2600, 3600),
    (2006, 2010, 3600, 6000),
    (2011, 2015, 6000, 9500),
    (2016, 2020, 9500, 13000),
    (2021, 2024, 13000, 17000),
]

# Track last request times per domain
_last_request: dict[str, float] = {}


def _rate_limit(domain: str) -> None:
    """Sleep if necessary to respect rate limit for the given domain."""
    now = time.monotonic()
    last = _last_request.get(domain, 0.0)
    elapsed = now - last
    if elapsed < RATE_DELAY:
        time.sleep(RATE_DELAY - elapsed)
    _last_request[domain] = time.monotonic()


def _get(url: str, domain: str, **kwargs) -> requests.Response:
    _rate_limit(domain)
    headers = kwargs.pop("headers", {})
    headers.setdefault("User-Agent", USER_AGENT)
    resp = requests.get(url, headers=headers, timeout=30, **kwargs)
    resp.raise_for_status()
    return resp


def _post(url: str, domain: str, **kwargs) -> requests.Response:
    _rate_limit(domain)
    headers = kwargs.pop("headers", {})
    headers.setdefault("User-Agent", USER_AGENT)
    resp = requests.post(url, headers=headers, timeout=30, **kwargs)
    resp.raise_for_status()
    return resp


def _parse_date_dmy(date_str: str) -> Optional[str]:
    """Convert DD/MM/YYYY to YYYY-MM-DD. Returns None on failure."""
    if not date_str:
        return None
    parts = date_str.strip().split("/")
    if len(parts) == 3:
        d, m, y = parts
        try:
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        except ValueError:
            pass
    return None


def _ley_numero_to_int(leynro: str) -> Optional[int]:
    """
    Convert "Ley Nº 20.000" or "Ley N° 20.000" to integer 20000.
    Returns None if not parseable.
    """
    if not leynro:
        return None
    # Strip prefix words
    text = leynro.strip()
    for prefix in ("Ley Nº", "Ley N°", "Ley No", "Ley", "LEY"):
        if text.upper().startswith(prefix.upper()):
            text = text[len(prefix):].strip()
            break
    # Remove dots used as thousands separators
    text = text.replace(".", "").replace(",", "").strip()
    try:
        return int(text)
    except ValueError:
        return None


def _fetch_senate_xml(boletin_numero: str) -> Optional[ET.Element]:
    """Fetch tramitacion XML for a boletín numeric part. Returns root element or None."""
    try:
        resp = _get(SENATE_BASE, "tramitacion.senado.cl", params={"boletin": boletin_numero})
        root = ET.fromstring(resp.content)
        return root
    except Exception as exc:
        log.debug("Failed to fetch boletín %s: %s", boletin_numero, exc)
        return None


def _extract_leynro(root: ET.Element) -> Optional[str]:
    """Extract leynro from <descripcion> in a Senate tramitacion XML."""
    desc = root.find(".//descripcion")
    if desc is None:
        return None
    leynro_el = desc.find("leynro")
    if leynro_el is None:
        return None
    return (leynro_el.text or "").strip()


def _year_to_boletin_range(year: int) -> tuple[int, int]:
    """Return (lo, hi) boletín search range for laws introduced in the given year."""
    for y_start, y_end, b_lo, b_hi in YEAR_BOLETIN_RANGES:
        if y_start <= year <= y_end:
            return b_lo, b_hi
    if year > 2024:
        return 17000, 20000
    # Before 1990 — no digital data
    return 0, 0


def _find_boletin_in_range(target_ley: int, lo: int, hi: int) -> Optional[str]:
    """
    Binary search for the boletín whose leynro matches target_ley.
    Returns the full boletín string (e.g. "3182-07") or None.

    Strategy:
    - We want to find boletín N such that parse(leynro(N)) == target_ley.
    - The boletín → ley mapping is roughly monotone (higher boletín = higher ley number),
      but with many gaps (empty boletínes, bills that never became law, etc.).
    - We do a binary search on the numeric value, skipping empties, then scan nearby.
    """
    max_requests = 20
    requests_used = 0

    # Phase 1: binary search to home in on the right range
    search_lo = lo
    search_hi = hi
    best_mid = (search_lo + search_hi) // 2

    while search_lo < search_hi and requests_used < max_requests - 5:
        mid = (search_lo + search_hi) // 2
        requests_used += 1
        log.debug("Binary search: lo=%d hi=%d mid=%d (req %d)", search_lo, search_hi, mid, requests_used)

        root = _fetch_senate_xml(str(mid))
        if root is None:
            # Network error — widen the range a bit
            search_hi = mid - 1
            continue

        leynro_str = _extract_leynro(root)
        leynro_int = _ley_numero_to_int(leynro_str) if leynro_str else None

        if leynro_int is None:
            # Empty boletín (bill, not a ley, or no data) — try to go toward target
            # Heuristic: step toward the expected side
            mid_step = 50
            probe_hi = min(mid + mid_step, search_hi)
            probe_lo = max(mid - mid_step, search_lo)
            # Try the high side first (boletín numbers are increasing over time)
            if probe_hi != mid and requests_used < max_requests - 4:
                requests_used += 1
                r2 = _fetch_senate_xml(str(probe_hi))
                if r2 is not None:
                    ln2 = _ley_numero_to_int(_extract_leynro(r2) or "")
                    if ln2 is not None:
                        if ln2 < target_ley:
                            search_lo = probe_hi
                        else:
                            search_hi = mid
                        continue
            search_hi = mid - 1
            continue

        if leynro_int == target_ley:
            # Found it — extract full boletín string
            desc = root.find(".//descripcion")
            if desc is not None:
                boletin_el = desc.find("boletin")
                if boletin_el is not None and boletin_el.text:
                    return boletin_el.text.strip()
            return str(mid)

        if leynro_int < target_ley:
            search_lo = mid + 1
        else:
            search_hi = mid - 1

        best_mid = mid

    # Phase 2: linear scan around the converged area
    scan_center = (search_lo + search_hi) // 2
    scan_range = 100
    scan_start = max(lo, scan_center - scan_range)
    scan_end = min(hi, scan_center + scan_range)

    for b in range(scan_start, scan_end + 1):
        if requests_used >= max_requests:
            break
        requests_used += 1
        root = _fetch_senate_xml(str(b))
        if root is None:
            continue
        leynro_str = _extract_leynro(root)
        leynro_int = _ley_numero_to_int(leynro_str) if leynro_str else None
        if leynro_int == target_ley:
            desc = root.find(".//descripcion")
            if desc is not None:
                boletin_el = desc.find("boletin")
                if boletin_el is not None and boletin_el.text:
                    return boletin_el.text.strip()
            return str(b)

    return None


def find_boletin(numero_ley: str) -> Optional[str]:
    """
    Find the Senate boletín string for a law by its number.

    Performs a binary search over the boletín range appropriate for the
    law's approximate introduction year (derived from the law number itself
    as a rough heuristic — higher law numbers → more recent).

    Returns the full boletín string like "3182-07", or None if not found
    or if the law predates digital records (published before 1990).
    """
    try:
        ley_int = int(numero_ley)
    except ValueError:
        log.warning("Cannot parse law number: %s", numero_ley)
        return None

    # Rough year estimate from law number
    # Chilean law numbers in thousands map approximately to decades:
    # 18000s → mid-1980s; 19000s → 1990s; 20000s → 2000s; 21000s → 2010s+
    # This is only used to pick the boletín search range.
    if ley_int < 18500:
        # Before ~1990 — no digital boletín data
        log.info("Ley %s predates digital boletín records (pre-1990), skipping", numero_ley)
        return None

    # Map law number ranges to approximate years of publication
    if ley_int < 19000:
        year = 1987
    elif ley_int < 19300:
        year = 1993
    elif ley_int < 19500:
        year = 1995
    elif ley_int < 19700:
        year = 1997
    elif ley_int < 19900:
        year = 1999
    elif ley_int < 20100:
        year = 2001 if ley_int < 20000 else 2005
    elif ley_int < 20300:
        year = 2007
    elif ley_int < 20600:
        year = 2011
    elif ley_int < 20900:
        year = 2014
    elif ley_int < 21000:
        year = 2016
    elif ley_int < 21300:
        year = 2018
    elif ley_int < 21600:
        year = 2021
    else:
        year = 2023

    lo, hi = _year_to_boletin_range(year)
    if lo == 0 and hi == 0:
        log.info("Ley %s predates digital boletín records, skipping", numero_ley)
        return None

    log.info("Searching for boletín of Ley %s in range %d–%d (year ~%d)", numero_ley, lo, hi, year)
    return _find_boletin_in_range(ley_int, lo, hi)


def fetch_senate_data(boletin_numero: str) -> dict:
    """
    Fetch and parse Senate tramitacion.php for the given boletín number
    (numeric part only, e.g. "3182" from "3182-07").

    Returns a dict with keys:
        boletin, titulo, camara_origen, fecha_ingreso, etapa, tramitacion
    """
    root = _fetch_senate_xml(boletin_numero)
    if root is None:
        return {}

    result: dict = {}

    desc = root.find(".//descripcion")
    if desc is not None:
        boletin_el = desc.find("boletin")
        if boletin_el is not None:
            result["boletin"] = (boletin_el.text or "").strip()

        titulo_el = desc.find("titulo")
        if titulo_el is not None:
            result["titulo"] = (titulo_el.text or "").strip()

        camara_el = desc.find("camara_origen")
        if camara_el is not None:
            result["camara_origen"] = (camara_el.text or "").strip()

        fecha_el = desc.find("fecha_ingreso")
        if fecha_el is not None:
            raw = (fecha_el.text or "").strip()
            result["fecha_ingreso"] = _parse_date_dmy(raw) or raw

        etapa_el = desc.find("etapa")
        if etapa_el is not None:
            result["etapa"] = (etapa_el.text or "").strip()

    tramitacion_steps = []
    for tramite in root.findall(".//tramitacion/tramite"):
        step: dict = {}

        sesion_el = tramite.find("SESION")
        if sesion_el is not None:
            step["sesion"] = (sesion_el.text or "").strip()

        fecha_el = tramite.find("FECHA")
        if fecha_el is not None:
            raw = (fecha_el.text or "").strip()
            step["fecha"] = _parse_date_dmy(raw) or raw

        desc_el = tramite.find("DESCRIPCIONTRAMITE")
        if desc_el is not None:
            step["descripcion"] = (desc_el.text or "").strip()

        etapa_el = tramite.find("ETAPDESCRIPCION")
        if etapa_el is not None:
            step["etapa"] = (etapa_el.text or "").strip()

        camara_el = tramite.find("CAMARATRAMITE")
        if camara_el is not None:
            step["camara"] = (camara_el.text or "").strip()

        if step:
            tramitacion_steps.append(step)

    result["tramitacion"] = tramitacion_steps
    return result


def fetch_chamber_votes(boletin: str) -> list[dict]:
    """
    Fetch Chamber of Deputies voting records for the given boletín string.

    Uses numeric part only (strips the "-XX" suffix if present).
    Returns list of vote dicts.
    """
    # Extract numeric part
    boletin_num = boletin.split("-")[0].strip()

    try:
        resp = _post(
            CHAMBER_BASE,
            "opendata.congreso.cl",
            data={"prmBoletin": boletin_num},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    except Exception as exc:
        log.warning("Chamber votes fetch failed for boletín %s: %s", boletin, exc)
        return []

    try:
        # The response may have a namespace
        content = resp.content
        # Strip namespace for simpler parsing
        content_str = content.decode("utf-8", errors="replace")
        # Remove namespace declarations so ElementTree doesn't balk
        import re
        content_str = re.sub(r' xmlns[^"]*"[^"]*"', "", content_str)
        root = ET.fromstring(content_str)
    except Exception as exc:
        log.warning("Failed to parse chamber votes XML for boletín %s: %s", boletin, exc)
        return []

    votes = []
    for votacion in root.findall(".//Votacion"):
        vote: dict = {}

        fecha_el = votacion.find("Fecha")
        if fecha_el is not None:
            # Fecha is ISO8601 — may have time component
            raw = (fecha_el.text or "").strip()
            vote["fecha"] = raw[:10] if raw else ""

        tipo_el = votacion.find("Tipo")
        if tipo_el is not None:
            vote["tipo"] = (tipo_el.text or "").strip()

        resultado_el = votacion.find("Resultado")
        if resultado_el is not None:
            vote["resultado"] = (resultado_el.text or "").strip()

        quorum_el = votacion.find("Quorum")
        if quorum_el is not None:
            vote["quorum"] = (quorum_el.text or "").strip()

        sesion = votacion.find("Sesion")
        if sesion is not None:
            sesion_id_el = sesion.find("ID")
            if sesion_id_el is not None:
                try:
                    vote["sesion_id"] = int(sesion_id_el.text or 0)
                except ValueError:
                    vote["sesion_id"] = sesion_id_el.text

            sesion_num_el = sesion.find("Numero")
            if sesion_num_el is not None:
                try:
                    vote["sesion_numero"] = int(sesion_num_el.text or 0)
                except ValueError:
                    vote["sesion_numero"] = sesion_num_el.text

            sesion_fecha_el = sesion.find("Fecha")
            if sesion_fecha_el is not None:
                raw = (sesion_fecha_el.text or "").strip()
                vote["sesion_fecha"] = raw[:10] if raw else ""

            sesion_tipo_el = sesion.find("Tipo")
            if sesion_tipo_el is not None:
                vote["sesion_tipo"] = (sesion_tipo_el.text or "").strip()

        tramite_el = votacion.find("Tramite")
        if tramite_el is not None:
            vote["tramite"] = (tramite_el.text or "").strip()

        afirm_el = votacion.find("TotalAfirmativos")
        if afirm_el is not None:
            try:
                vote["afirmativos"] = int(afirm_el.text or 0)
            except ValueError:
                vote["afirmativos"] = 0

        neg_el = votacion.find("TotalNegativos")
        if neg_el is not None:
            try:
                vote["negativos"] = int(neg_el.text or 0)
            except ValueError:
                vote["negativos"] = 0

        abst_el = votacion.find("TotalAbstenciones")
        if abst_el is not None:
            try:
                vote["abstenciones"] = int(abst_el.text or 0)
            except ValueError:
                vote["abstenciones"] = 0

        if vote:
            votes.append(vote)

    return votes


def _find_law_dir(numero: str) -> Optional[Path]:
    """Find the directory for a law (leyes/ or modificaciones/)."""
    for subdir in ("leyes", "modificaciones"):
        candidate = REPO_ROOT / subdir / numero
        if candidate.is_dir():
            return candidate
    return None


def fetch_and_write(numero: str, boletin_override: Optional[str] = None) -> Optional[Path]:
    """
    Main entry point: find boletín, fetch tramitacion data, write to disk.

    Args:
        numero: law number string (e.g. "20000")
        boletin_override: if provided, skip the search and use this boletín number

    Returns the path to the written tramitacion.json, or None on failure.
    """
    law_dir = _find_law_dir(numero)
    if law_dir is None:
        log.error("Cannot find directory for ley %s in leyes/ or modificaciones/", numero)
        return None

    # Determine boletín
    if boletin_override:
        boletin_num = boletin_override.split("-")[0].strip()
        boletin_full = boletin_override
    else:
        log.info("Searching for boletín of Ley %s ...", numero)
        boletin_full = find_boletin(numero)
        if boletin_full is None:
            log.warning("Could not find boletín for Ley %s — writing minimal tramitacion.json", numero)
            out_path = law_dir / "tramitacion.json"
            out_path.write_text(
                json.dumps({"boletin": None, "tramitacion": [], "votaciones_camara": []},
                           ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return out_path
        boletin_num = boletin_full.split("-")[0].strip()
        log.info("Found boletín: %s", boletin_full)

    # Fetch Senate tramitacion data
    log.info("Fetching Senate tramitacion for boletín %s ...", boletin_num)
    senate_data = fetch_senate_data(boletin_num)

    # Merge boletín string (prefer the one from the API if it has a suffix)
    if senate_data.get("boletin"):
        boletin_full = senate_data["boletin"]
    else:
        senate_data["boletin"] = boletin_full

    # Fetch Chamber votes
    log.info("Fetching Chamber votes for boletín %s ...", boletin_full)
    votes = fetch_chamber_votes(boletin_full)
    senate_data["votaciones_camara"] = votes

    # Ensure required keys exist
    senate_data.setdefault("tramitacion", [])

    # Write to disk
    out_path = law_dir / "tramitacion.json"
    out_path.write_text(
        json.dumps(senate_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log.info("Written tramitacion data to %s (%d trámites, %d votos)",
             out_path, len(senate_data["tramitacion"]), len(votes))
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch parliamentary tramitación data for a Chilean law."
    )
    parser.add_argument(
        "--numero", required=True, metavar="NUMERO",
        help="Law number (e.g. 20000)"
    )
    parser.add_argument(
        "--boletin", default=None, metavar="BOLETIN",
        help="Boletín number (e.g. 3182 or 3182-07). If omitted, will be searched automatically."
    )
    args = parser.parse_args()

    result = fetch_and_write(args.numero, args.boletin)
    if result is None:
        sys.exit(1)
    log.info("Done: %s", result)


if __name__ == "__main__":
    main()
