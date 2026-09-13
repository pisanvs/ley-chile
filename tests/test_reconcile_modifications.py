"""Tests for reconcile_modifications.py — pure functions only, no graph on disk."""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from reconcile_modifications import (  # noqa: E402
    Reconciliation,
    format_report,
    is_real_date,
    reconcile_norma,
    summarize,
)


def node(vigencias, edges, tipo="ley", numero="20000"):
    return {
        "tipo": tipo,
        "numero": numero,
        "vigencias": [{"desde": d, "hasta": h} for d, h in vigencias],
        "modificadaPor_edges": [{"idNorma": i, "fecha": f} for i, f in edges],
    }


class TestIsRealDate:
    def test_accepts_a_plain_date(self):
        assert is_real_date("2005-02-16")

    def test_rejects_the_leychile_sentinel(self):
        # 2222-02-02 means "open-ended current version". Counting it as a
        # boundary invents a version change that never happened.
        assert not is_real_date("2222-02-02")

    def test_rejects_junk(self):
        for bad in ("", None, 20050216, "ayer", "xx"):
            assert not is_real_date(bad)


class TestReconcileNorma:
    def test_ley_20000_reconciles_exactly(self):
        # The case that prompted this: the corpus reported seven modifying
        # norms against a shorter version series and nobody could say why. In
        # the graph they line up exactly — seven causas, seven boundaries.
        vigs = [
            ("2005-02-16", "2005-11-13"), ("2005-11-14", "2011-02-20"),
            ("2011-02-21", "2013-12-26"), ("2013-12-27", "2015-10-21"),
            ("2015-10-22", "2023-05-22"), ("2023-05-23", "2024-09-03"),
            ("2024-09-04", "2026-05-22"), ("2026-05-23", ""),
        ]
        edges = [
            (1, "2005-11-14"), (2, "2011-02-21"), (3, "2013-12-27"),
            (4, "2015-10-22"), (5, "2023-05-23"), (6, "2024-09-04"),
            (7, "2026-05-23"),
        ]
        r = reconcile_norma("235507", node(vigs, edges))
        assert r is not None
        assert len(r.matched) == 7
        assert r.unattributed == []
        assert r.reconciles

    def test_first_vigencia_is_not_a_boundary(self):
        # The original text is caused by the norma's own publication. Counting
        # it would report a phantom unattributed boundary for every norma.
        r = reconcile_norma(
            "1", node([("2005-02-16", "2011-02-20"), ("2011-02-21", "")], [(2, "2011-02-21")])
        )
        assert r.boundaries == 1
        assert r.unattributed == []

    def test_causa_older_than_the_held_text(self):
        r = reconcile_norma(
            "1", node([("2010-01-01", "")], [(2, "1999-05-05")])
        )
        assert r.before_first == ["1999-05-05"]
        assert not r.reconciles

    def test_causa_published_but_not_yet_consolidated(self):
        r = reconcile_norma(
            "1", node([("2010-01-01", "")], [(2, "2024-06-01")])
        )
        assert r.after_last == ["2024-06-01"]

    def test_causa_inside_the_range_that_changed_no_text(self):
        # The interesting bucket: a modification to a heading or a
        # cross-reference that LeyChile folds into a neighbouring version.
        r = reconcile_norma(
            "1",
            node([("2010-01-01", "2015-12-31"), ("2016-01-01", "")], [(2, "2016-01-01"), (3, "2012-06-06")]),
        )
        assert r.matched == ["2016-01-01"]
        assert r.inside_unmatched == ["2012-06-06"]

    def test_boundary_with_no_known_causa(self):
        # LeyChile cuts versions the relation graph never explains —
        # rectificaciones, consolidations, and edges BCN did not publish.
        r = reconcile_norma(
            "1",
            node([("2010-01-01", "2015-12-31"), ("2016-01-01", "")], []),
        )
        assert r is None, "no edges at all means nothing to reconcile"
        r = reconcile_norma(
            "1",
            node(
                [("2010-01-01", "2012-12-31"), ("2013-01-01", "2015-12-31"), ("2016-01-01", "")],
                [(2, "2016-01-01")],
            ),
        )
        assert r.unattributed == ["2013-01-01"]
        assert not r.reconciles

    def test_sentinel_vigencia_is_not_counted_as_a_boundary(self):
        r = reconcile_norma(
            "1",
            node([("2010-01-01", ""), ("2222-02-02", "")], [(2, "2010-01-01")]),
        )
        # Only the real vigencia survives, so it is the first — no boundaries.
        assert r.boundaries == 0

    def test_duplicate_causas_on_one_date_collapse(self):
        # Two norms published the same day produce one version boundary. The
        # comparison is date-to-date, so this must not read as a discrepancy.
        r = reconcile_norma(
            "1",
            node([("2010-01-01", "2015-12-31"), ("2016-01-01", "")], [(2, "2016-01-01"), (3, "2016-01-01")]),
        )
        assert r.matched == ["2016-01-01"]
        assert r.reconciles

    def test_returns_none_for_nodes_with_nothing_to_compare(self):
        assert reconcile_norma("1", node([], [(2, "2016-01-01")])) is None
        assert reconcile_norma("1", node([("2010-01-01", "")], [])) is None
        assert reconcile_norma("1", {}) is None


class TestSummarize:
    def test_totals_across_normas(self):
        a = reconcile_norma(
            "1", node([("2010-01-01", "2015-12-31"), ("2016-01-01", "")], [(2, "2016-01-01")])
        )
        b = reconcile_norma(
            "2",
            node(
                [("2010-01-01", "2012-12-31"), ("2013-01-01", "2015-12-31"), ("2016-01-01", "")],
                [(3, "2016-01-01"), (4, "1999-01-01")],
            ),
        )
        s = summarize([a, b])
        assert s.normas == 2
        assert s.reconciling == 1
        assert s.matched == 2
        assert s.before_first == 1
        assert s.unattributed == 1
        assert s.causa_dates == 3
        assert s.boundaries == 3

    def test_empty_input_does_not_divide_by_zero(self):
        s = summarize([])
        assert s.normas == 0
        assert "—" in format_report(s, [])

    def test_report_names_the_outliers(self):
        r = Reconciliation(id_norma="1077207", tipo="cir", numero="Bancos 2409")
        r.unattributed.extend(["2001-01-01", "2002-01-01"])
        out = format_report(summarize([r]), [r])
        assert "1077207" in out
        assert "cir Bancos 2409" in out
