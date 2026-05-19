"""Tests for sync_daily.py — all network and git calls are mocked."""

import json
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

import sync_daily as sd
import trace_graph as tg
from conftest import NS, build_norma_xml


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norma_xml_bytes(
    norma_id: str = "999001",
    tipo: str = "Ley",
    numero: str = "21999",
    titulo: str = "MODIFICA LA LEY 20.000 EN MATERIA DE DROGAS",
    derogado: str = "no derogado",
    fecha_publicacion: str = "2024-01-15",
) -> bytes:
    root = build_norma_xml(
        norma_id=norma_id,
        tipo=tipo,
        numero=numero,
        titulo=titulo,
        derogado=derogado,
        fecha_publicacion=fecha_publicacion,
        fecha_version=fecha_publicacion,
    )
    return ET.tostring(root, encoding="unicode").encode("utf-8")


def _wrap_normas_xml(*norma_roots: ET.Element) -> bytes:
    """Wrap multiple Norma elements in a container element (opt=40 format)."""
    container = ET.Element("NormasActualizadas")
    for n in norma_roots:
        container.append(n)
    return ET.tostring(container, encoding="unicode").encode("utf-8")


def _sample_graph() -> dict:
    """Minimal graph with primary chain laws only."""
    return {
        235507: {
            "idNorma": 235507,
            "numero": "20000",
            "titulo": "LEY SOBRE DROGAS",
            "clasificacion": "sustantiva",
            "fechaPublicacion": "2005-02-16",
            "modifica": [],
            "modificadaPor": [],
        },
        30733: {
            "idNorma": 30733,
            "numero": "19366",
            "titulo": "LEY SOBRE DROGAS ANTERIOR",
            "clasificacion": "sustantiva",
            "fechaPublicacion": "1994-01-16",
            "modifica": [],
            "modificadaPor": [],
        },
    }


# ---------------------------------------------------------------------------
# SyncResult
# ---------------------------------------------------------------------------

class TestSyncResult:
    def test_changed_true_when_new_laws(self):
        r = sd.SyncResult(new_laws=[235507])
        assert r.changed is True

    def test_changed_true_when_new_versions(self):
        r = sd.SyncResult(new_versions=[(235507, "2024-01-15")])
        assert r.changed is True

    def test_changed_false_when_empty(self):
        assert sd.SyncResult().changed is False

    def test_errors_do_not_count_as_changed(self):
        r = sd.SyncResult(errors=["something failed"])
        assert r.changed is False


# ---------------------------------------------------------------------------
# load_graph
# ---------------------------------------------------------------------------

class TestLoadGraph:
    def test_returns_empty_dict_when_file_missing(self, tmp_path, monkeypatch):
        monkeypatch.setattr(tg, "DATA_ROOT", tmp_path)
        assert sd.load_graph() == {}

    def test_loads_and_converts_keys_to_int(self, tmp_path, monkeypatch):
        monkeypatch.setattr(tg, "DATA_ROOT", tmp_path)
        graph = {"235507": {"numero": "20000"}, "30733": {"numero": "19366"}}
        (tmp_path / "graph.json").write_text(json.dumps(graph), encoding="utf-8")
        loaded = sd.load_graph()
        assert 235507 in loaded
        assert 30733 in loaded
        assert loaded[235507]["numero"] == "20000"

    def test_returns_empty_on_corrupt_json(self, tmp_path, monkeypatch):
        monkeypatch.setattr(tg, "DATA_ROOT", tmp_path)
        (tmp_path / "graph.json").write_text("{bad json", encoding="utf-8")
        assert sd.load_graph() == {}


# ---------------------------------------------------------------------------
# _parse_recent_response
# ---------------------------------------------------------------------------

