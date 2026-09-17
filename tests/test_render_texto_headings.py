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
