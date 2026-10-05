"""Article headings come from the norma's `estructura` tree.

Shapes are taken from real get_norma_json responses: LGE (DFL 2/2010,
idNorma 1014974), Código del Trabajo (207436), Código Penal (1984), Código
Civil DFL 1/2000 (172986), Código de Aguas (5605), Ley 20.529 (1028635),
Ley 16.744 (28650).
"""
import pytest

from render_texto import _article_id, render


def _art(i, text):
    return {"i": i, "t": f'<div><div class="p">{text}</div></div>'}


def _headings(md):
    return [line for line in md.splitlines() if line.startswith("#")]


def _render_one(name, text, i=1):
    return render([_art(i, text)], [{"n": name, "i": i, "t": 6}])


@pytest.mark.parametrize(
    "name, tokens, qualifier",
    [
        ("Artículo 16 B", ["16", "B"], ""),
        ("Artículo 10 BIS", ["10", "bis"], ""),
        ("Artículo 152 quinquies A", ["152", "quinquies", "A"], ""),
        ("Artículo 1 Transitorio", ["1", "transitorio"], ""),
        ("Artículo 1 TRANSITORIO Transitorio", ["1", "transitorio"], ""),
        ("Artículo 4 (DEL ART. 1) Transitorio", ["4", "transitorio"], "(art. 1)"),
        ("Artículo 79 (DEL ART. 8)", ["79"], "(art. 8)"),
        ("Artículo 225-2 (DEL ART. 2)", ["225-2"], "(art. 2)"),
        ("Artículo 1792- 5 (DEL ART. 2)", ["1792-5"], "(art. 2)"),
        ("Artículo 129 BIS 17", ["129", "bis", "17"], ""),
        ("Artículo UNICO", ["unico"], ""),
        ("Artículo DECIMOQUINTO Transitorio", ["decimoquinto", "transitorio"], ""),
        ("Artículo UNDÉCIMO", ["undécimo"], ""),
        ("Artículo 483 a)", ["483", "a)"], ""),
        ("Artículo vigésimo primero", ["vigésimo primero"], ""),
        ("Artículo VIGESIMO SEGUNDO Transitorio", ["vigesimo segundo", "transitorio"], ""),
        ("Artículo vigesimoprimero", ["vigesimoprimero"], ""),
        ("Artículo quincuagésimo", ["quincuagésimo"], ""),
        ("Artículo sétimo", ["sétimo"], ""),
        ("Artículo sesto", ["sesto"], ""),
        ("Artículo nono", ["nono"], ""),
        ("Artículo III", ["III"], ""),
        ("Artículo siete", ["siete"], ""),
        # epigraph after the number is not part of the identifier, and its
        # first capitals ("DE") are not letter suffixes
        ("Artículo 5 CUMPLIMIENTO DE LOS LIMITES DE CREDITO.", ["5"], ""),
        ("Artículo 2 DE LA LEY", ["2"], ""),
    ],
)
def test_article_id(name, tokens, qualifier):
    assert _article_id({"n": name, "t": 6}) == (tokens, qualifier)


def test_bare_article_name_has_no_id():
    assert _article_id({"n": "Artículo", "t": 6}) is None


def test_letter_suffix_series_is_distinct():
    est = [{"n": f"Artículo 16 {c}", "i": n, "t": 6} for n, c in enumerate("AB", 1)]
    html = [
        _art(1, "Artículo 16 A. Se entenderá por buena convivencia escolar"),
        _art(2, 'Artículo <span class="n">Ley 21809</span>16 B.- Los establecimientos'),
    ]
    assert render(html, est).split("\n\n") == [
        "#### Artículo 16 A", "Se entenderá por buena convivencia escolar",
        "#### Artículo 16 B", "Los establecimientos",
    ]


def test_transitorio_from_node_when_text_omits_it():
    # LGE: permanent "Artículo 1" and "Artículo 1 Transitorio", text "Artículo 1º.-"
    est = [{"n": "Artículo 1", "i": 1, "t": 6}, {"n": "Artículo 1 Transitorio", "i": 2, "t": 6}]
    html = [_art(1, "Artículo 1º.- La presente ley"), _art(2, "Artículo 1º.- El Presidente")]
    assert render(html, est).split("\n\n") == [
        "#### Artículo 1º", "La presente ley", "#### Artículo 1º transitorio", "El Presidente",
    ]


