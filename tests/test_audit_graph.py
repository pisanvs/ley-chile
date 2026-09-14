"""Tests for audit_graph.py — pure functions only, no graph on disk."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from audit_graph import (  # noqa: E402
    Inventory,
    audit,
    audit_node,
    format_report,
    is_sentinel,
    parse_date,
)


def node(vigencias=(), edges=(), **kw):
    n = {
        "tipo": "ley",
        "numero": "20000",
        "fechaPublicacion": "2005-02-16",
        "vigencias": [
            {"desde": d, "hasta": h, "tipo_version_s": t}
            for d, h, t in (v if len(v) == 3 else (*v, "Intermedio") for v in vigencias)
        ],
        "modificadaPor_edges": [{"idNorma": i, "fecha": f} for i, f in edges],
    }
    n.update(kw)
    return n


def run(nodes: dict) -> Inventory:
    return audit(nodes)


class TestParseDate:
    def test_accepts_a_real_day(self):
        assert parse_date("2005-02-16") == date(2005, 2, 16)

    def test_rejects_the_sentinel_as_a_date(self):
        # 2222-02-02 is a marker, not a day. Treating it as one puts a version
        # boundary two centuries out.
        assert parse_date("2222-02-02") is None
        assert is_sentinel("2222-02-02")
        assert not is_sentinel("2005-02-16")

    def test_rejects_junk(self):
        for bad in ("", None, 20050216, "ayer", "2005-13-45", "2005-2-1"):
            assert parse_date(bad) is None


class TestVigenciaInvariants:
    def test_a_contiguous_series_is_clean(self):
        inv = run({"1": node([("2005-02-16", "2011-02-20"), ("2011-02-21", "")])})
        assert inv.count("vigencia/gap") == 0
        assert inv.count("vigencia/overlap") == 0
        assert inv.count("vigencia/unreachable") == 0

    def test_detects_a_gap(self):
        inv = run({"1": node([("2005-02-16", "2011-02-20"), ("2011-03-01", "")])})
        assert inv.count("vigencia/gap") == 1
        assert "expected 2011-02-21" in inv.findings["vigencia/gap"][0].detail

    def test_detects_an_overlap(self):
        inv = run({"1": node([("2005-02-16", "2011-02-20"), ("2011-02-01", "")])})
        assert inv.count("vigencia/overlap") == 1

    def test_zero_duration_is_the_idiom_not_a_defect(self):
        # dto 542: Texto Original 1990-09-17 → 1990-09-16, superseded on its own
        # publication day. 218 of 228 backwards ranges are this exact shape, and
        # reporting them as errors buries the ten that are not.
        inv = run({"1": node([("1990-09-17", ""), ("1990-09-17", "1990-09-16")])})
        assert inv.count("vigencia/zero-duration") == 1
        assert inv.count("vigencia/negative-duration") == 0
        # It still has a reachable version — the open one.
        assert inv.count("vigencia/unreachable") == 0

    def test_a_zero_duration_version_does_not_read_as_a_tear_in_the_timeline(self):
        inv = run({"1": node([("2005-02-16", "2011-02-20"), ("2011-02-21", "2011-02-20"), ("2011-02-21", "")])})
        assert inv.count("vigencia/gap") == 0
        assert inv.count("vigencia/overlap") == 0

    def test_negative_duration_beyond_the_idiom_is_reported(self):
        inv = run({"1": node([("2001-07-01", "2001-06-24")])})
        assert inv.count("vigencia/negative-duration") == 1
        assert "7 days backwards" in inv.findings["vigencia/negative-duration"][0].detail

    def test_a_norma_with_no_reachable_day_is_the_worst_finding(self):
        # dto 388: one version, zero-length. get_article answers nothing for
        # every fecha, forever, and says so as if the article were missing.
        inv = run({"1": node([("1989-03-06", "1989-03-05")])})
        assert inv.count("vigencia/unreachable") == 1

    def test_two_open_versions_are_two_answers_for_today(self):
        inv = run({"1": node([("2010-06-16", ""), ("2012-10-31", "")])})
        assert inv.count("vigencia/multiple-open") == 1

    def test_sentinel_dated_versions_do_not_become_boundaries(self):
        inv = run({"1": node([("2005-02-16", ""), ("2222-02-02", "")])})
        assert inv.count("vigencia/gap") == 0
        assert inv.count("vigencia/multiple-open") == 0

    def test_vigencias_that_are_all_sentinels_are_reported(self):
        inv = run({"1": node([("2222-02-02", "")])})
        assert inv.count("vigencia/none-real") == 1


class TestDeferredVigencia:
    def test_records_deferred_entry_by_date(self):
        # LeyChile types these explicitly; the corpus has been applying them as
        # ordinary versions, saying nothing about the deferral.
        inv = run({"1": node([("2026-08-12", "", "Con Vigencia Diferida por Fecha")])})
        assert inv.count("vigencia/deferred-by-date") == 1

    def test_records_deferred_entry_by_event_even_though_it_is_sentinel_dated(self):
        # The sentinel is HOW LeyChile says "conditioned on an event". Filtering
        # sentinels before reading the type throws the signal away.
        inv = run({"1": node([("2005-02-16", ""), ("2222-02-02", "", "Con Vigencia Diferida por Evento")])})
        assert inv.count("vigencia/deferred-by-event") == 1

    def test_records_deferred_derogation(self):
        inv = run({"1": node([("2026-08-11", "", "Con Derogación Diferida por fecha")])})
        assert inv.count("vigencia/deferred-by-date") == 1


class TestEdges:
    def test_an_edge_to_a_missing_node_cannot_be_named(self):
        # This is what surfaces as "Otra [id 1000928]" in a version listing.
        inv = run({"1": node(edges=[(999, "2011-02-21")])})
        assert inv.count("edge/unresolvable") == 1

    def test_an_edge_to_a_present_node_is_fine(self):
        inv = run({"1": node(edges=[(2, "2011-02-21")]), "2": node()})
        assert inv.count("edge/unresolvable") == 0

    def test_a_sentinel_dated_edge_has_no_usable_date(self):
        inv = run({"1": node(edges=[(2, "2222-02-02")]), "2": node()})
        assert inv.count("edge/fecha-bad") == 1

    def test_counts_every_edge(self):
        inv = run({"1": node(edges=[(2, "2011-02-21"), (3, "2012-01-01")]), "2": node(), "3": node()})
        assert inv.edges == 2


class TestNormaMetadata:
    def test_missing_publication_date(self):
        inv = run({"1": node(fechaPublicacion="")})
        assert inv.count("norma/no-fecha-publicacion") == 1

    def test_retroactive_first_version_is_reported_not_condemned(self):
        # A norma can lawfully be given retroactive effect, so this is a
        # look-at-me, not a defect.
        inv = run({"1": node([("2009-02-01", "")], fechaPublicacion="2009-03-19")})
        assert inv.count("norma/retroactive-first-version") == 1

    def test_missing_tipo_or_numero_breaks_addressing(self):
        inv = run({"1": node(tipo="", numero="")})
        assert inv.count("norma/no-tipo") == 1
        assert inv.count("norma/no-numero") == 1


class TestReport:
    def test_a_clean_corpus_says_so_twice(self):
        inv = run({"1": node([("2005-02-16", "")])})
        out = format_report(inv)
        assert "cero gaps" in out
        assert "cero overlaps" in out

    def test_findings_are_ordered_worst_first(self):
        inv = run({
            "1": node([("1989-03-06", "1989-03-05")]),   # unreachable
            "2": node(fechaPublicacion=""),               # cosmetic
        })
        out = format_report(inv)
        assert out.index("vigencia/unreachable") < out.index("norma/no-fecha-publicacion")

    def test_sample_shows_ids_to_go_look_at(self):
        inv = run({"1": node([("1989-03-06", "1989-03-05")])})
        assert "idNorma 1" in format_report(inv, sample=3)

    def test_non_dict_nodes_are_skipped_rather_than_crashing(self):
        inv = audit({"1": node(), "2": "not a node", "3": None})
        assert inv.nodes == 1
