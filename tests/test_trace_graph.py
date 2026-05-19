"""Tests for trace_graph.py — pure functions only (no network calls)."""

import json
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

import trace_graph as tg
from conftest import NS, build_norma_xml


# ---------------------------------------------------------------------------
# _clean
# ---------------------------------------------------------------------------

class TestClean:
    def test_collapses_spaces(self):
        assert tg._clean("a   b") == "a b"

    def test_collapses_newlines(self):
        assert tg._clean("a\n\nb") == "a b"

    def test_collapses_mixed_whitespace(self):
        assert tg._clean("a \t\n b") == "a b"

    def test_strips_leading_trailing(self):
        assert tg._clean("  hello world  ") == "hello world"

    def test_empty_string(self):
        assert tg._clean("") == ""

    def test_no_change_needed(self):
        assert tg._clean("already clean") == "already clean"


# ---------------------------------------------------------------------------
# classify
# ---------------------------------------------------------------------------

class TestClassify:
    def test_modifica_prefix(self):
        assert tg.classify("MODIFICA EL CÓDIGO PENAL") == "modificatoria"

    def test_introduce_modificaciones(self):
        assert tg.classify("INTRODUCE MODIFICACIONES EN LA LEY 20.000") == "modificatoria"

    def test_deroga_prefix(self):
        assert tg.classify("DEROGA LA LEY 19.366") == "modificatoria"

    def test_normas_adecuatorias(self):
        assert tg.classify("NORMAS ADECUATORIAS EN MATERIA PROCESAL") == "modificatoria"

    def test_modifícase(self):
        assert tg.classify("MODIFÍCASE EL ARTÍCULO 3") == "modificatoria"

    def test_sustantiva_law(self):
        assert tg.classify("LEY SOBRE DROGAS") == "sustantiva"

    def test_empty_titulo(self):
        assert tg.classify("") == "sustantiva"

    def test_lowercase_handled(self):
        # classify upper-cases before matching
        assert tg.classify("modifica el código") == "modificatoria"

    def test_partial_match_not_prefix(self):
        # "MODIFICA" must be at the start
        assert tg.classify("CREA LEY QUE MODIFICA EL CÓDIGO") == "sustantiva"


# ---------------------------------------------------------------------------
# _tag
# ---------------------------------------------------------------------------

class TestTag:
    def test_namespaced_tag(self):
        el = ET.Element(f"{{{NS}}}Norma")
        assert tg._tag(el) == "Norma"

    def test_plain_tag(self):
        el = ET.Element("Norma")
        assert tg._tag(el) == "Norma"

    def test_nested_namespaced(self):
        el = ET.Element("{http://example.com}Child")
        assert tg._tag(el) == "Child"


# ---------------------------------------------------------------------------
# _uri_to_ley_numero
# ---------------------------------------------------------------------------

class TestUriToLeyNumero:
    def test_standard_uri(self):
        uri = "https://datos.bcn.cl/recurso/cl/ley/ar/2005-02-16/20000"
        assert tg._uri_to_ley_numero(uri) == "20000"

    def test_uri_with_version_suffix(self):
        uri = "https://datos.bcn.cl/recurso/cl/ley/ar/2005-02-16/20000/es@2005-02-16"
        assert tg._uri_to_ley_numero(uri) == "20000"

    def test_no_ley_segment(self):
        uri = "https://datos.bcn.cl/recurso/cl/decreto/1234"
        assert tg._uri_to_ley_numero(uri) is None

    def test_short_uri_after_ley(self):
        # Not enough segments after "ley"
        uri = "https://datos.bcn.cl/recurso/cl/ley/20000"
        assert tg._uri_to_ley_numero(uri) is None


# ---------------------------------------------------------------------------
# extract_version_dates
# ---------------------------------------------------------------------------

