from measure_phase0 import Coverage, classify, doc_rate


def test_classify_markdown():
    assert classify("#### Artículo 1º\nCuerpo.") == "md"


def test_classify_inline():
    assert classify("Artículo 1°.- Cuerpo.") == "inline"


def test_classify_doc_fallback():
    assert classify("Sin artículos aquí.") == "doc"


def test_doc_rate():
    c = Coverage(tipo="ley", total=10, md=7, inline=2, doc=1)
    assert doc_rate(c) == 0.1


def test_doc_rate_of_empty_is_zero():
    assert doc_rate(Coverage(tipo="res", total=0, md=0, inline=0, doc=0)) == 0.0
