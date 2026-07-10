"""Shared pytest configuration and fixtures."""

import sys
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

# Add scripts/ and scripts/archive/ to path so test modules can import scripts directly
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "scripts"))
sys.path.insert(0, str(_ROOT / "scripts" / "archive"))

NS = "http://www.leychile.cl/esquemas"


def _el(tag: str, text: str = "", **attribs) -> ET.Element:
    el = ET.Element(f"{{{NS}}}{tag}", attribs)
    if text:
        el.text = text
    return el


def _sub(parent: ET.Element, tag: str, text: str = "", **attribs) -> ET.Element:
    el = ET.SubElement(parent, f"{{{NS}}}{tag}", attribs)
    if text:
        el.text = text
    return el


def build_norma_xml(
    norma_id: str = "235507",
    fecha_publicacion: str = "2005-02-16",
    fecha_version: str = "2005-02-16",
    tipo: str = "Ley",
    numero: str = "20000",
    titulo: str = "LEY SOBRE DROGAS",
    organismo: str = "MINISTERIO DEL INTERIOR",
    derogado: str = "no derogado",
    version_dates: list[str] | None = None,
    articles: list[tuple[str, str]] | None = None,
) -> ET.Element:
    """Build a minimal but structurally valid LeyChile norma XML element."""
    root = ET.Element(
        f"{{{NS}}}Norma",
        {
            "normaId": norma_id,
            "fechaVersion": fecha_version,
            "derogado": derogado,
        },
    )

    # Identificador
    ident = _sub(root, "Identificador", fechaPublicacion=fecha_publicacion)
    tn = _sub(ident, "TipoNumero")
    _sub(tn, "Tipo", tipo)
    _sub(tn, "Numero", numero)
    _sub(ident, "Organismo", organismo)

    # Version markers so extract_version_dates finds them
    for d in (version_dates or [fecha_version]):
        _sub(ident, "Version", fechaVersion=d)

    # Metadatos
    meta = _sub(root, "Metadatos")
    _sub(meta, "TituloNorma", titulo)

    # EstructurasFuncionales
    if articles:
        efs = _sub(root, "EstructurasFuncionales")
        for art_id, art_text in articles:
            ef = _sub(efs, "EstructuraFuncional", tipoParte="Artículo", numero=art_id)
            _sub(ef, "Texto", art_text)

    return root


@pytest.fixture()
def sample_norma_xml():
    """A minimal LeyChile Norma XML element for Ley 20000."""
    return build_norma_xml(
        articles=[
            ("1", "Artículo 1.- Esta ley regula las drogas."),
            ("2", "Artículo 2.- Se prohíbe el tráfico."),
        ]
    )


@pytest.fixture()
def versiones_json(tmp_path) -> Path:
    """Write a sample versiones.json and return the directory containing it."""
    import json

    law_dir = tmp_path / "leyes" / "20000"
    law_dir.mkdir(parents=True)
    versions = [
        {"fecha": "2005-02-16", "committed": True},
        {"fecha": "2011-02-21", "committed": True, "modificadaPor": {"numero": "20502"}},
        {"fecha": "2013-08-01", "committed": False},
    ]
    (law_dir / "versiones.json").write_text(
        json.dumps(versions, ensure_ascii=False), encoding="utf-8"
    )
    return law_dir


import os

DSN = os.environ.get("DATABASE_URL")


@pytest.fixture()
def conn():
    """A connection to a freshly-schema'd database. Integration tests only.

    Skips rather than fails when DATABASE_URL is unset, so the default
    `pytest -m "not integration"` run needs no Postgres.
    """
    if not DSN:
        pytest.skip("DATABASE_URL not set")
    from loader.db import SCHEMA_PATH, apply_schema, connect

    c = connect(DSN)
    c.execute("DROP SCHEMA IF EXISTS analytics CASCADE")
    c.execute("DROP TABLE IF EXISTS articulo_span, articulo, version, "
              "publication_event, modificacion, norma, load_state CASCADE")
    apply_schema(c, SCHEMA_PATH)
    yield c
    c.close()