class TestExtractVersionDates:
    def test_extracts_dates(self):
        root = build_norma_xml(
            version_dates=["2005-02-16", "2011-02-21"],
        )
        dates = tg.extract_version_dates(root)
        assert "2005-02-16" in dates
        assert "2011-02-21" in dates

    def test_filters_sentinel_date(self):
        root = build_norma_xml(version_dates=["2005-02-16"])
        # Inject a sentinel date attribute somewhere
        el = ET.SubElement(root, "SomeEl")
        el.set("fechaVersion", "2222-02-02")
        dates = tg.extract_version_dates(root)
        assert "2222-02-02" not in dates

    def test_returns_sorted(self):
        root = build_norma_xml(
            version_dates=["2015-01-01", "2005-02-16", "2011-02-21"],
        )
        dates = tg.extract_version_dates(root)
        assert dates == sorted(dates)

    def test_deduplicates(self):
        root = build_norma_xml(version_dates=["2005-02-16", "2005-02-16"])
        dates = tg.extract_version_dates(root)
        assert dates.count("2005-02-16") == 1


# ---------------------------------------------------------------------------
# extract_metadata
# ---------------------------------------------------------------------------

class TestExtractMetadata:
    def test_basic_fields(self, sample_norma_xml):
        meta = tg.extract_metadata(sample_norma_xml)
        assert meta["idNorma"] == 235507
        assert meta["tipo"] == "Ley"
        assert meta["numero"] == "20000"
        assert meta["titulo"] == "LEY SOBRE DROGAS"
        assert meta["fechaPublicacion"] == "2005-02-16"

    def test_derogado_field(self):
        root = build_norma_xml(derogado="derogado")
        meta = tg.extract_metadata(root)
        assert meta["derogado"] == "derogado"

    def test_no_derogado(self, sample_norma_xml):
        meta = tg.extract_metadata(sample_norma_xml)
        assert meta["derogado"] == "no derogado"

    def test_organismos_extracted(self, sample_norma_xml):
        meta = tg.extract_metadata(sample_norma_xml)
        assert "MINISTERIO DEL INTERIOR" in meta["organismos"]

    def test_missing_ident(self):
        root = ET.Element(f"{{{NS}}}Norma", {"normaId": "0"})
        meta = tg.extract_metadata(root)
        assert meta["idNorma"] == 0
        assert meta["tipo"] == ""
        assert meta["numero"] == ""


# ---------------------------------------------------------------------------
# xml_to_markdown
# ---------------------------------------------------------------------------

class TestXmlToMarkdown:
    def test_heading_includes_law_type_and_number(self, sample_norma_xml):
        md = tg.xml_to_markdown(sample_norma_xml)
        assert "# Ley N° 20000" in md

    def test_titulo_included(self, sample_norma_xml):
        md = tg.xml_to_markdown(sample_norma_xml)
        assert "LEY SOBRE DROGAS" in md

    def test_publicada_date_included(self, sample_norma_xml):
        md = tg.xml_to_markdown(sample_norma_xml)
        assert "**Publicada:** 2005-02-16" in md

    def test_version_date_shown_if_different(self):
        root = build_norma_xml(
            fecha_publicacion="2005-02-16",
            fecha_version="2011-02-21",
        )
        md = tg.xml_to_markdown(root)
        assert "**Versión:** 2011-02-21" in md

    def test_version_date_omitted_if_same(self, sample_norma_xml):
        md = tg.xml_to_markdown(sample_norma_xml)
        # fecha_version == fecha_publicacion → no "Versión:" line
        assert "**Versión:**" not in md

    def test_article_text_included(self, sample_norma_xml):
        md = tg.xml_to_markdown(sample_norma_xml)
        assert "Artículo 1.- Esta ley regula las drogas." in md

    def test_derogated_article_struck_through(self):
        root = build_norma_xml(
            articles=[("1", "Texto derogado.")],
        )
        # Mark article as derogated
        efs = root.find(f"{{{NS}}}EstructurasFuncionales")
        ef = efs.find(f"{{{NS}}}EstructuraFuncional")
        ef.set("derogado", "derogado")
        md = tg.xml_to_markdown(root)
        assert "~~Texto derogado.~~" in md

    def test_ends_with_newline(self, sample_norma_xml):
        md = tg.xml_to_markdown(sample_norma_xml)
        assert md.endswith("\n")

    def test_no_blank_lines(self, sample_norma_xml):
        md = tg.xml_to_markdown(sample_norma_xml)
        assert "\n\n" not in md


# ---------------------------------------------------------------------------
# committed_version_dates
# ---------------------------------------------------------------------------

