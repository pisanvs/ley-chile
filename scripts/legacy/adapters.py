"""Legacy JSON readers.

Each function takes a filesystem path (or a directory root for the
``iter_*`` helpers) and returns typed schema objects. None of these
functions perform network IO. They are safe to call from tests.

DATA_ROOT layout assumed (see CLAUDE.md):

  {data_root}/
      catalog.json
      graph.json                       (legacy monolithic; optional)
      graph_shards/NN.json             (sharded; preferred)
      cache/
          normas/{idNorma}.json        (raw get_norma_json — "current" version)
          diffs/{idNorma}.json         (our derived per-version diff list)
          versions/{idNorma}/{YYYY-MM-DD}.json   (raw get_norma_json per version)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

import sys
from pathlib import Path as _Path

# Match the project's existing bootstrap pattern (see build_history.py): put
# scripts/ on sys.path so sibling packages import without a leading "scripts.".
_SCRIPTS_DIR = _Path(__file__).resolve().parent.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from schemas import (  # noqa: E402
    Catalog,
    NormaDiffSeries,
    NormaGraph,
    NormaVersionSnapshot,
    SchemaError,
)


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


def load_catalog(path: Path | str) -> Catalog:
    """Load a Catalog from a legacy ``catalog.json`` file."""
    path = Path(path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise SchemaError(f"cannot read catalog: {e}", source=str(path)) from e
    return Catalog.from_legacy(raw, source=str(path))


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


_GRAPH_SHARD_DIRNAME = "graph_shards"


def load_graph(data_root: Path | str) -> NormaGraph:
    """Load the full graph from sharded files, falling back to a monolithic ``graph.json``.

    Mirrors the behavior of ``scripts.utils.load_graph`` so this adapter
    accepts every layout the legacy pipeline produces. Aggregates all
    shards into a single ``NormaGraph``.
    """
    data_root = Path(data_root)
    shard_dir = data_root / _GRAPH_SHARD_DIRNAME
    merged: dict = {}

    if shard_dir.is_dir():
        for shard in sorted(shard_dir.glob("*.json")):
            try:
                merged.update(json.loads(shard.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError) as e:
                raise SchemaError(
                    f"cannot read graph shard: {e}", source=str(shard)
                ) from e
        if merged:
            return NormaGraph.from_legacy(merged, source=str(shard_dir))

    monolithic = data_root / "graph.json"
    if monolithic.exists():
        try:
            raw = json.loads(monolithic.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            raise SchemaError(f"cannot read graph: {e}", source=str(monolithic)) from e
        return NormaGraph.from_legacy(raw, source=str(monolithic))

    raise SchemaError(
        f"no graph found under {data_root} (neither {_GRAPH_SHARD_DIRNAME}/ nor graph.json)",
        source=str(data_root),
    )


# ---------------------------------------------------------------------------
# Per-norma snapshots (the "current" version cached at cache/normas/)
# ---------------------------------------------------------------------------


def load_norma_snapshot(data_root: Path | str, id_norma: int) -> NormaVersionSnapshot:
    """Load ``cache/normas/{id}.json``: the raw ``get_norma_json`` payload.

    The fecha is not in the filename, so we read it from ``metadatos.fecha_publicacion``
    as a best-effort. Callers that need the actual version date should use
    ``load_norma_version_snapshot`` instead.
    """
    path = Path(data_root) / "cache" / "normas" / f"{id_norma}.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise SchemaError(f"cannot read norma snapshot: {e}", source=str(path)) from e
    fecha = ""
    if isinstance(raw, dict):
        meta = raw.get("metadatos") or {}
        fecha = str(meta.get("fecha_publicacion", ""))
    return NormaVersionSnapshot.from_legacy(id_norma, fecha, raw, source=str(path))


# ---------------------------------------------------------------------------
# Per-version snapshots (cache/versions/{id}/{fecha}.json)
# ---------------------------------------------------------------------------


def load_norma_version_snapshot(
    data_root: Path | str, id_norma: int, fecha: str
) -> NormaVersionSnapshot:
    """Load one specific version snapshot for a norma."""
    path = Path(data_root) / "cache" / "versions" / str(id_norma) / f"{fecha}.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise SchemaError(
            f"cannot read version snapshot: {e}", source=str(path)
        ) from e
    return NormaVersionSnapshot.from_legacy(id_norma, fecha, raw, source=str(path))


def iter_version_snapshots(
    data_root: Path | str, id_norma: int
) -> Iterator[NormaVersionSnapshot]:
    """Yield every cached version snapshot for a norma, in ascending fecha order."""
    vdir = Path(data_root) / "cache" / "versions" / str(id_norma)
    if not vdir.is_dir():
        return
    for f in sorted(vdir.glob("*.json")):
        fecha = f.stem
        yield load_norma_version_snapshot(data_root, id_norma, fecha)


# ---------------------------------------------------------------------------
# Per-norma diff series (cache/diffs/{id}.json)
# ---------------------------------------------------------------------------


def load_norma_diff_series(data_root: Path | str, id_norma: int) -> NormaDiffSeries:
    """Load the per-version diff list for a norma."""
    path = Path(data_root) / "cache" / "diffs" / f"{id_norma}.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise SchemaError(f"cannot read diff series: {e}", source=str(path)) from e
    return NormaDiffSeries.from_legacy(id_norma, raw, source=str(path))


def iter_diff_series(data_root: Path | str) -> Iterator[NormaDiffSeries]:
    """Yield diff series for every norma that has one cached."""
    ddir = Path(data_root) / "cache" / "diffs"
    if not ddir.is_dir():
        return
    for f in sorted(ddir.glob("*.json"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0):
        try:
            id_norma = int(f.stem)
        except ValueError:
            continue
        yield load_norma_diff_series(Path(data_root), id_norma)
