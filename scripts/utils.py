"""
Shared utilities for the ley-chile pipeline scripts.

Provides:
  - AdaptiveLimiter  — async TCP AIMD-style concurrency limiter
  - classify         — law title classifier (modificatoria vs sustantiva)
  - law_dir          — canonical directory path for a norma
  - detect_data_root — auto-detect DATA_ROOT from env / historial worktree
"""

import asyncio
import gzip
import io
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CommitContext
# ---------------------------------------------------------------------------


@dataclass
class CommitContext:
    """All data needed to emit one git fast-import commit."""

    tipo: str          # "feat" | "update" | "derog" | "chore"
    scope: str         # "ley" | "modificacion" | "dl" | etc.
    ley_numero: str    # e.g. "20000"
    id_norma: int
    date: str          # YYYY-MM-DD
    titulo: str
    files: dict        # {git_path: bytes}
    deletes: list      # [git_path]
    symlinks: dict     # {git_path: target_str}
    subject: str       # commit message subject line
    body: str          # commit message body (multi-line OK)
    extra: dict = field(default_factory=dict)  # free-form for enrichers

    # Internal sequencing — used for tiebreaking sort within same date
    _seq: int = 0
    _rank: int = 0  # 0=feat, 1=update, 2=derog, 3=chore

    def sort_key(self) -> tuple:
        return (self.date, self.ley_numero, self._rank, self._seq)


# ---------------------------------------------------------------------------
# diffs cache I/O — gzip-compressed JSON
# ---------------------------------------------------------------------------
#
# Diff files (`cache/diffs/{id}.json.gz`) embed full per-version HTML payloads
# and grow large for codes / heavily-amended laws. We write gzip to keep them
# under GitHub's 100 MB blob limit (typical 10× shrink on HTML-heavy JSON).
# Readers transparently accept legacy plain `.json` so a partially-migrated
# cache works during the transition.


# Sharding threshold for sharded diff dirs. GitHub rejects any blob > 100 MB.
# 80 MB leaves headroom for size estimation slack and future growth of a shard
# between commits.
DIFF_SHARD_THRESHOLD_BYTES = 80 * 1024 * 1024


def find_diff_path(diffs_dir: Path, id_norma: int | str) -> Path | None:
    """Return the existing diffs path for a norma.

    Resolution order:
      1. `diffs/{id}.json.gz` (single-file gzipped — current default)
      2. `diffs/{id}.json` (legacy plain json — read-only, still supported)
      3. `diffs/{id}/` (sharded — directory of `NNNNN.json.gz` chunks for
         normas whose serialized diff exceeds GitHub's 100 MB blob limit)
    """
    gz = diffs_dir / f"{id_norma}.json.gz"
    if gz.exists():
        return gz
    raw = diffs_dir / f"{id_norma}.json"
    if raw.exists():
        return raw
    sharded = diffs_dir / str(id_norma)
    if sharded.is_dir() and any(sharded.glob("*.json.gz")):
        return sharded
    return None


def load_diff_file(path: Path) -> Any:
    """Load a diffs cache file or sharded directory.

    For a sharded directory, every `*.json.gz` shard (sorted lexically) is
    loaded and its list-contents concatenated in order. Shards must each
    contain a JSON list — the writer guarantees this.
    """
    if path.is_dir():
        merged: list = []
        for shard in sorted(path.glob("*.json.gz")):
            with gzip.open(shard, "rt", encoding="utf-8") as f:
                part = json.load(f)
            if not isinstance(part, list):
                raise ValueError(
                    f"sharded diff {shard} did not contain a list "
                    f"(got {type(part).__name__})"
                )
            merged.extend(part)
        return merged
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    return json.loads(path.read_text(encoding="utf-8"))