class TestParseRecentResponse:
    def test_parses_container_with_norma_children(self):
        n1 = build_norma_xml(norma_id="111", numero="21001", tipo="Ley")
        n2 = build_norma_xml(norma_id="222", numero="21002", tipo="Ley")
        xml = _wrap_normas_xml(n1, n2)
        results = sd._parse_recent_response(xml)
        ids = [r["idNorma"] for r in results]
        assert 111 in ids
        assert 222 in ids

    def test_parses_single_norma_root(self):
        root = build_norma_xml(norma_id="333", numero="21003")
        xml = ET.tostring(root, encoding="unicode").encode("utf-8")
        results = sd._parse_recent_response(xml)
        assert len(results) == 1
        assert results[0]["idNorma"] == 333

    def test_invalid_xml_returns_empty(self):
        assert sd._parse_recent_response(b"<not valid xml>>>") == []

    def test_filters_elements_without_id(self):
        container = ET.Element("NormasActualizadas")
        ET.SubElement(container, "Junk")  # no idNorma → should be skipped
        n = build_norma_xml(norma_id="444", numero="21004")
        container.append(n)
        xml = ET.tostring(container, encoding="unicode").encode("utf-8")
        results = sd._parse_recent_response(xml)
        assert len(results) == 1
        assert results[0]["idNorma"] == 444

    def test_empty_container_returns_empty(self):
        container = ET.Element("NormasActualizadas")
        xml = ET.tostring(container, encoding="unicode").encode("utf-8")
        assert sd._parse_recent_response(xml) == []


# ---------------------------------------------------------------------------
# find_new_modifiers
# ---------------------------------------------------------------------------

class TestFindNewModifiers:
    def _recent(self, id_norma: int, titulo: str, tipo: str = "Ley") -> dict:
        return {"idNorma": id_norma, "tipo": tipo, "titulo": titulo, "numero": str(id_norma)}

    def test_new_modificatoria_ley_included(self):
        graph = _sample_graph()
        recent = [self._recent(999001, "MODIFICA LA LEY 20.000 EN MATERIA DE DROGAS")]
        result = sd.find_new_modifiers(recent, graph)
        assert 999001 in result

    def test_already_in_graph_excluded(self):
        graph = _sample_graph()
        # 235507 is already in graph
        recent = [self._recent(235507, "MODIFICA LA LEY 20.000")]
        result = sd.find_new_modifiers(recent, graph)
        assert 235507 not in result

    def test_non_ley_tipo_excluded(self):
        graph = _sample_graph()
        recent = [self._recent(999002, "MODIFICA LA LEY 20.000", tipo="Decreto Supremo")]
        result = sd.find_new_modifiers(recent, graph)
        assert 999002 not in result

    def test_sustantiva_titulo_excluded(self):
        graph = _sample_graph()
        recent = [self._recent(999003, "CREA EL SERVICIO NACIONAL DE DROGAS")]
        result = sd.find_new_modifiers(recent, graph)
        assert 999003 not in result

    def test_known_recent_excluded(self, monkeypatch):
        graph = _sample_graph()
        monkeypatch.setattr(tg, "KNOWN_RECENT", {999004: {"numero": "21999"}})
        recent = [self._recent(999004, "MODIFICA LA LEY 20.000")]
        result = sd.find_new_modifiers(recent, graph)
        assert 999004 not in result

    def test_multiple_new_modifiers(self):
        graph = _sample_graph()
        recent = [
            self._recent(900001, "MODIFICA LA LEY 20.000"),
            self._recent(900002, "MODIFICA LA LEY 19.366"),
        ]
        result = sd.find_new_modifiers(recent, graph)
        assert 900001 in result
        assert 900002 in result

    def test_empty_recent_returns_empty(self):
        assert sd.find_new_modifiers([], _sample_graph()) == []


# ---------------------------------------------------------------------------
# fetch_recent_normas (mocked HTTP)
# ---------------------------------------------------------------------------

