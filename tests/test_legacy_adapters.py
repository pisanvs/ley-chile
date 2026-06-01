"""Tests for the legacy JSON adapters.

These tests build minimal on-disk JSON layouts in tmp_path and verify
the adapter functions return correctly-typed schema objects. No network,
no git, no dependency on the project's actual ``historial/`` worktree.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from legacy import (
    iter_diff_series,
    iter_version_snapshots,
    load_catalog,
    load_graph,
    load_norma_diff_series,
    load_norma_snapshot,
    load_norma_version_snapshot,
)
from schemas import (
    Clasificacion,
    NormaTipo,
    SchemaError,
)


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


def _write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


@pytest.fixture()
def data_root(tmp_path: Path) -> Path:
    """A minimal DATA_ROOT with catalog, graph shards, and a couple of normas."""
    _write(
        tmp_path / "catalog.json",
        {
            "entries": [
                {"idNorma": 1973, "tipo": "cod", "fechaPublicacion": "1855-12-14"},
                {"idNorma": 1974, "tipo": "cod", "fechaPublicacion": "1874-11-12"},
            ],
            "complete": True,
        },
    )
    _write(
        tmp_path / "graph_shards" / "00.json",
        {
            "1973": {
                "idNorma": 1973,
                "titulo": "CODIGO CIVIL",
                "clasificacion": "sustantiva",
                "organismos": ["MINISTERIO DE JUSTICIA"],
                "derogado": False,
                "fechaPublicacion": "1855-12-14",
                "fechaPromulgacion": "1855-12-14",
                "vigencias": [],
                "modificadaPor_edges": [{"idNorma": 30232, "fecha": "1989-12-06"}],
                "tipo": "cod",
            },
        },
    )
    _write(
        tmp_path / "graph_shards" / "01.json",
        {
            "1974": {
                "idNorma": 1974,
                "titulo": "CODIGO PENAL",
                "clasificacion": "sustantiva",
                "organismos": ["MINISTERIO DE JUSTICIA"],
                "derogado": False,
                "fechaPublicacion": "1874-11-12",
                "fechaPromulgacion": "1874-11-12",
                "vigencias": [],
                "modificadaPor_edges": [],
                "tipo": "cod",
            },
        },
    )
    # cache/normas/{id}.json
    _write(
        tmp_path / "cache" / "normas" / "1973.json",
        {
            "html": [{"t": "<div>x</div>", "i": 1}],
            "metadatos": {
                "titulo_norma": "CODIGO CIVIL",
                "id_norma": "1973",
                "fecha_publicacion": "1855-12-14",
            },
        },
    )
    # cache/diffs/{id}.json
    _write(
        tmp_path / "cache" / "diffs" / "1973.json",
        [
            {"fecha": "1857-01-01", "tipo_version_s": "Texto Original", "diff": None},
            {
                "fecha": "1965-03-18",
                "tipo_version_s": "Intermedio",
                "diff": {
                    "added": [{"part_id": 1, "old": None, "new": "x"}],
                    "modified": [],
                    "removed": [],
                },
            },
        ],
    )
    # cache/versions/{id}/{fecha}.json
    for fecha in ("1857-01-01", "1965-03-18"):
        _write(
            tmp_path / "cache" / "versions" / "1973" / f"{fecha}.json",
            {
                "html": [],
                "metadatos": {"fecha_publicacion": "1855-12-14", "id_norma": "1973"},
            },
        )
    return tmp_path


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


def test_load_catalog(data_root: Path):
    cat = load_catalog(data_root / "catalog.json")
    assert len(cat) == 2
    assert cat.entries[0].id_norma == 1973
    assert cat.entries[0].tipo == NormaTipo.COD
    assert cat.complete


def test_load_catalog_missing_file(tmp_path: Path):
    with pytest.raises(SchemaError):
        load_catalog(tmp_path / "no-such-catalog.json")


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def test_load_graph_merges_shards(data_root: Path):
    g = load_graph(data_root)
    assert len(g) == 2
    assert g[1973].clasificacion == Clasificacion.SUSTANTIVA
    assert g[1974].tipo == NormaTipo.COD
    assert g[1973].modificada_por_edges[0].id_norma == 30232


def test_load_graph_falls_back_to_monolithic(tmp_path: Path):
    """If graph_shards/ is missing but graph.json exists, the monolithic file is read."""
    _write(
        tmp_path / "graph.json",
        {
            "5": {
                "idNorma": 5,
                "titulo": "X",
                "clasificacion": "sustantiva",
                "organismos": [],
                "derogado": False,
                "fechaPublicacion": "2000-01-01",
                "fechaPromulgacion": "2000-01-01",
                "vigencias": [],
                "modificadaPor_edges": [],
                "tipo": "ley",
            }
        },
    )
    g = load_graph(tmp_path)
    assert len(g) == 1
    assert g[5].id_norma == 5


def test_load_graph_no_data_raises(tmp_path: Path):
    with pytest.raises(SchemaError):
        load_graph(tmp_path)


# ---------------------------------------------------------------------------
# Norma / version snapshots
# ---------------------------------------------------------------------------


def test_load_norma_snapshot(data_root: Path):
    s = load_norma_snapshot(data_root, 1973)
    assert s.id_norma == 1973
    assert s.fecha == "1855-12-14"  # read from metadatos.fecha_publicacion
    assert s.metadatos["titulo_norma"] == "CODIGO CIVIL"


def test_load_norma_version_snapshot(data_root: Path):
    s = load_norma_version_snapshot(data_root, 1973, "1857-01-01")
    assert s.fecha == "1857-01-01"
    assert s.id_norma == 1973


def test_iter_version_snapshots_orders_by_fecha(data_root: Path):
    fechas = [s.fecha for s in iter_version_snapshots(data_root, 1973)]
    assert fechas == ["1857-01-01", "1965-03-18"]


def test_iter_version_snapshots_missing_dir_is_empty(data_root: Path):
    assert list(iter_version_snapshots(data_root, 99999)) == []


# ---------------------------------------------------------------------------
# Diff series
# ---------------------------------------------------------------------------


def test_load_norma_diff_series(data_root: Path):
    ds = load_norma_diff_series(data_root, 1973)
    assert ds.id_norma == 1973
    assert len(ds.entries) == 2
    assert ds.entries[0].diff is None  # original version
    assert ds.entries[1].diff is not None
    assert len(ds.entries[1].diff.added) == 1


def test_iter_diff_series_yields_all(data_root: Path):
    series = list(iter_diff_series(data_root))
    assert len(series) == 1
    assert series[0].id_norma == 1973


def test_iter_diff_series_missing_dir_is_empty(tmp_path: Path):
    assert list(iter_diff_series(tmp_path)) == []


def test_malformed_diff_series_raises_with_source(data_root: Path):
    bad = data_root / "cache" / "diffs" / "9999.json"
    _write(bad, {"not": "a list"})
    with pytest.raises(SchemaError) as exc:
        load_norma_diff_series(data_root, 9999)
    assert "9999.json" in str(exc.value)
