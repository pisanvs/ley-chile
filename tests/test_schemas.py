"""Smoke tests for the typed schemas.

Covers:
  - Enum value preservation (legacy JSON strings == enum.value)
  - CommitType.rank ordering invariant
  - Round-trip-ish from_legacy on realistic dict payloads
  - SchemaError raised on malformed input with source/field context
  - Publication.sort_key is a total order that respects (date, tipo, ley_numero)
"""

from __future__ import annotations

import pytest

from schemas import (
    CatalogEntry,
    Catalog,
    CauseKey,
    Clasificacion,
    CommitType,
    DiffPart,
    DiffPayload,
    LawChangeSet,
    ModificadaPorEdge,
    NormaGraph,
    NormaNode,
    NormaTipo,
    NormaVersionSnapshot,
    Publication,
    SchemaError,
    Scope,
    VersionDiffEntry,
    Vigencia,
)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class TestEnums:
    def test_commit_type_values_are_legacy_strings(self):
        assert CommitType.FEAT.value == "feat"
        assert CommitType.UPDATE.value == "update"
        assert CommitType.DEROG.value == "derog"
        assert CommitType.CHORE.value == "chore"

    def test_commit_type_rank_order(self):
        # feat < update < derog < chore — matches the legacy _rank field
        ranks = [t.rank for t in (CommitType.FEAT, CommitType.UPDATE, CommitType.DEROG, CommitType.CHORE)]
        assert ranks == sorted(ranks) == [0, 1, 2, 3]

    def test_norma_tipo_parse_known(self):
        assert NormaTipo.parse("ley") == NormaTipo.LEY
        assert NormaTipo.parse("DL") == NormaTipo.DL  # case-insensitive
        assert NormaTipo.parse("acd") == NormaTipo.ACD

    def test_norma_tipo_parse_empty_defaults_to_ley(self):
        assert NormaTipo.parse(None) == NormaTipo.LEY
        assert NormaTipo.parse("") == NormaTipo.LEY

    def test_norma_tipo_parse_unknown_collapses_to_otras(self):
        # Open taxonomy: new tipo codes should not crash ingestion.
        assert NormaTipo.parse("some-new-category-2030") == NormaTipo.OTRAS


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


class TestCatalog:
    def test_from_legacy_happy_path(self):
        raw = {
            "entries": [
                {"idNorma": 1, "tipo": "acd", "fechaPublicacion": "1991-05-13"},
                {"idNorma": 2, "tipo": "ley", "fechaPublicacion": "1991-06-15"},
            ],
            "last_code": "abc",
            "complete": True,
        }
        cat = Catalog.from_legacy(raw)
        assert len(cat) == 2
        assert cat.complete is True
        assert cat.last_code == "abc"
        assert cat.entries[0].id_norma == 1
        assert cat.entries[0].tipo == NormaTipo.ACD
        assert list(cat.ids()) == [1, 2]

    def test_from_legacy_rejects_non_object(self):
        with pytest.raises(SchemaError):
            Catalog.from_legacy([1, 2, 3])  # type: ignore[arg-type]

    def test_from_legacy_rejects_missing_entries(self):
        with pytest.raises(SchemaError):
            Catalog.from_legacy({"complete": True})

    def test_entry_carries_source_in_error(self):
        try:
            CatalogEntry.from_legacy({"tipo": "ley"}, source="cat.json")
        except SchemaError as e:
            assert e.source == "cat.json"
            assert "entries[]" in str(e)
        else:  # pragma: no cover
            pytest.fail("expected SchemaError")


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def _node_raw(**overrides) -> dict:
    base = {
        "idNorma": 1973,
        "titulo": "CODIGO CIVIL",
        "clasificacion": "sustantiva",
        "organismos": ["MINISTERIO DE JUSTICIA"],
        "derogado": False,
        "fechaPublicacion": "1855-12-14",
        "fechaPromulgacion": "1855-12-14",
        "vigencias": [
            {"desde": "1857-01-01", "hasta": "", "tipo_version": "2", "tipo_version_s": "Original"}
        ],
        "modificadaPor_edges": [
            {"idNorma": 30232, "fecha": "1989-12-06"},
            {"idNorma": 244803, "fecha": "2005-12-07"},
        ],
        "tipo": "cod",
    }
    base.update(overrides)
    return base


