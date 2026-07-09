"""Segmentation is the single source of truth for article identity."""
import pytest
from segment import (
    Segment, normalize_label, label_to_slug, segment, canonical_text, sha256_text,
)


@pytest.mark.parametrize("ident", ["1º", "1°", "1"])
def test_ordinal_variants_share_one_slug(ident):
    assert label_to_slug(normalize_label(f"articulo {ident}")) == "art-1"


def test_label_to_slug_specials():
    assert label_to_slug("__preamble__") == "preambulo"
    assert label_to_slug("__doc__") == "doc"
    assert label_to_slug("articulo 5 bis") == "art-5-bis"
    assert label_to_slug("articulo unico") == "art-unico"


def test_segment_markdown_headings_with_preamble():
    text = "Preámbulo.\n\n#### Artículo 1º\nCuerpo uno.\n\n#### Artículo 2°\nCuerpo dos."
    segs = segment(text)
    assert [s.slug for s in segs] == ["preambulo", "art-1", "art-2"]
    assert segs[1].raw_heading == "Artículo 1º"
    assert segs[1].body == "Cuerpo uno."


def test_segment_falls_back_to_doc():
    segs = segment("Texto sin artículos.")
    assert len(segs) == 1
    assert segs[0].slug == "doc"
    assert segs[0].raw_heading == ""


@pytest.mark.parametrize("ord_char", ["°", "º"])
def test_segment_inline_markers(ord_char):
    # Both ordinal characters must split. Without the widened HEADING_RE the
    # 'º' variant matches nothing and degrades to a single __doc__ segment.
    text = f"Artículo 1{ord_char}.- Cuerpo uno. Artículo 2{ord_char}.- Cuerpo dos."
    assert [s.slug for s in segment(text)] == ["art-1", "art-2"]


def test_md_heading_re_never_matches_abbreviation():
    # Preserved quirk: \b sits between '.' and ' ', both non-word. See spec §6.3.
    assert segment("#### Art. 5\nCuerpo.")[0].slug == "doc"


def test_canonical_text_is_whitespace_insensitive():
    a = segment("#### Artículo 1º\nCuerpo.\n\n")
    b = segment("#### Artículo 1º\n\n   Cuerpo.   ")
    assert canonical_text(a) == canonical_text(b) == "Artículo 1º\nCuerpo."


def test_sha256_text_is_stable():
    assert sha256_text("abc") == sha256_text("abc")
    assert sha256_text("abc") != sha256_text("abd")