class TestFetchRecentNormas:
    def test_returns_parsed_normas(self, mocker):
        n = build_norma_xml(norma_id="500", numero="21500")
        xml = _wrap_normas_xml(n)

        mock_resp = mocker.MagicMock()
        mock_resp.content = xml
        mocker.patch("trace_graph._rate_limited_get", return_value=mock_resp)

        results = sd.fetch_recent_normas(days=3)
        assert any(r["idNorma"] == 500 for r in results)

    def test_returns_empty_on_network_error(self, mocker):
        mocker.patch("trace_graph._rate_limited_get", side_effect=Exception("timeout"))
        results = sd.fetch_recent_normas(days=3)
        assert results == []

    def test_passes_opt40_to_leychile(self, mocker):
        mock_resp = mocker.MagicMock()
        mock_resp.content = b"<NormasActualizadas/>"
        mock_get = mocker.patch("trace_graph._rate_limited_get", return_value=mock_resp)

        sd.fetch_recent_normas()
        call_args = mock_get.call_args
        assert call_args[0][1].get("opt") == 40 or call_args[1].get("params", {}).get("opt") == 40 \
            or (len(call_args[0]) > 1 and call_args[0][1].get("opt") == 40)


# ---------------------------------------------------------------------------
# _resolve_and_add_to_graph (mocked BCN + LeyChile calls)
# ---------------------------------------------------------------------------

class TestResolveAndAddToGraph:
    def test_adds_modifier_to_graph(self, mocker):
        graph = _sample_graph()
        n = build_norma_xml(
            norma_id="999001",
            numero="21999",
            titulo="MODIFICA LA LEY 20.000",
            fecha_publicacion="2024-01-15",
        )
        mocker.patch("trace_graph.fetch_norma_xml", return_value=n)
        mocker.patch("trace_graph.get_bcn_info", return_value={
            "idNorma": 999001,
            "fecha": "2024-01-15",
            "isModifiedBy": [],
            "modifiesTo": [{"numero": "20000"}],
        })

        added = sd._resolve_and_add_to_graph(999001, graph)
        assert added is True
        assert 999001 in graph
        assert graph[999001]["numero"] == "21999"

    def test_back_links_primary_chain(self, mocker):
        graph = _sample_graph()
        n = build_norma_xml(norma_id="999001", numero="21999",
                            titulo="MODIFICA LA LEY 20.000", fecha_publicacion="2024-01-15")
        mocker.patch("trace_graph.fetch_norma_xml", return_value=n)
        mocker.patch("trace_graph.get_bcn_info", return_value={
            "idNorma": 999001, "fecha": "2024-01-15", "isModifiedBy": [],
            "modifiesTo": [{"numero": "20000"}],
        })

        sd._resolve_and_add_to_graph(999001, graph)
        assert 999001 in graph[235507]["modificadaPor"]

    def test_rejects_when_not_modifying_primary(self, mocker):
        graph = _sample_graph()
        n = build_norma_xml(norma_id="999002", numero="22000",
                            titulo="MODIFICA LA LEY 18.000", fecha_publicacion="2024-02-01")
        mocker.patch("trace_graph.fetch_norma_xml", return_value=n)
        mocker.patch("trace_graph.get_bcn_info", return_value={
            "idNorma": 999002, "fecha": "2024-02-01", "isModifiedBy": [],
            "modifiesTo": [{"numero": "18000"}],  # not in primary chain
        })

        added = sd._resolve_and_add_to_graph(999002, graph)
        assert added is False
        assert 999002 not in graph

    def test_returns_false_on_fetch_error(self, mocker):
        graph = _sample_graph()
        mocker.patch("trace_graph.fetch_norma_xml", side_effect=Exception("network error"))
        added = sd._resolve_and_add_to_graph(999999, graph)
        assert added is False

    def test_returns_false_when_no_bcn_data(self, mocker):
        graph = _sample_graph()
        n = build_norma_xml(norma_id="999003", numero="22001",
                            titulo="MODIFICA LA LEY 20.000", fecha_publicacion="2024-03-01")
        mocker.patch("trace_graph.fetch_norma_xml", return_value=n)
        mocker.patch("trace_graph.get_bcn_info", return_value=None)
        added = sd._resolve_and_add_to_graph(999003, graph)
        assert added is False