class TestGraph:
    def test_node_from_legacy_happy_path(self):
        n = NormaNode.from_legacy(_node_raw())
        assert n.id_norma == 1973
        assert n.clasificacion == Clasificacion.SUSTANTIVA
        assert n.tipo == NormaTipo.COD
        assert len(n.modificada_por_edges) == 2
        assert n.modificada_por_edges[0] == ModificadaPorEdge(30232, "1989-12-06")
        assert n.vigencias[0] == Vigencia("1857-01-01", "", "2", "Original")

    def test_node_modificatoria_classification(self):
        n = NormaNode.from_legacy(_node_raw(clasificacion="modificatoria"))
        assert n.clasificacion == Clasificacion.MODIFICATORIA

    def test_node_unknown_classification_falls_back_to_sustantiva(self):
        n = NormaNode.from_legacy(_node_raw(clasificacion="weird"))
        assert n.clasificacion == Clasificacion.SUSTANTIVA

    def test_node_tolerates_bare_int_edges(self):
        # Defensive: older caches may have stored bare ints
        n = NormaNode.from_legacy(_node_raw(modificadaPor_edges=[123, 456]))
        assert [e.id_norma for e in n.modificada_por_edges] == [123, 456]
        assert all(e.fecha == "" for e in n.modificada_por_edges)

    def test_node_missing_id_raises(self):
        bad = _node_raw()
        del bad["idNorma"]
        with pytest.raises(SchemaError):
            NormaNode.from_legacy(bad)

    def test_graph_from_legacy_keyed_by_int(self):
        raw = {"1973": _node_raw(), "1974": _node_raw(idNorma=1974, titulo="CODIGO PENAL")}
        g = NormaGraph.from_legacy(raw)
        assert len(g) == 2
        assert 1973 in g
        assert 1974 in g
        assert g[1974].titulo == "CODIGO PENAL"
        assert g.get(99999) is None


# ---------------------------------------------------------------------------
# Diffs and version snapshots
# ---------------------------------------------------------------------------


class TestDiffs:
    def test_diff_payload_none_for_original_version(self):
        assert DiffPayload.from_legacy(None) is None

    def test_diff_payload_lists(self):
        p = DiffPayload.from_legacy(
            {
                "added": [{"part_id": 1, "old": None, "new": "x"}],
                "modified": [{"part_id": 2, "old": "a", "new": "b"}],
                "removed": [],
            }
        )
        assert p is not None
        assert len(p.added) == 1
        assert p.added[0] == DiffPart(1, None, "x")
        assert p.modified[0] == DiffPart(2, "a", "b")
        assert p.removed == []
        assert not p.is_empty

    def test_diff_payload_empty(self):
        p = DiffPayload.from_legacy({"added": [], "modified": [], "removed": []})
        assert p is not None and p.is_empty

    def test_diff_payload_rejects_non_object(self):
        with pytest.raises(SchemaError):
            DiffPayload.from_legacy([1, 2, 3])  # type: ignore[arg-type]

    def test_version_diff_entry_original(self):
        e = VersionDiffEntry.from_legacy(
            {"fecha": "1857-01-01", "tipo_version_s": "Texto Original", "diff": None}
        )
        assert e.diff is None
        assert e.fecha == "1857-01-01"


class TestVersionSnapshot:
    def test_minimal_payload(self):
        raw = {"html": [], "metadatos": {"titulo_norma": "X"}}
        s = NormaVersionSnapshot.from_legacy(1973, "1855-12-14", raw)
        assert s.id_norma == 1973
        assert s.fecha == "1855-12-14"
        assert s.metadatos["titulo_norma"] == "X"
        # Raw payload preserved losslessly for the renderer.
        assert s.raw is raw

    def test_rejects_non_object(self):
        with pytest.raises(SchemaError):
            NormaVersionSnapshot.from_legacy(1, "2020-01-01", [])  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Events: CauseKey ordering, Publication.sort_key, LawChangeSet.is_empty
# ---------------------------------------------------------------------------


class TestEvents:
    def test_cause_key_is_orderable(self):
        a = CauseKey(date="2020-01-01", causa_id_norma=1)
        b = CauseKey(date="2020-01-02", causa_id_norma=1)
        c = CauseKey(date="2020-01-01", causa_id_norma=2)
        assert a < b
        assert a < c  # same date, lower causa_id

    def test_law_change_set_is_empty(self):
        cs = LawChangeSet(id_norma=1, ley_numero="1", scope=Scope.LEY)
        assert cs.is_empty()
        cs.files["leyes/1/texto.md"] = b"hello"
        assert not cs.is_empty()

    def _pub(self, *, date: str, tipo: CommitType, numero: str, causa_id: int = 1) -> Publication:
        return Publication(
            cause=CauseKey(date=date, causa_id_norma=causa_id),
            tipo=tipo,
            scope=Scope.LEY,
            causa_titulo="t",
            causa_ley_numero=numero,
            subject="s",
            body="",
        )

    def test_publication_sort_key_date_then_tipo_then_numero(self):
        a = self._pub(date="2020-01-01", tipo=CommitType.FEAT, numero="100")
        b = self._pub(date="2020-01-01", tipo=CommitType.UPDATE, numero="50")
        c = self._pub(date="2020-01-02", tipo=CommitType.FEAT, numero="1")
        ordered = sorted([c, b, a], key=Publication.sort_key)
        # feat on day 1 (a) precedes update on day 1 (b) precedes anything on day 2 (c)
        assert ordered == [a, b, c]

    def test_publication_is_empty_when_all_change_sets_empty(self):
        p = self._pub(date="2020-01-01", tipo=CommitType.FEAT, numero="1")
        p.changes = [LawChangeSet(id_norma=1, ley_numero="1", scope=Scope.LEY)]
        assert p.is_empty
        p.changes[0].files["x"] = b""
        assert not p.is_empty