def test_text_spelling_wins_over_node():
    # The tree drops accents; the law text has them
    assert _headings(_render_one("Artículo unico", "Artículo único.- Apruébase")) == [
        "#### Artículo único",
    ]
    assert _headings(_render_one("Artículo 18 quater", "Artículo 18 quáter.- Texto")) == [
        "#### Artículo 18 quáter",
    ]


def test_text_suffix_missing_from_node_is_kept():
    # Código Penal tree: "Artículo 49 QUÁRTER" (typo) for "Art. 49 quáter."
    md = _render_one("Artículo 49 QUÁRTER", "Artículo 49 quáter.- Texto")
    assert md.split("\n\n") == ["#### Artículo 49 quáter", "Texto"]


def test_capital_opening_the_body_is_not_a_suffix():
    md = _render_one("Artículo 12", "Artículo 12 A los efectos de esta ley")
    assert md.split("\n\n") == ["#### Artículo 12", "A los efectos de esta ley"]


def test_o_ordinal_becomes_degree_sign():
    # Código del Trabajo: "Artículo 1o" left a stray "o" in the body
    md = _render_one("Artículo 1", "Artículo 1o Las relaciones laborales")
    assert md.split("\n\n") == ["#### Artículo 1º", "Las relaciones laborales"]


def test_quoted_article_inside_an_article_is_not_a_heading():
    html = [{"i": 1, "t": (
        '<div><div class="p">Artículo 3.- Introdúcense las siguientes modificaciones:</div>'
        '<div class="p">"Artículo 15.- Corresponderá a las Secretarías Regionales</div></div>'
    )}]
    md = render(html, [{"n": "Artículo 3", "i": 1, "t": 6}])
    assert _headings(md) == ["#### Artículo 3"]
    assert '"Artículo 15.- Corresponderá' in md


def test_non_article_node_does_not_promote_articles():
    html = [{"i": 1, "t": '<div><div class="p">Artículo único.- Fíjase el siguiente texto</div></div>'}]
    assert _headings(render(html, [{"n": "Encabezado", "i": 1}])) == []


def test_annex_articles_still_detected():
    html = [{"i": 1, "t": '<div><div class="p">Artículo 1.- El presente acuerdo</div></div>'}]
    assert _headings(render(html, [{"n": "Anexo ACUERDO", "i": 1}])) == ["#### Artículo 1"]


def test_bare_article_node_falls_back_to_regex():
    assert _headings(_render_one("Artículo", "Artículo único.- Concédese")) == [
        "#### Artículo único",
    ]


def test_without_estructura_regex_path_is_unchanged():
    html = [_art(1, "Artículo 16.- Las infracciones")]
    assert render(html) == "#### Artículo 16\n\nLas infracciones"


def test_nested_law_qualifier_only_where_needed():
    # DFL 1/2000: the Código Civil (art. 2) is the largest group and stays
    # bare; a nested law's article keeps its qualifier only on collision.
    est = [
        {"n": "Artículo 1 (DEL ART. 2)", "i": 1, "t": 6},
        {"n": "Artículo 2 (DEL ART. 2)", "i": 2, "t": 6},
        {"n": "Artículo 3 (DEL ART. 2)", "i": 3, "t": 6},
        {"n": "Artículo 1 (DEL ART. 8)", "i": 4, "t": 6},
        {"n": "Artículo 79 (DEL ART. 8)", "i": 5, "t": 6},
    ]
    html = [_art(i, f"Artículo {n}.- Texto") for i, n in [(1, 1), (2, 2), (3, 3), (4, 1), (5, 79)]]
    assert _headings(render(html, est)) == [
        "#### Artículo 1", "#### Artículo 2", "#### Artículo 3",
        "#### Artículo 1 (art. 8)", "#### Artículo 79",
    ]


def test_article_node_without_text_emits_nothing():
    html = [{"i": 1, "t": "<div></div>"}]
    assert render(html, [{"n": "Artículo 1", "i": 1, "t": 6}]) == ""



def test_article_containing_articles_keeps_its_heading():
    # DFL 1/2000 "Artículo 2º.- Fíjase el siguiente texto refundido ... del
    # Código Civil" holds the whole code; it is still an article of the DFL.
    est = [{"n": "ARTÍCULO 2 (CÓDIGO CIVIL)", "i": 1, "t": 6, "h": [
        {"n": "Artículo 1 (DEL ART. 2)", "i": 2, "t": 6},
    ]}]
    html = [{"i": 1, "t": '<div><div class="p">Artículo 2º.- Fíjase el siguiente texto</div></div>',
             "h": [_art(2, "Art. 1º. La ley es una declaración")]}]
    assert _headings(render(html, est)) == ["#### Artículo 2º", "#### Artículo 1º"]


