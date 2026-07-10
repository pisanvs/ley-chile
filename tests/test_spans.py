from segment import canonical_text, segment
from spans import (
    ArticleRow, SpanRow, VersionInput, build_articles_and_spans, reconstruct,
)


def _v(desde, hasta, texto):
    return VersionInput(desde=desde, hasta=hasta, texto=texto)


V1 = "#### Artículo 1º\nOriginal uno.\n\n#### Artículo 2°\nOriginal dos."
V2 = "#### Artículo 1º\nOriginal uno.\n\n#### Artículo 2°\nMODIFICADO dos."


def test_unchanged_article_is_stored_once_with_one_wide_span():
    arts, spans = build_articles_and_spans(42, [
        _v("2000-01-01", "2009-12-31", V1),
        _v("2010-01-01", None, V2),
    ])
    art1 = [a for a in arts if a.slug == "art-1"]
    assert len(art1) == 1, "unchanged article must not be duplicated"

    span1 = [s for s in spans if s.slug == "art-1"]
    assert len(span1) == 1
    assert (span1[0].desde, span1[0].hasta) == ("2000-01-01", None)


def test_modified_article_yields_two_disjoint_spans():
    arts, spans = build_articles_and_spans(42, [
        _v("2000-01-01", "2009-12-31", V1),
        _v("2010-01-01", None, V2),
    ])
    assert len([a for a in arts if a.slug == "art-2"]) == 2
    span2 = sorted([s for s in spans if s.slug == "art-2"], key=lambda s: s.desde)
    assert [(s.desde, s.hasta) for s in span2] == [
        ("2000-01-01", "2009-12-31"), ("2010-01-01", None),
    ]


def test_article_that_reverts_produces_two_spans_for_one_article_row():
    arts, spans = build_articles_and_spans(7, [
        _v("2000-01-01", "2004-12-31", V1),
        _v("2005-01-01", "2009-12-31", V2),
        _v("2010-01-01", None, V1),
    ])
    # art-2 body A appears in v0 and v2 (non-contiguous) -> one row, two spans
    a2 = [a for a in arts if a.slug == "art-2" and a.body == "Original dos."]
    assert len(a2) == 1
    revert_spans = [s for s in spans if s.slug == "art-2" and s.body_sha256 == a2[0].body_sha256]
    assert len(revert_spans) == 2


def test_ord_lives_on_the_span_so_insertions_do_not_corrupt_order():
    v_before = "#### Artículo 1º\nUno."
    v_after = "#### Artículo 0\nCero.\n\n#### Artículo 1º\nUno."
    arts, spans = build_articles_and_spans(9, [
        _v("2000-01-01", "2009-12-31", v_before),
        _v("2010-01-01", None, v_after),
    ])
    # art-1's body never changed, but its position did -> two spans, different ord
    s1 = sorted([s for s in spans if s.slug == "art-1"], key=lambda s: s.desde)
    assert [s.ord for s in s1] == [0, 1]
    assert len([a for a in arts if a.slug == "art-1"]) == 1, "body unchanged: one row"


def test_reconstruct_round_trips_canonical_text():
    versions = [_v("2000-01-01", "2009-12-31", V1), _v("2010-01-01", None, V2)]
    arts, spans = build_articles_and_spans(42, versions)
    for v in versions:
        got = reconstruct(arts, spans, v.desde)
        assert canonical_text(got) == canonical_text(segment(v.texto))


def test_reconstruct_at_a_date_inside_a_range():
    arts, spans = build_articles_and_spans(42, [_v("2000-01-01", None, V1)])
    assert canonical_text(reconstruct(arts, spans, "2005-06-06")) == canonical_text(segment(V1))


def test_reconstruct_outside_every_span_is_empty():
    arts, spans = build_articles_and_spans(42, [_v("2000-01-01", "2001-01-01", V1)])
    assert reconstruct(arts, spans, "1999-01-01") == []