class TestCommittedVersionDates:
    def test_returns_committed_dates_only(self, versiones_json):
        dates = tg.committed_version_dates(versiones_json)
        assert "2005-02-16" in dates
        assert "2011-02-21" in dates
        # committed: false should not appear
        assert "2013-08-01" not in dates

    def test_missing_file_returns_empty(self, tmp_path):
        assert tg.committed_version_dates(tmp_path) == set()


# ---------------------------------------------------------------------------
# build_commit_message
# ---------------------------------------------------------------------------

class TestBuildCommitMessage:
    def _meta(self, derogado: str = "no derogado") -> dict:
        return {
            "tipo": "Ley",
            "numero": "20000",
            "titulo": "LEY SOBRE DROGAS",
            "idNorma": 235507,
            "fechaPublicacion": "2005-02-16",
            "derogado": derogado,
        }

    def test_first_version_is_feat(self):
        msg = tg.build_commit_message(self._meta(), "2005-02-16", is_first=True, clasificacion="sustantiva")
        assert msg.startswith("feat(ley):")
        assert "publicada" in msg

    def test_update_without_modifier(self):
        msg = tg.build_commit_message(self._meta(), "2011-02-21", is_first=False, clasificacion="sustantiva")
        assert msg.startswith("update(ley):")

    def test_update_with_modifier(self):
        modifier = {"numero": "20502", "titulo": "Modifica drogas", "idNorma": 300000}
        msg = tg.build_commit_message(
            self._meta(), "2011-02-21", is_first=False,
            clasificacion="sustantiva", modifier=modifier,
        )
        assert "update(ley):" in msg
        assert "Ley 20502" in msg

    def test_derog_commit_type(self):
        meta = self._meta(derogado="derogado")
        msg = tg.build_commit_message(meta, "2015-01-01", is_first=False, clasificacion="sustantiva")
        assert msg.startswith("derog(ley):")

    def test_modificacion_scope(self):
        msg = tg.build_commit_message(self._meta(), "2005-02-16", is_first=True, clasificacion="modificatoria")
        assert "feat(modificacion):" in msg

    def test_body_contains_id_norma(self):
        msg = tg.build_commit_message(self._meta(), "2005-02-16", is_first=True, clasificacion="sustantiva")
        assert "BCN idNorma=235507" in msg

    def test_ends_with_newline(self):
        msg = tg.build_commit_message(self._meta(), "2005-02-16", is_first=True, clasificacion="sustantiva")
        assert msg.endswith("\n")


# ---------------------------------------------------------------------------
# commit_order
# ---------------------------------------------------------------------------

class TestCommitOrder:
    def test_sorted_by_fecha_publicacion(self):
        graph = {
            100: {"numero": "20000", "fechaPublicacion": "2005-02-16"},
            200: {"numero": "18403", "fechaPublicacion": "1984-10-30"},
            300: {"numero": "19366", "fechaPublicacion": "1994-01-16"},
        }
        order = tg.commit_order(graph)
        assert order == [200, 300, 100]

    def test_missing_key_sorts_last(self):
        # The fallback "9999" only fires when the key is absent entirely.
        # An empty string sorts before real dates (lexicographic "" < "2005-...").
        graph = {
            1: {"numero": "A", "fechaPublicacion": "2005-01-01"},
            2: {"numero": "B"},  # key absent → falls back to "9999" → sorts last
        }
        order = tg.commit_order(graph)
        assert order[0] == 1
        assert order[-1] == 2


# ---------------------------------------------------------------------------
# _bcn_objs and _bcn_literal
# ---------------------------------------------------------------------------

class TestBcnHelpers:
    def _node(self) -> dict:
        return {
            "http://datos.bcn.cl/ontologies/bcn-norms#leychileCode": [{"value": "235507"}],
            "http://datos.bcn.cl/ontologies/bcn-norms#isModifiedBy": [
                {"value": "https://datos.bcn.cl/recurso/cl/ley/ar/2023/21575"},
            ],
        }

    def test_bcn_objs_found(self):
        objs = tg._bcn_objs(self._node(), "leychileCode")
        assert len(objs) == 1
        assert objs[0]["value"] == "235507"

    def test_bcn_objs_missing(self):
        assert tg._bcn_objs({}, "missing") == []

    def test_bcn_literal(self):
        assert tg._bcn_literal(self._node(), "leychileCode") == "235507"

    def test_bcn_literal_missing(self):
        assert tg._bcn_literal({}, "missing") == ""