def test_tagged_doble_articulado_is_qualified():
    # 1134945: "Doble Articulado del Artículo PRIMERO" (type 13)
    est = [{"n": "Artículo PRIMERO", "i": 1, "t": 6, "h": [
        {"n": "Doble Articulado del Artículo PRIMERO", "i": 2, "t": 13, "h": [
            {"n": "Artículo primero", "i": 3, "t": 6},
        ]},
    ]}]
    html = [{"i": 1, "t": '<div><div class="p">Artículo primero: Apruébase</div></div>', "h": [
        {"i": 2, "t": "<div></div>", "h": [_art(3, "Artículo primero.- Texto")]},
    ]}]
    assert _headings(render(html, est)) == [
        "#### Artículo primero", "#### Artículo primero (art. primero)",
    ]


def test_embedded_ordinance_inside_an_article():
    # Plan Regulador de Tocopilla (127592): Artículo 2° holds the Ordenanza,
    # which LeyChile's tree doesn't break down.
    html = [{"i": 1, "t": (
        '<div><div class="p">Artículo 2°.- El texto de la Ordenanza es el siguiente:</div>'
        '<div class="p">ARTICULO 1. Las disposiciones de la presente Ordenanza</div>'
        '<div class="p">ARTICULO 2. El área de aplicación del Plan</div>'
        '<div class="p">ARTICULO 2 bis. Texto</div>'
        '<div class="p">ARTICULO 3. Todas aquellas materias</div></div>'
    )}]
    md = render(html, [{"n": "Artículo 2", "i": 1, "t": 6}])
    assert _headings(md) == [
        "#### Artículo 2°", "#### Artículo 1 (art. 2)", "#### Artículo 2 (art. 2)",
        "#### Artículo 2 bis (art. 2)", "#### Artículo 3 (art. 2)",
    ]
    assert "Las disposiciones de la presente Ordenanza" in md


@pytest.mark.parametrize("labels", [
    # quoted, as an amending law quotes them
    ['"Artículo 1.- A', '"Artículo 2.- B', '"Artículo 3.- C'],
    # not counting up from 1
    ["Artículo 15.- A", "Artículo 16.- B", "Artículo 17.- C"],
    # gaps
    ["Artículo 1.- A", "Artículo 4.- B", "Artículo 9.- C"],
    # too few
    ["Artículo 1.- A", "Artículo 2.- B"],
])
def test_quoted_or_scattered_articles_are_not_embedded(labels):
    divs = "".join(f'<div class="p">{l}</div>' for l in labels)
    html = [{"i": 1, "t": f'<div><div class="p">Artículo 3.- Modifícase:</div>{divs}</div>'}]
    assert _headings(render(html, [{"n": "Artículo 3", "i": 1, "t": 6}])) == ["#### Artículo 3"]


def test_two_word_ordinal_heading_and_body():
    md = _render_one("Artículo vigésimo primero", "Artículo vigésimo primero.- Texto")
    assert md.split("\n\n") == ["#### Artículo vigésimo primero", "Texto"]


def test_roman_numeral_heading_keeps_case():
    md = _render_one("Artículo III", "Artículo III.- Las Partes")
    assert md.split("\n\n") == ["#### Artículo III", "Las Partes"]


def test_transitorio_from_tree_only_when_it_disambiguates():
    # Ley 20.529: tree says "DECIMOQUINTO Transitorio" but text and the other
    # transitorios say plain "decimoquinto"; nothing collides, so follow the text.
    est = [{"n": "Artículo 1", "i": 1, "t": 6},
           {"n": "Artículo DECIMOCUARTO", "i": 2, "t": 6},
           {"n": "Artículo DECIMOQUINTO Transitorio", "i": 3, "t": 6}]
    html = [_art(1, "Artículo 1.- A"), _art(2, "Artículo decimocuarto.- B"),
            _art(3, "Artículo decimoquinto.- C")]
    assert _headings(render(html, est)) == [
        "#### Artículo 1", "#### Artículo decimocuarto", "#### Artículo decimoquinto",
    ]


def test_transitorio_kept_when_text_says_it():
    est = [{"n": "Artículo 7 Transitorio", "i": 1, "t": 6}]
    html = [_art(1, "Artículo 7° transitorio.- Texto")]
    assert render(html, est).split("\n\n") == ["#### Artículo 7° transitorio", "Texto"]
