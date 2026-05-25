"""Tests for fetch_versions.py budget logic."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_versions as fv


def _node(n_versions: int) -> dict:
    """Build a minimal graph node with n_versions vigencias."""
    return {
        "vigencias": [{"desde": f"2020-0{i+1}-01"} for i in range(n_versions)],
        "fechaPublicacion": "2020-01-01",
    }


def test_budget_none_returns_all():
    work = [(100, _node(5)), (200, _node(10)), (300, _node(3))]
    assert fv._apply_version_budget(work, budget=None) == work


def test_budget_zero_returns_empty():
    work = [(100, _node(5)), (200, _node(3))]
    assert fv._apply_version_budget(work, budget=0) == []


def test_budget_stops_when_exhausted():
    # costs: 100→5, 200→10; budget=12
    # After 100: remaining=7; after 200: remaining=-3 (append then stop)
    # After overshoot: 300 is not appended (remaining=-3 <= 0)
    work = [(100, _node(5)), (200, _node(10)), (300, _node(3))]
    result = fv._apply_version_budget(work, budget=12)
    assert [id_ for id_, _ in result] == [100, 200]


def test_budget_exact_fit():
    # costs 5+10=15 exactly, budget=15
    work = [(100, _node(5)), (200, _node(10))]
    result = fv._apply_version_budget(work, budget=15)
    assert len(result) == 2


def test_budget_node_with_no_vigencias_costs_1():
    work = [(100, {}), (200, {})]
    result = fv._apply_version_budget(work, budget=1)
    assert [id_ for id_, _ in result] == [100]


def test_budget_filters_sentinel_dates():
    # Vigencia with year > 2100 should not count toward cost
    node = {"vigencias": [{"desde": "2222-02-02"}, {"desde": "2020-01-01"}]}
    # Only 1 valid vigencia → cost=1
    work = [(100, node), (200, _node(5))]
    result = fv._apply_version_budget(work, budget=1)
    assert [id_ for id_, _ in result] == [100]
