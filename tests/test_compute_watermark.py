"""Tests for compute_watermark.py — no network or git calls required."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import compute_watermark as cw


def _make_cache(tmp_path: Path, graph: dict, ids: list[int]) -> Path:
    """Create cache dir with diffs + versions for each given idNorma."""
    diffs = tmp_path / "cache" / "diffs"
    versions = tmp_path / "cache" / "versions"
    diffs.mkdir(parents=True)
    versions.mkdir(parents=True)
    for id_norma in ids:
        fecha = graph.get(str(id_norma), {}).get("fechaPublicacion") or "2000-01-01"
        diff_entry = [{"fecha": fecha, "tipo_version_s": "", "diff": None}]
        (diffs / f"{id_norma}.json").write_text(
            json.dumps(diff_entry), encoding="utf-8"
        )
        ver_dir = versions / str(id_norma)
        ver_dir.mkdir(parents=True, exist_ok=True)
        (ver_dir / f"{fecha}.json").write_text("{}", encoding="utf-8")
    return tmp_path / "cache"


def test_empty_cache_returns_empty_D(tmp_path):
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2020-06-01"},
    }
    cache_dir = _make_cache(tmp_path, graph, [])
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == ""
    assert result["cached"] == 0
    assert result["total"] == 2


def test_partial_cache_D_stops_at_first_gap(tmp_path):
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2020-06-01"},
        "300": {"fechaPublicacion": "2020-12-01"},
    }
    cache_dir = _make_cache(tmp_path, graph, [100, 300])  # 200 missing
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == "2020-01-01"   # gap at 200 blocks further advance
    assert result["cached"] == 2         # 100 + 300 exist on disk


def test_full_cache_D_equals_last_date(tmp_path):
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2020-06-01"},
    }
    cache_dir = _make_cache(tmp_path, graph, [100, 200])
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == "2020-06-01"
    assert result["total"] == 2
    assert result["cached"] == 2


def test_watermark_advanced_true_when_D_is_nonempty(tmp_path):
    """Rebuild semantics: advance whenever any complete data exists, regardless of W."""
    graph = {"100": {"fechaPublicacion": "2020-01-01"}}
    cache_dir = _make_cache(tmp_path, graph, [100])
    # Both W<D and W>D must trigger advance now — historial is regenerated, not appended.
    assert cw.compute_watermark(graph, cache_dir, W="2019-01-01")["watermark_advanced"] is True
    assert cw.compute_watermark(graph, cache_dir, W="2020-01-01")["watermark_advanced"] is True
    assert cw.compute_watermark(graph, cache_dir, W="2099-01-01")["watermark_advanced"] is True


def test_watermark_advanced_false_when_D_empty(tmp_path):
    """No complete prefix → nothing to rebuild → don't advance."""
    graph = {"100": {"fechaPublicacion": "2020-01-01"}}
    cache_dir = _make_cache(tmp_path, graph, [])  # no diffs
    result = cw.compute_watermark(graph, cache_dir, W="2020-01-01")
    assert result["D"] == ""
    assert result["watermark_advanced"] is False


def test_normas_without_fecha_are_skipped(tmp_path):
    graph = {
        "100": {"fechaPublicacion": ""},          # no date
        "200": {"fechaPublicacion": "2020-01-01"},
    }
    cache_dir = _make_cache(tmp_path, graph, [100, 200])
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == "2020-01-01"  # undated norma doesn't block D
    assert result["total"] == 2


def test_sentinel_only_norma_is_complete_with_empty_diff(tmp_path):
    """Normas whose only vigencia is a year>2100 sentinel (LeyChile's
    open-ended `2222-02-02` marker) get an empty diff list and no version
    files. That state must count as complete, not block the cache gate."""
    graph = {
        "1064738": {
            "fechaPublicacion": "2026-01-15",
            "vigencias": [{"desde": "2222-02-02"}],
        },
        "200": {
            "fechaPublicacion": "2020-01-01",
            "vigencias": [{"desde": "2020-01-01"}],
        },
    }
    diffs = tmp_path / "cache" / "diffs"
    versions = tmp_path / "cache" / "versions"
    diffs.mkdir(parents=True)
    versions.mkdir(parents=True)
    # Sentinel-only: empty diff list, no versions/{id}/ dir.
    (diffs / "1064738.json").write_text("[]", encoding="utf-8")
    # Normal norma fully cached.
    (diffs / "200.json").write_text(
        json.dumps([{"fecha": "2020-01-01", "tipo_version_s": "", "diff": None}]),
        encoding="utf-8",
    )
    (versions / "200").mkdir()
    (versions / "200" / "2020-01-01.json").write_text("{}", encoding="utf-8")

    result = cw.compute_watermark(graph, tmp_path / "cache", W="")
    assert result["cached"] == 2
    assert result["missing"] == 0
    assert result["cache_complete"] is True


def test_empty_vigencias_stub_is_complete_without_diff(tmp_path):
    """Zero-vigencia stubs (SPARQL placeholders LeyChile doesn't serve) are
    skipped by fetch_versions and must not block cache_complete."""
    graph = {
        "900001": {"fechaPublicacion": "", "vigencias": []},  # stub
        "200": {"fechaPublicacion": "2020-01-01", "vigencias": [{"desde": "2020-01-01"}]},
    }
    cache_dir = _make_cache(tmp_path, graph, [200])
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["cached"] == 2          # stub counts as cached
    assert result["missing"] == 0
    assert result["cache_complete"] is True


def test_historial_count_zero_without_historial_dir(tmp_path):
    """When historial_dir is absent we report 0 — no fabricated projection."""
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2021-01-01"},
    }
    cache_dir = _make_cache(tmp_path, graph, [])
    result = cw.compute_watermark(graph, cache_dir, W="2021-01-01")
    assert result["historial_count"] == 0


def test_historial_count_counts_real_metadata_files(tmp_path):
    """With historial_dir, count actual <type>/<numero>/metadata.json files."""
    graph = {"100": {"fechaPublicacion": "2020-01-01"}}
    cache_dir = _make_cache(tmp_path, graph, [])
    historial = tmp_path / "historial"
    # Build a realistic historial dir: 3 normas across two types.
    for type_dir, numero in [("leyes", "20000"), ("leyes", "20100"), ("dl", "707")]:
        d = historial / type_dir / numero
        d.mkdir(parents=True)
        (d / "metadata.json").write_text('{"x":1}', encoding="utf-8")
    # A dir without metadata.json must NOT be counted (incomplete write).
    (historial / "leyes" / "20200").mkdir(parents=True)

    result = cw.compute_watermark(graph, cache_dir, W="2020-01-01", historial_dir=historial)
    assert result["historial_count"] == 3
