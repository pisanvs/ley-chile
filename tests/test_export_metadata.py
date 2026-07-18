"""Recovered metadata and typed relations crossing the snapshot boundary.

The export is the hop where the ingest's new graph fields become rows the
loader can insert. These are the pure parts of that hop: field coercion, the
refundido edge mapping, and the wire-format compatibility that lets a new
loader read a snapshot exported before any of this existed.
"""
from __future__ import annotations

import json
from dataclasses import asdict

import pytest

from export_snapshot import _norma_row, _relacion_rows, _strs
from schemas.snapshot import NormaRow, RelacionRow, from_ndjson, to_ndjson


class TestStrs:
    def test_absent_field_is_empty(self):
        assert _strs({}, "materias") == []
        assert _strs({"materias": None}, "materias") == []
        assert _strs({"materias": []}, "materias") == []

    def test_bare_string_is_wrapped(self):
        """LeyChile is inconsistent: some of these arrive as a scalar."""
        assert _strs({"refundidoPor": "DFL-2"}, "refundidoPor") == ["DFL-2"]

    def test_list_is_stringified_and_compacted(self):
        assert _strs({"materias": ["A", "", None, 3]}, "materias") == ["A", "3"]


class TestNormaRow:
    def test_carries_the_recovered_metadata(self):
        row = _norma_row(1107684, {
            "tipo": "dfl", "numero": "4", "titulo": "T",
            "organismos": ["SEGPRES"],
            "nombresUsoComun": ["ley de partidos"],
            "materias": ["Partidos Políticos"],
            "observaciones": ["LA NUMERACION DE LOS ARTICULOS REPITE EL Nº 2"],
            "dobleArticulado": True,
            "refundidoPor": "DFL-2; DFL-2-95",
        }, "dfl/segpres/4")
        assert row.nombres_uso_comun == ["ley de partidos"]
        assert row.materias == ["Partidos Políticos"]
        assert row.observaciones == ["LA NUMERACION DE LOS ARTICULOS REPITE EL Nº 2"]
        assert row.doble_articulado is True
        assert row.refundido_por == "DFL-2; DFL-2-95"

    def test_a_node_without_any_of_it_still_exports(self):
        """The whole corpus looks like this until the next full pipeline run."""
        row = _norma_row(1, {"tipo": "ley", "numero": "1", "titulo": "T"}, "leyes/1")
        assert row.nombres_uso_comun == []
        assert row.doble_articulado is False
        assert row.refundido_por == ""


class TestRelacionRows:
    def test_both_directions_are_emitted(self):
        rows = _relacion_rows(29994, {"refunde": [111], "refundidaEn": [1107684]})
        assert RelacionRow(origen_id=29994, destino_id=111, tipo="refunde") in rows
        assert RelacionRow(origen_id=29994, destino_id=1107684, tipo="refundida_en") in rows
        assert len(rows) == 2

    def test_no_edges_means_no_rows(self):
        assert _relacion_rows(1, {}) == []
        assert _relacion_rows(1, {"refunde": [], "refundidaEn": None}) == []

    def test_unparseable_ids_are_skipped_not_fatal(self):
        """A malformed edge must not kill a 357k-norma export."""
        rows = _relacion_rows(1, {"refunde": ["", None, "abc", "222", 333]})
        assert [r.destino_id for r in rows] == [222, 333]

    def test_tipo_matches_the_schema_check_constraint(self):
        rows = _relacion_rows(1, {"refunde": [2], "refundidaEn": [3]})
        assert {r.tipo for r in rows} <= {"refunde", "refundida_en"}


class TestWireCompatibility:
    def test_round_trip_is_identity(self):
        row = _norma_row(1, {
            "tipo": "ley", "numero": "1", "titulo": "T", "materias": ["X"],
        }, "leyes/1")
        assert from_ndjson(to_ndjson([row]).strip(), NormaRow) == row

    def test_new_loader_reads_a_snapshot_exported_before_these_fields(self):
        """The deploy order this protects: loader ships before the next export.

        Without defaults on the new fields, from_ndjson would raise a missing-
        argument TypeError on every row of the live snapshot.
        """
        legacy = {
            "id_norma": 20330, "tipo": "ley", "numero": "20330", "titulo": "LEY",
            "organismo": "MIN", "clasificacion": "sustantiva", "derogado": False,
            "fecha_publicacion": "2009-02-25", "law_dir": "leyes/20330",
        }
        row = from_ndjson(json.dumps(legacy), NormaRow)
        assert row.id_norma == 20330
        assert row.materias == []
        assert row.refundido_por == ""

    def test_old_loader_ignores_fields_it_does_not_know(self):
        """The reverse deploy order — export ships before the loader.

        from_ndjson keeps only the keys its own dataclass declares, so a row
        carrying fields a deployed loader has never heard of loads fine.
        """
        payload = asdict(_norma_row(1, {"tipo": "ley", "numero": "1", "titulo": "T"}, "l/1"))
        payload["campo_de_una_version_futura"] = "x"
        row = from_ndjson(json.dumps(payload), NormaRow)
        assert row.id_norma == 1


@pytest.mark.parametrize("kind", ["refunde", "refundida_en"])
def test_relacion_row_is_hashable_for_dedup(kind):
    a = RelacionRow(origen_id=1, destino_id=2, tipo=kind)
    b = RelacionRow(origen_id=1, destino_id=2, tipo=kind)
    assert len({a, b}) == 1
