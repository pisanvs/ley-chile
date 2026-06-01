"""Centralized LeyChile HTTP client.

All network access to LeyChile and BCN goes through this module.
Consolidates what was previously duplicated across fetch_normas.py,
fetch_versions.py, and sync_daily.py:

  - WAF bypass headers (CloudFront returns ~264-byte non-JSON for
    cloud-IP requests with sparse headers — full Chrome set bypasses it)
  - Thread-local session reuse
  - Silent-block detection (HTTP 200 with tiny non-JSON body)
  - AdaptiveLimiter integration
  - Retry policy with exponential backoff

Usage::

    from pipeline.client import LeyChileClient, SilentBlockError

    client = LeyChileClient()
    data = client.get_norma_json(id_norma=1973)        # blocking
    data = client.get_versioned_norma(id_norma=1973, fecha="1857-01-01")
"""

from __future__ import annotations

import json
import logging
import sys
import threading
import time
from pathlib import Path
from typing import Any

import requests

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Full Chrome-style header set. LeyChile's CloudFront WAF returns a small
#: (~264 byte) non-JSON HTTP 200 body to cloud-IP requests with sparse headers.
#: This set reliably gets real JSON from both residential and GH Actions IPs.
WAF_BYPASS_HEADERS: dict[str, str] = {
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

#: Endpoints
_BASE_NORMA_URL = "https://nuevo.leychile.cl/servicios/Navegar/get_norma_json"
_BASE_VERSION_URL = "https://www.leychile.cl/Consulta/obtxml"
_RECENT_NORMAS_URL = "https://www.leychile.cl/Consulta/Exportar"

#: Silent-block threshold: responses at or below this byte count that are not
#: valid JSON are treated as IP-level WAF blocks, not transient errors.
_SILENT_BLOCK_MAX_BYTES = 500

#: Sentinel date LeyChile uses for open-ended "current" versions.
_SENTINEL_YEAR = 2100


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class SilentBlockError(Exception):
    """HTTP 200 with a tiny non-JSON body — CloudFront WAF blocked the IP."""


class RateLimitError(Exception):
    """HTTP 429 or 503 — server-side rate limit."""


class PermanentError(Exception):
    """HTTP 500 or other non-retryable server error."""


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

_thread_local = threading.local()


def _get_session() -> requests.Session:
    """Return a thread-local requests.Session with WAF bypass headers preset."""
    if not hasattr(_thread_local, "session"):
        s = requests.Session()
        s.headers.update(WAF_BYPASS_HEADERS)
        _thread_local.session = s
    return _thread_local.session


# ---------------------------------------------------------------------------
# Silent-block detection
# ---------------------------------------------------------------------------


def is_silent_block(response: requests.Response) -> bool:
    """True if the response looks like a CloudFront WAF silent block.

    Characteristics:
      - HTTP 200 (the WAF doesn't 403 — it silently substitutes a page)
      - Body is tiny (≤ _SILENT_BLOCK_MAX_BYTES bytes)
      - Body is not valid JSON
    """
    if response.status_code != 200:
        return False
    raw = response.content
    if len(raw) > _SILENT_BLOCK_MAX_BYTES:
        return False
    try:
        json.loads(raw)
        return False  # small but valid JSON — not a block
    except (ValueError, UnicodeDecodeError):
        return True


# ---------------------------------------------------------------------------
# Core HTTP helpers
# ---------------------------------------------------------------------------


def _get_with_retry(
    url: str,
    params: dict | None = None,
    *,
    max_retries: int = 3,
    session: requests.Session | None = None,
    timeout: int = 30,
) -> requests.Response:
    """GET with exponential backoff on transient errors.

    Raises:
        SilentBlockError: WAF silent block detected.
        RateLimitError: 429 / 503.
        PermanentError: 500 (treat as permanent per project convention).
        requests.RequestException: unrecoverable network error after retries.
    """
    sess = session or _get_session()
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            resp = sess.get(url, params=params, timeout=timeout)
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(min(60, 2 ** attempt))
                continue
            raise

        if is_silent_block(resp):
            raise SilentBlockError(
                f"WAF silent block at {url} — body {len(resp.content)} bytes"
            )

        if resp.status_code in (429, 503):
            raise RateLimitError(f"Rate limited: HTTP {resp.status_code} at {url}")

        if resp.status_code == 500:
            raise PermanentError(f"HTTP 500 at {url} — treating as permanent")

        if resp.status_code != 200:
            if attempt < max_retries:
                time.sleep(min(60, 2 ** attempt))
                continue
            resp.raise_for_status()

        return resp

    # Should not reach here, but satisfy type checker
    if last_exc:
        raise last_exc
    raise RuntimeError(f"GET failed after {max_retries} retries: {url}")


# ---------------------------------------------------------------------------
# LeyChileClient
# ---------------------------------------------------------------------------


class LeyChileClient:
    """Stateless (thread-safe) client for LeyChile and BCN APIs.

    All methods are synchronous and blocking — use them from threads, not
    from an asyncio event loop directly (the AdaptiveLimiter in fetch_versions
    dispatches these via ThreadPoolExecutor).

    Args:
        max_retries: per-request retry budget for transient errors.
        timeout: HTTP request timeout in seconds.
    """

    def __init__(self, max_retries: int = 3, timeout: int = 30) -> None:
        self._max_retries = max_retries
        self._timeout = timeout

    # ------------------------------------------------------------------
    # Norma JSON (get_norma_json endpoint)
    # ------------------------------------------------------------------

    def get_norma_json(
        self,
        id_norma: int,
        *,
        session: requests.Session | None = None,
    ) -> dict[str, Any]:
        """Fetch the current-version norma JSON for ``id_norma``.

        Returns the parsed JSON dict.

        Raises SilentBlockError, RateLimitError, PermanentError, or
        requests.RequestException on unrecoverable errors.
        """
        resp = _get_with_retry(
            _BASE_NORMA_URL,
            params={"idNorma": id_norma, "opt": 1},
            max_retries=self._max_retries,
            session=session,
            timeout=self._timeout,
        )
        return resp.json()

    # ------------------------------------------------------------------
    # Versioned norma XML/JSON (obtxml endpoint)
    # ------------------------------------------------------------------

    def get_versioned_norma(
        self,
        id_norma: int,
        fecha: str,
        *,
        session: requests.Session | None = None,
    ) -> dict[str, Any]:
        """Fetch the norma JSON for a specific version date (YYYY-MM-DD).

        LeyChile's ``opt=7`` endpoint returns the same JSON shape as
        ``get_norma_json`` but scoped to a specific publication date.

        Raises SilentBlockError, RateLimitError, PermanentError, or
        requests.RequestException on unrecoverable errors.
        """
        resp = _get_with_retry(
            _BASE_NORMA_URL,
            params={"idNorma": id_norma, "idVersion": fecha},
            max_retries=self._max_retries,
            session=session,
            timeout=self._timeout,
        )
        return resp.json()

    # ------------------------------------------------------------------
    # Recent normas (opt=40)
    # ------------------------------------------------------------------

    def get_recent_normas(self, days: int = 3) -> list[dict[str, Any]]:
        """Fetch recently dispatched normas via the opt=40 XML endpoint.

        Returns a list of dicts with at minimum ``idNorma`` and
        ``fechaPublicacion`` keys. Returns an empty list on any error
        (non-fatal: the main pipeline still runs without recent additions).
        """
        try:
            resp = _get_with_retry(
                _RECENT_NORMAS_URL,
                params={"opt": 40, "daysBack": days},
                max_retries=2,
                timeout=self._timeout,
            )
        except Exception as exc:
            log.warning("get_recent_normas: %s — returning empty list", exc)
            return []

        try:
            from xml.etree import ElementTree as ET
            root = ET.fromstring(resp.content)
            results = []
            for norma in root.iter("Norma"):
                id_norma = norma.findtext("idNorma")
                fecha = norma.findtext("fechaPublicacion")
                if id_norma:
                    results.append({
                        "idNorma": int(id_norma),
                        "fechaPublicacion": fecha or "",
                    })
            return results
        except Exception as exc:
            log.warning("get_recent_normas: XML parse error — %s", exc)
            return []

    # ------------------------------------------------------------------
    # Sentinel date helper
    # ------------------------------------------------------------------

    @staticmethod
    def is_sentinel_date(date_str: str) -> bool:
        """True if ``date_str`` is LeyChile's open-ended sentinel (year > 2100)."""
        try:
            return int(date_str[:4]) > _SENTINEL_YEAR
        except (ValueError, IndexError):
            return False
