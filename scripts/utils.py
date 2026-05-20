"""
Shared utilities for the ley-chile pipeline scripts.

Provides:
  - AdaptiveLimiter  — async TCP AIMD-style concurrency limiter
  - classify         — law title classifier (modificatoria vs sustantiva)
  - law_dir          — canonical directory path for a norma
  - detect_data_root — auto-detect DATA_ROOT from env / historial worktree
"""

import asyncio
import json
import os
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# DATA_ROOT detection
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parent.parent


def detect_data_root() -> Path:
    """Auto-detect DATA_ROOT from env var or ./historial worktree."""
    env = os.environ.get("LEYCHILE_DATA_ROOT")
    if env:
        return Path(env).resolve()
    hist = _REPO_ROOT / "historial"
    if hist.is_dir() and (hist / ".git").exists():
        return hist
    return _REPO_ROOT


# ---------------------------------------------------------------------------
# AdaptiveLimiter — async TCP AIMD concurrency limiter
# ---------------------------------------------------------------------------


class AdaptiveLimiter:
    """Adaptive concurrency limiter using TCP AIMD (no hardcoded rate limits).

    Usage::

        limiter = AdaptiveLimiter()
        async with limiter:
            resp = await fetch(...)
        # caller decides success / rate-limit after the block:
        await limiter.on_success(latency_ms)
        # or:
        await limiter.on_rate_limit()
    """

    def __init__(self, start: int = 5, min_c: int = 1, max_c: int = 50) -> None:
        self._min = min_c
        self._max = max_c
        self._concurrency = max(min_c, min(start, max_c))
        self._sem = asyncio.Semaphore(self._concurrency)
        self._lock = asyncio.Lock()
        self._streak = 0  # consecutive successes since last resize

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, *_):
        await self.release()

    async def acquire(self):
        await self._sem.acquire()

    async def release(self):
        self._sem.release()

    # ------------------------------------------------------------------
    # Feedback signals
    # ------------------------------------------------------------------

    async def on_success(self, latency_ms: float = 0.0) -> None:
        """Additive increase: every 20 consecutive successes raise concurrency by 1."""
        async with self._lock:
            self._streak += 1
            if self._streak >= 20 and self._concurrency < self._max:
                await self._resize(self._concurrency + 1)
                self._streak = 0

    async def on_rate_limit(self) -> None:
        """Multiplicative decrease: halve concurrency and sleep with exponential backoff."""
        async with self._lock:
            new_c = max(self._min, self._concurrency // 2)
            self._streak = 0
            await self._resize(new_c)
        # Back off more aggressively the lower the concurrency
        backoff = 2 ** max(0, 3 - new_c)
        await asyncio.sleep(backoff)

    async def on_error(self, attempt: int) -> None:
        """Exponential backoff for transient errors (not rate limits)."""
        delay = min(60, 2 ** attempt)
        await asyncio.sleep(delay)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _resize(self, new_c: int) -> None:
        """Replace the semaphore with one of the new capacity.

        Drains the old semaphore down to 0 (capturing any already-held
        slots) then creates a fresh one so in-flight tasks are not
        interrupted — they hold the old semaphore slot and will release it,
        but new acquires go through the new semaphore.
        """
        new_c = max(self._min, min(new_c, self._max))
        if new_c == self._concurrency:
            return
        # Build a fresh semaphore; existing holders are unaffected because
        # they hold a reference to the old one via acquire().
        self._concurrency = new_c
        self._sem = asyncio.Semaphore(new_c)

    @property
    def concurrency(self) -> int:
        return self._concurrency


# ---------------------------------------------------------------------------
# Law classification
# ---------------------------------------------------------------------------

_MODIF_PREFIXES = (
    "MODIFICA ",
    "INTRODUCE MODIFICACIONES",
    "NORMAS ADECUATORIAS",
    "DEROGA ",
    "MODIFÍCASE",
)


def classify(titulo: str) -> str:
    """Return 'modificatoria' or 'sustantiva'."""
    t = (titulo or "").upper().strip()
    return "modificatoria" if any(t.startswith(p) for p in _MODIF_PREFIXES) else "sustantiva"


# ---------------------------------------------------------------------------
# Directory helpers
# ---------------------------------------------------------------------------


def tipo_slug(tipo: str) -> str:
    """Normalize a norma tipo (LeyChile Spanish string or BCN slug) to a folder slug.

    An empty tipo defaults to 'ley' so legacy callers keep working.
    """
    t = (tipo or "").strip().lower()
    if t in ("", "ley"):
        return "ley"
    if t in ("dl", "decreto ley", "decreto-ley"):
        return "dl"
    if t in ("dfl", "decreto con fuerza de ley", "decreto-fuerza-ley"):
        return "dfl"
    if t in ("dto", "decreto", "decreto supremo", "decreto-supremo"):
        return "dto"
    slug = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return slug or "otras"


def _organismo_slug(organismo: str) -> str:
    """Slugify an organismo name for use as a directory component."""
    if not organismo:
        return "sin-organismo"
    return re.sub(r"[^a-z0-9]+", "-", organismo.lower()).strip("-") or "sin-organismo"


def _dl_period_folder(fecha_pub: str, fecha_promulgacion: str = "") -> str:
    """Return the DL base folder name based on publication (or promulgation) year."""
    for fecha in (fecha_pub, fecha_promulgacion):
        if fecha and len(fecha) >= 4 and fecha[:4].isdigit():
            year = int(fecha[:4])
            if year < 1930:
                return "dl-1924"
            if year < 1950:
                return "dl-1932"
            return "dl"
    return "dl"


def _collision_free_path(proposed: Path, id_norma: int | None) -> Path:
    """If proposed dir exists with a different idNorma in metadata.json, append a suffix."""
    if id_norma is None:
        return proposed
    mf = proposed / "metadata.json"
    if mf.exists():
        try:
            existing_id = json.loads(mf.read_text(encoding="utf-8")).get("idNorma")
            if existing_id is not None and existing_id != id_norma:
                return proposed.parent / f"{proposed.name}-{id_norma}"
        except Exception:
            pass
    return proposed


def law_dir(
    numero: str,
    clasificacion: str,
    tipo: str = "",
    id_norma: int | None = None,
    fecha: str = "",
    fecha_promulgacion: str = "",
    organismo: str = "",
    data_root: Path | None = None,
) -> Path:
    """Return the data_root-relative directory for a law.

    Leyes use {leyes,modificaciones}/{numero} — globally unique series.

    Decreto Ley uses period-prefixed folders keyed by numero:
      dl/{numero}        — 1973–1981 series (main, 3601 DLs)
      dl-1924/{numero}   — 1924–1926 series
      dl-1932/{numero}   — 1932 series
    On a collision (same numero already exists with a different idNorma), the
    suffix -{id_norma} is appended.

    DFL and Decreto use {slug}/{organismo-slug}/{numero}, falling back to
    {numero}-{id_norma} on a collision within the same organismo.

    All other types fall back to idNorma-keyed directories.

    Args:
        data_root: explicit root directory; defaults to detect_data_root().
    """
    root = data_root if data_root is not None else detect_data_root()
    slug = tipo_slug(tipo)
    is_modif = clasificacion == "modificatoria"
    suffix = "-modificaciones" if is_modif else ""

    if slug == "ley":
        folder = "modificaciones" if is_modif else "leyes"
        return root / folder / numero

    if slug == "dl":
        period = _dl_period_folder(fecha, fecha_promulgacion)
        base = root / f"{period}{suffix}"
        return _collision_free_path(base / numero, id_norma)

    if slug in ("dfl", "dto"):
        org_slug = _organismo_slug(organismo)
        base = root / f"{slug}{suffix}" / org_slug
        return _collision_free_path(base / numero, id_norma)

    # Fallback: idNorma-keyed for unknown types
    folder = f"{slug}{suffix}"
    key = str(id_norma) if id_norma else numero
    return root / folder / key