# ---------------------------------------------------------------------------
# sync — high-level orchestration (all I/O mocked)
# ---------------------------------------------------------------------------

class TestSync:
    def _patch_all(self, mocker, graph: dict, recent: list[dict] | None = None):
        """Patch all external dependencies for a sync() call."""
        mocker.patch.object(sd, "load_graph", return_value=graph)
        mocker.patch.object(sd, "fetch_recent_normas", return_value=recent or [])
        mocker.patch("trace_graph.build_modifier_map", return_value={})
        mocker.patch("trace_graph.trace_one_law", return_value=None)
        mocker.patch("trace_graph.write_graph_json", return_value=None)
        mocker.patch("rebuild_history.rebuild", return_value=None)

    def test_dry_run_returns_early_without_side_effects(self, mocker):
        graph = _sample_graph()
        self._patch_all(mocker, graph)
        mock_trace = mocker.patch("trace_graph.trace_one_law")

        result = sd.sync(dry_run=True)
        mock_trace.assert_not_called()
        assert result.changed is False

    def test_empty_graph_returns_early(self, mocker):
        mocker.patch.object(sd, "load_graph", return_value={})
        mock_trace = mocker.patch("trace_graph.trace_one_law")
        result = sd.sync()
        mock_trace.assert_not_called()
        assert result.changed is False

    def test_traces_all_laws_in_graph(self, mocker):
        graph = _sample_graph()
        self._patch_all(mocker, graph)
        mock_trace = mocker.patch("trace_graph.trace_one_law")

        sd.sync(skip_rebuild=True)
        assert mock_trace.call_count == len(graph)

    def test_new_modifier_added_from_opt40(self, mocker):
        graph = _sample_graph()
        recent = [{"idNorma": 999001, "tipo": "Ley",
                   "titulo": "MODIFICA LA LEY 20.000", "numero": "21999"}]
        self._patch_all(mocker, graph, recent=recent)

        mocker.patch.object(sd, "_resolve_and_add_to_graph", return_value=True)
        mocker.patch("trace_graph.trace_one_law", return_value=None)
        mocker.patch("trace_graph.build_modifier_map", return_value={})
        mocker.patch("trace_graph.write_graph_json", return_value=None)
        mocker.patch("rebuild_history.rebuild", return_value=None)

        result = sd.sync(skip_rebuild=True)
        assert 999001 in result.new_laws

    def test_skip_rebuild_does_not_call_rebuild(self, mocker):
        graph = _sample_graph()
        self._patch_all(mocker, graph)
        mock_rebuild = mocker.patch("rebuild_history.rebuild")

        sd.sync(skip_rebuild=True)
        mock_rebuild.assert_not_called()

    def test_rebuild_called_when_not_skipped(self, mocker):
        graph = _sample_graph()
        self._patch_all(mocker, graph)
        mock_rebuild = mocker.patch("rebuild_history.rebuild")

        sd.sync(skip_rebuild=False)
        mock_rebuild.assert_called_once()

    def test_trace_error_collected_in_result(self, mocker):
        graph = _sample_graph()
        self._patch_all(mocker, graph)
        mocker.patch("trace_graph.trace_one_law", side_effect=Exception("API down"))

        result = sd.sync(skip_rebuild=True)
        assert len(result.errors) > 0

    def test_rebuild_systemexit_collected_in_result(self, mocker):
        graph = _sample_graph()
        self._patch_all(mocker, graph)
        mocker.patch("rebuild_history.rebuild", side_effect=SystemExit(1))

        result = sd.sync(skip_rebuild=False)
        assert any("rebuild_history" in e for e in result.errors)

    def test_graph_write_error_collected(self, mocker):
        graph = _sample_graph()
        self._patch_all(mocker, graph)
        mocker.patch("trace_graph.write_graph_json", side_effect=Exception("disk full"))

        result = sd.sync(skip_rebuild=True)
        assert any("graph.json" in e for e in result.errors)