def _write_single_gz(path: Path, payload: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with gzip.open(tmp, "wb") as f:
        f.write(payload)
    tmp.replace(path)


def write_diff_file(diffs_dir: Path, id_norma: int | str, data: Any) -> Path:
    """Write the diffs cache for a norma.

    Small enough to fit GitHub's 100 MB blob limit → single
    `diffs/{id}.json.gz`. Otherwise sharded: split the entry list into
    equal-count chunks so each shard's gzipped size stays under
    DIFF_SHARD_THRESHOLD_BYTES, written to `diffs/{id}/NNNNN.json.gz`.

    Decides single-vs-sharded by sampling entry sizes rather than
    serializing the full payload — for normas like 1077207 with ~1 GB of
    diff content, materializing the full string would exhaust memory.

    Always removes the other variant (file ↔ dir, plus any legacy
    `.json`) so on-disk state is canonical for a given norma.
    """
    import math

    diffs_dir.mkdir(parents=True, exist_ok=True)
    id_str = str(id_norma)

    gz_path = diffs_dir / f"{id_str}.json.gz"
    shard_dir = diffs_dir / id_str

    if not isinstance(data, list) or len(data) <= 1:
        # Non-list payloads and single-entry lists go straight to a single
        # file — sharding logic below assumes we can split a list across
        # multiple chunks. Small by construction; safe to materialize.
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        _write_single_gz(gz_path, payload)
        _cleanup_other_variants(diffs_dir, id_str, keep=gz_path)
        return gz_path

    # Estimate compressed size by sampling. Sample a few entries
    # individually; gzip them; extrapolate. This avoids holding the entire
    # raw payload in memory.
    sample_idx = [0, len(data) // 2, len(data) - 1]
    sampled_raw = 0
    sampled_compressed = 0
    for i in sample_idx:
        entry_bytes = json.dumps(data[i], ensure_ascii=False).encode("utf-8")
        sampled_raw += len(entry_bytes)
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as f:
            f.write(entry_bytes)
        sampled_compressed += buf.tell()
    # Per-entry estimates. Inflate by 5 % to leave slack for the worst
    # entry being above-average.
    avg_compressed_per_entry = (sampled_compressed / len(sample_idx)) * 1.05
    est_total_compressed = avg_compressed_per_entry * len(data)

    if est_total_compressed <= DIFF_SHARD_THRESHOLD_BYTES:
        # Single file fits. Serialize the full payload now — safe because
        # we just established it's <80 MB compressed (≤ a few GB raw).
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        _write_single_gz(gz_path, payload)
        _cleanup_other_variants(diffs_dir, id_str, keep=gz_path)
        return gz_path

    # Shard. Pick chunk count so each chunk's expected compressed size is
    # under the threshold.
    n_shards = max(2, math.ceil(est_total_compressed / (DIFF_SHARD_THRESHOLD_BYTES * 0.9)))
    n_shards = min(n_shards, len(data))
    chunk_size = math.ceil(len(data) / n_shards)

    shard_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for i in range(n_shards):
        chunk = data[i * chunk_size : (i + 1) * chunk_size]
        if not chunk:
            break
        chunk_bytes = json.dumps(chunk, ensure_ascii=False).encode("utf-8")
        shard_path = shard_dir / f"{i:05d}.json.gz"
        _write_single_gz(shard_path, chunk_bytes)
        written.append(shard_path)
        del chunk_bytes  # release ~chunk-size buffer before next iteration

    # Drop any stale older shards (e.g. previous run had more shards).
    for stale in shard_dir.glob("*.json.gz"):
        if stale not in written:
            stale.unlink()

    _cleanup_other_variants(diffs_dir, id_str, keep=shard_dir)
    return shard_dir


def _cleanup_other_variants(diffs_dir: Path, id_str: str, keep: Path) -> None:
    """Remove the non-canonical on-disk variants for a norma."""
    gz_path = diffs_dir / f"{id_str}.json.gz"
    legacy_path = diffs_dir / f"{id_str}.json"
    shard_dir = diffs_dir / id_str
    if keep != gz_path and gz_path.exists():
        gz_path.unlink()
    if legacy_path.exists():
        legacy_path.unlink()
    if keep != shard_dir and shard_dir.is_dir():
        for f in shard_dir.glob("*.json.gz"):
            f.unlink()
        try:
            shard_dir.rmdir()
        except OSError:
            pass
    return gz_path


def iter_diff_files(diffs_dir: Path):
    """Yield all diffs cache files (gzip preferred when both exist)."""
    if not diffs_dir.is_dir():
        return
    seen: set[str] = set()
    for path in sorted(diffs_dir.glob("*.json.gz")):
        seen.add(path.name[: -len(".json.gz")])
        yield path
    for path in sorted(diffs_dir.glob("*.json")):
        if path.stem in seen:
            continue
        yield path


def diff_id_from_path(path: Path) -> str:
    """Extract the norma id string from a diffs cache filename."""
    name = path.name
    if name.endswith(".json.gz"):
        return name[: -len(".json.gz")]
    return path.stem


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
        self.release()

    async def acquire(self):
        await self._sem.acquire()

    def release(self):
        self._sem.release()

    # ------------------------------------------------------------------
    # Feedback signals
    # ------------------------------------------------------------------

    async def on_success(self) -> None:
        """Additive increase: every 20 consecutive successes raise concurrency by 1."""
        async with self._lock:
            self._streak += 1
            if self._streak >= 20 and self._concurrency < self._max:
                logger.debug(f"AdaptiveLimiter: concurrency increasing {self._concurrency} → {self._concurrency + 1}")
                await self._resize(self._concurrency + 1)
                self._streak = 0

    async def on_rate_limit(self) -> None:
        """Multiplicative decrease: halve concurrency and sleep with exponential backoff."""
        async with self._lock:
            new_c = max(self._min, self._concurrency // 2)
            self._streak = 0
            logger.debug(f"AdaptiveLimiter: concurrency decreasing {self._concurrency} → {new_c} (rate limit)")
            await self._resize(new_c)
        # Back off more aggressively the lower the concurrency
        backoff = 2 ** max(0, 3 - new_c)
        logger.debug(f"AdaptiveLimiter: backoff for {backoff}s")
        await asyncio.sleep(backoff)

    async def on_error(self, attempt: int) -> None:
        """Exponential backoff for transient errors (not rate limits).

        Resets the success streak so concurrency doesn't keep climbing through
        a wave of server-overload errors.
        """
        async with self._lock:
            self._streak = 0
        delay = min(60, 2 ** attempt)
        await asyncio.sleep(delay)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _resize(self, new_c: int) -> None:
        """Adjust the live semaphore's permits in place.

        Swapping ``self._sem`` for a fresh Semaphore (the old implementation)
        orphans every waiter currently parked on the old semaphore's
        ``_waiters`` queue — they wait forever because future ``release()``
        calls go to the new semaphore.  With unbounded-task callers this is
        an instant total deadlock (the entire workload queues on the initial
        sem; the first resize event freezes everything).

        Instead, mutate the existing semaphore:
          - increase: ``release()`` once per added permit (sync, non-blocking).
          - decrease: schedule a background task that ``acquire()``s the
            excess permits so they're held out of circulation.  Done off the
            lock to avoid deadlocking when no permits are free.
        """
        new_c = max(self._min, min(new_c, self._max))
        diff = new_c - self._concurrency
        if diff == 0:
            return
        self._concurrency = new_c
        if diff > 0:
            for _ in range(diff):
                self._sem.release()
        else:
            n = -diff
            async def _absorb() -> None:
                for _ in range(n):
                    await self._sem.acquire()
            asyncio.create_task(_absorb())

    @property
    def concurrency(self) -> int:
        return self._concurrency


# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------


def setup_logging(verbose: bool = False) -> None:
    """Configure root logging for pipeline scripts."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )


# ---------------------------------------------------------------------------
# Progress helpers
# ---------------------------------------------------------------------------


class Progress:
    """Minimal progress logger used by fetch_versions."""

    def __init__(self, label: str, total: int | None = None, unit: str = "items", log_every: int = 20) -> None:
        self.label = label
        self.total = total
        self.unit = unit
        self.log_every = max(1, log_every)
        self.count = 0

    def __enter__(self):
        if self.total is not None:
            logger.info("%s: starting (%d %s)", self.label, self.total, self.unit)
        else:
            logger.info("%s: starting", self.label)
        return self

    def __exit__(self, *_):
        if self.total is not None:
            logger.info("%s: done (%d/%d %s)", self.label, self.count, self.total, self.unit)
        else:
            logger.info("%s: done (%d %s)", self.label, self.count, self.unit)

    def update(self, n: int = 1, status: str = "") -> None:
        self.count += n
        if self.count % self.log_every != 0 and (self.total is None or self.count != self.total):
            return
        if self.total:
            msg = f"{self.label}: {self.count}/{self.total} {self.unit}"
        else:
            msg = f"{self.label}: {self.count} {self.unit}"
        if status:
            msg += f" ({status})"
        logger.info(msg)


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

    Empty tipo returns "unknown" — historically this defaulted to "ley",
    which silently routed every type-less node into the leyes/ directory
    and made the historial top level look like ~360k laws when the real
    count is far smaller. With graph backfill, an empty tipo here means
    genuine ambiguity (no metadata available), not a ley.
    """
    t = (tipo or "").strip().lower()
    if not t:
        return "unknown"
    if t == "ley" or t == "lei":  # lei = archaic spelling
        return "ley"
    if t in ("dl", "decreto ley", "decreto-ley"):
        return "dl"
    if t in ("dfl", "decreto con fuerza de ley", "decreto-fuerza-ley"):
        return "dfl"
    if t in ("dto", "decreto", "decreto supremo", "decreto-supremo"):
        return "dto"
    slug = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return slug or "unknown"


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
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
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
        # Guard against numero='' (would collapse multiple normas into the
        # same root folder, overwriting each other's metadata.json).
        has_numero = numero and numero.strip().lower() not in ("", "s/n", "sn")
        key = numero if has_numero else (str(id_norma) if id_norma else "unknown")
        return _collision_free_path(root / folder / key, id_norma)

    if slug == "dl":
        period = _dl_period_folder(fecha, fecha_promulgacion)
        base = root / f"{period}{suffix}"
        return _collision_free_path(base / numero, id_norma)

    if slug in ("dfl", "dto"):
        org_slug = _organismo_slug(organismo)
        base = root / f"{slug}{suffix}" / org_slug
        return _collision_free_path(base / numero, id_norma)

    # Cod stays top-level — it's a "major" type with curated identifiers.
    if slug == "cod":
        folder = f"cod{suffix}"
        key = numero or (str(id_norma) if id_norma else "unknown")
        return _collision_free_path(root / folder / key, id_norma)

    # All other types are ancillary — bucket them under etc/{tipo}/ so the
    # top-level repo listing stays focused on real legislation. Within etc/
    # we key by numero when available, else idNorma (avoids "S/N" collisions).
    folder = f"{slug}{suffix}"
    has_numero = numero and numero.strip().lower() not in ("", "s/n", "sn")
    key = numero if has_numero else (str(id_norma) if id_norma else "unknown")
    return _collision_free_path(root / "etc" / folder / key, id_norma)


# ---------------------------------------------------------------------------
# Sharded graph storage
# ---------------------------------------------------------------------------
# graph.json grows to ~200 MB at full catalog scale, breaching GitHub's hard
# 100 MB per-file push limit.  We store it instead as graph_shards/NN.json,
# bucketed by idNorma % GRAPH_SHARD_COUNT, so each shard stays well under the
# limit.  load_graph/save_graph hide the sharding from callers; load_graph also
# falls back to a legacy monolithic graph.json so old caches still bootstrap.

GRAPH_SHARD_COUNT = 16


def graph_shard_dir(graph_path) -> Path:
    """Sibling directory holding the shards for a given logical graph.json path."""
    graph_path = Path(graph_path)
    return graph_path.parent / "graph_shards"


def graph_exists(graph_path) -> bool:
    """True if a sharded graph dir (with shards) or a legacy graph.json exists."""
    graph_path = Path(graph_path)
    sd = graph_shard_dir(graph_path)
    if sd.is_dir() and any(sd.glob("*.json")):
        return True
    return graph_path.exists()


def load_graph(graph_path) -> dict:
    """Load a graph dict from shards if present, else a legacy monolithic file."""
    graph_path = Path(graph_path)
    sd = graph_shard_dir(graph_path)
    if sd.is_dir():
        merged: dict = {}
        for shard in sorted(sd.glob("*.json")):
            try:
                merged.update(json.loads(shard.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                continue
        if merged:
            return merged
    if graph_path.exists():
        try:
            return json.loads(graph_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def save_graph(graph_path, graph: dict, shards: int = GRAPH_SHARD_COUNT) -> None:
    """Write the graph as graph_shards/NN.json bucketed by idNorma % shards.

    Writes each shard atomically (tmp + replace).  Removes any legacy monolithic
    graph.json so a stale, oversized file can't linger and break pushes.
    """
    graph_path = Path(graph_path)
    sd = graph_shard_dir(graph_path)
    sd.mkdir(parents=True, exist_ok=True)

    buckets: list[dict] = [{} for _ in range(shards)]
    for key, node in graph.items():
        try:
            idx = int(key) % shards
        except (TypeError, ValueError):
            idx = 0
        buckets[idx][key] = node

    for i, bucket in enumerate(buckets):
        dest = sd / f"{i:02d}.json"
        tmp = dest.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(bucket, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(dest)

    # Drop legacy monolithic file if it survived from a pre-shard run.
    if graph_path.exists() and graph_path.is_file():
        try:
            graph_path.unlink()
        except OSError:
            pass
