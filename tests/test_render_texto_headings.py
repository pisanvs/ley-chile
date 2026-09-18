"""Article headings keep the letter that is part of their identifier.

Before the fix, "Artículo 16 A.-" .. "Artículo 16 E.-" all rendered as
"#### Artículo 16" with the letter pushed into the body, so the articles
collapsed into identical headings and could not be addressed downstream
(get_article, anchors, MCP).
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from render_texto import _maybe_promote_heading as promote  # noqa: E402


@pytest.mark.parametrize(
    "para, heading, body",
    [
        # LGE convivencia series (DFL 2/2010)
        ("Artículo 16 A. Se entenderá por buena convivencia escolar",
         "#### Artículo 16 A", "Se entenderá por buena convivencia escolar"),
        ("Artículo 16 B.- Se entenderá por acoso escolar",
         "#### Artículo 16 B", "Se entenderá por acoso escolar"),
        # DL 825 art. 35 A..Ñ and 50° A..B
        ("Artículo 35 Ñ.- Un reglamento, emitido por intermedio",
         "#### Artículo 35 Ñ", "Un reglamento, emitido por intermedio"),
        ("Artículo 50° A.- Estarán exentas del impuesto",
         "#### Artículo 50° A", "Estarán exentas del impuesto"),
        ("ARTICULO 3 B.- Texto", "#### Artículo 3 B", "Texto"),
    ],
)
def test_heading_keeps_letter_suffix(para, heading, body):
    assert promote(para) == [heading, body]


@pytest.mark.parametrize(
    "para, heading, body",
    [
        ("Artículo 16.- Las infracciones a lo dispuesto",
         "#### Artículo 16", "Las infracciones a lo dispuesto"),
        ("Artículo 10 bis.- Los establecimientos",
         "#### Artículo 10 bis", "Los establecimientos"),
        ("Artículo único.- Apruébase", "#### Artículo único", "Apruébase"),
    ],
)
def test_existing_headings_unchanged(para, heading, body):
    assert promote(para) == [heading, body]


@pytest.mark.parametrize(
    "para, heading, body",
    [
        # A capital letter opening the body is not a suffix: no delimiter follows it
        ("Artículo 12 A los efectos de esta ley",
         "#### Artículo 12", "A los efectos de esta ley"),
        ("Artículo 4 Y sin perjuicio de lo anterior",
         "#### Artículo 4", "Y sin perjuicio de lo anterior"),
        # Lowercase list markers stay in the body
        ("Artículo 5 a) Los sostenedores", "#### Artículo 5", "a) Los sostenedores"),
    ],
)
def test_body_start_is_not_mistaken_for_a_letter(para, heading, body):
    assert promote(para) == [heading, body]


@pytest.mark.parametrize(
    "para, heading, body",
    [
        ("Artículo 1° transitorio.- El Presidente de la República",
         "#### Artículo 1° transitorio", "El Presidente de la República"),
        ("Artículo 2º TRANSITORIO.- No obstante",
         "#### Artículo 2º transitorio", "No obstante"),
    ],
)
def test_heading_keeps_transitorio_suffix(para, heading, body):
    assert promote(para) == [heading, body]


def test_transitoriamente_in_the_body_is_not_a_suffix():
    assert promote("Artículo 7 transitoriamente se aplicará") == [
        "#### Artículo 7", "transitoriamente se aplicará",
    ]
@pytest.mark.parametrize(
    "para, heading, body",
    [
        # Código del Trabajo (DFL 1/2003) writes the letter with a hyphen and
        # never with a space: "Artículo 211" appeared eleven times in a row.
        ("Artículo 211-A.- Las trabajadoras y los trabajadores tienen derecho",
         "#### Artículo 211-A", "Las trabajadoras y los trabajadores tienen derecho"),
        ("Artículo 145-K.- El contrato de embarco",
         "#### Artículo 145-K", "El contrato de embarco"),
        # Abbreviated label, same form
        ("Art. 211-C.- Si la denuncia es presentada en la empresa",
         "#### Artículo 211-C", "Si la denuncia es presentada en la empresa"),
        # Two letters exist only in the hyphened form (183-AA..183-AE)
        ("Artículo 183-AA.- Podrán pactarse con el trabajador",
         "#### Artículo 183-AA", "Podrán pactarse con el trabajador"),
        # Letter plus bis: the delimiter comes after "bis"
        ("Artículo 211-B bis.- En caso de acoso sexual",
         "#### Artículo 211-B bis", "En caso de acoso sexual"),
        # Whitespace around the hyphen is normalised away
        ("Artículo 91 - B.- El empleador deberá llevar un registro",
         "#### Artículo 91-B", "El empleador deberá llevar un registro"),
    ],
)
def test_heading_keeps_hyphenated_letter_suffix(para, heading, body):
    assert promote(para) == [heading, body]


@pytest.mark.parametrize(
    "para, heading, body",
    [
        # A dash introducing the body is not a letter suffix: no delimiter
        # follows the capitals.
        ("Artículo 16 - LAS INFRACCIONES a lo dispuesto",
         "#### Artículo 16", "LAS INFRACCIONES a lo dispuesto"),
        ("Artículo 20 - En lo demás se aplicará",
         "#### Artículo 20", "En lo demás se aplicará"),
    ],
)
def test_dash_before_body_is_not_a_suffix(para, heading, body):
    assert promote(para) == [heading, body]
@pytest.mark.parametrize(
    "para, heading, body",
    [
        # The Código del Trabajo runs past quáter: art. 18, 66, 152 and 157 each
        # have a quinquies, and 157 also sexies and septies. Without them the
        # suffix was dropped and the articles collapsed onto the bare number.
        ("Artículo 18 quinquies.- Las empresas deberán",
         "#### Artículo 18 quinquies", "Las empresas deberán"),
        ("Artículo 157 sexies.- El empleador",
         "#### Artículo 157 sexies", "El empleador"),
        ("Artículo 157 septies.- Un reglamento",
         "#### Artículo 157 septies", "Un reglamento"),
        # Suffix case is normalised like BIS/TER already was
        ("Artículo 66 QUINQUIES.- Texto",
         "#### Artículo 66 quinquies", "Texto"),
        # ... and they combine with a letter, as bis/ter do
        ("Artículo 152 quinquies A.- El trabajo a distancia",
         "#### Artículo 152 quinquies A", "El trabajo a distancia"),
    ],
)
def test_heading_keeps_higher_ordinal_suffix(para, heading, body):
    assert promote(para) == [heading, body]
