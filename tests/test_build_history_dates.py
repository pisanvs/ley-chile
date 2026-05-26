"""Tests for build_history.py --from/--to date filtering and --cache-dir."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_history as bh


def _write_diffs(cache_dir: Path, id_norma: int, fecha: str) -> None:
    diffs_dir = cache_dir / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    entry = [{"fecha": fecha, "modificadaPor": None, "diff": None}]
    (diffs_dir / f"{id_norma}.json").write_text(
        json.dumps(entry), encoding="utf-8"
    )


def _node(numero: str, fecha: str) -> dict:
    return {
        "numero": numero,
        "fechaPublicacion": fecha,
        "titulo": f"Ley {numero}",
        "tipo": "Ley",
        "clasificacion": "sustantiva",
        "organismos": [],
        "vigencias": [{"desde": fecha}],
        "derogado": False,
        "modificadaPor_edges": [],
    }


def test_no_filter_returns_all_events(tmp_path):
    graph = {"100": _node("100", "2020-01-01"), "200": _node("200", "2021-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")
    _write_diffs(cache_dir, 200, "2021-01-01")

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir)
    assert len(events) == 2


def test_to_date_filters_later_events(tmp_path):
    graph = {"100": _node("100", "2020-01-01"), "200": _node("200", "2021-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")
    _write_diffs(cache_dir, 200, "2021-01-01")

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir, to_date="2020-12-31")
    assert len(events) == 1
    assert events[0].date == "2020-01-01"


def test_from_date_filters_earlier_events(tmp_path):
    graph = {"100": _node("100", "2020-01-01"), "200": _node("200", "2021-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")
    _write_diffs(cache_dir, 200, "2021-01-01")

    # --from is EXCLUSIVE: events with date > from_date
    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir, from_date="2020-06-01")
    assert len(events) == 1
    assert events[0].date == "2021-01-01"


def test_from_date_exact_match_is_excluded(tmp_path):
    """from_date is exclusive: norma exactly on that date is not included."""
    graph = {"100": _node("100", "2020-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir, from_date="2020-01-01")
    assert len(events) == 0


def test_cache_dir_separates_from_data_root(tmp_path):
    """_collect_events reads diffs from cache_dir, not data_root/cache."""
    graph = {"100": _node("100", "2020-01-01")}
    # Diffs only in cache_dir, not in data_root/cache
    cache_dir = tmp_path / "separate_cache"
    _write_diffs(cache_dir, 100, "2020-01-01")

    wrong_cache = tmp_path / "cache"
    wrong_cache.mkdir(parents=True)
    (wrong_cache / "diffs").mkdir()
    # No diffs in wrong_cache/diffs

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir)
    assert len(events) == 1

    events_wrong = bh._collect_events(graph, tmp_path, cache_dir=wrong_cache)
    assert len(events_wrong) == 0
