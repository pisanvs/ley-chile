"""HTML→Markdown renderer for Ley Chile texto.md files.

Operates directly on the BCN HTML tree from cache/versions/{id}/{date}.json.

Source structural conventions:
  <div class="p">...</div>       — inciso (paragraph) inside an article
  <span class="n">...</span>     — inline amendment ref (Ley N Art. M D.O. d.m.y).
                                   STRIPPED per user request — git tracks the changes.
  <div class="n rnp">...</div>   — inline NOTA back-link marker. STRIPPED.
  <div class="np">...</div>      — actual NOTA body. Rendered as blockquote.

Tree levels:
  Each html[i] item may have children in 'h'. Typical:
    depth 0: TÍTULO / CAPÍTULO sections OR document header/trailer
    depth 1: Párrafo sections
    depth 2: individual Artículos

The item's 't' field is the chunk's own HTML; 'h' is its children.
"""
from __future__ import annotations

import html as html_module
import re
from typing import Iterable

# ---------------------------------------------------------------------------
# Structural strippers (apply BEFORE generic tag-stripping)
# ---------------------------------------------------------------------------

# <span class="n">...</span> — amendment references
_AMENDMENT = re.compile(
    r"<span\s+class=[\"']n[\"'][^>]*>.*?</span>",
    re.IGNORECASE | re.DOTALL,
)

# <div class="n rnp" ...>...</div> — inline NOTA back-link marker
_NOTA_BACKLINK = re.compile(
    r"<div\s+class=[\"']n\s+rnp[\"'][^>]*>.*?</div>",
    re.IGNORECASE | re.DOTALL,
)

# <div class="np" ...>...</div> — NOTA body (capture group keeps content)
_NOTA_BODY = re.compile(
    r"<div\s+class=[\"']np[\"'][^>]*>(.*?)</div>",
    re.IGNORECASE | re.DOTALL,
)

# <div class="p">...</div> — paragraph (inciso). Capture content.
_PARAGRAPH = re.compile(
    r"<div\s+class=[\"']p[\"'][^>]*>(.*?)</div>",
    re.IGNORECASE | re.DOTALL,
)

# Inline link to a NOTA marker (e.g. `<a href="#rnp0">NOTA:</a>`) inside <div class="np">
_NOTA_INTERNAL_LINK = re.compile(r"<a[^>]*>NOTA:?</a>", re.IGNORECASE)

# Generic tag stripper (applied last)
_TAG = re.compile(r"<[^>]+>")

# Collapse runs of whitespace (within a paragraph)
_INLINE_WS = re.compile(r"[ \t ]+")


def _strip_inline(text: str) -> str:
    """Remove inline noise (amendment refs + nota back-links) BEFORE any
    other tag work, so they don't splice into surrounding words."""
    text = _AMENDMENT.sub("", text)
    text = _NOTA_BACKLINK.sub("", text)
    return text


def _decode_entities_and_normalize(text: str) -> str:
    text = html_module.unescape(text)
    text = _INLINE_WS.sub(" ", text)
    return text.strip()


def _strip_tags(text: str) -> str:
    return _TAG.sub("", text)


# ---------------------------------------------------------------------------
# Render a single 't' chunk (the HTML body of one tree item) into a list of
# markdown paragraphs.
# ---------------------------------------------------------------------------


def _render_chunk(t: str) -> list[str]:
    """Yield clean markdown paragraphs from one html 't' chunk."""
    # 1) Strip inline amendment refs and nota back-links first.
    t = _strip_inline(t)

    # 2) Extract NOTA bodies as separate blockquoted paragraphs. We replace
    #    each NOTA block with a sentinel that we'll expand later, so it
    #    doesn't get absorbed into the surrounding article body.
    notas: list[str] = []

    def _replace_nota(m):
        body = m.group(1)
        # Some NOTAs start with their own `<a href="#rnp...">NOTA:</a>` link;
        # remove that so it doesn't end up as a bare "NOTA" word.
        body = _NOTA_INTERNAL_LINK.sub("", body)
        body = _decode_entities_and_normalize(_strip_tags(body))
        if body:
            notas.append(body)
        sentinel = f"\x00NOTA{len(notas) - 1}\x00"
        return sentinel

    t = _NOTA_BODY.sub(_replace_nota, t)

    # 3) Now extract paragraphs (<div class="p">...</div>) as separate items.
    paragraphs: list[str] = []
    seen_indices: list[tuple[int, int]] = []
    for m in _PARAGRAPH.finditer(t):
        seen_indices.append((m.start(), m.end()))
        body = _decode_entities_and_normalize(_strip_tags(m.group(1)))
        if body:
            paragraphs.append(body)

    # 4) If there are no <div class="p"> wrappers (e.g. a bare TÍTULO chunk
    #    is just text inside a top-level <div>), fall back to stripping
    #    tags and treating the whole thing as one paragraph.
    if not paragraphs:
        body = _decode_entities_and_normalize(_strip_tags(t))
        if body:
            paragraphs.append(body)

    # 5) Expand NOTA sentinels into blockquoted paragraphs RIGHT AFTER the
    #    paragraph that contains them, so the note stays attached to its
    #    referring inciso. If the sentinel never landed inside a paragraph
    #    (shouldn't happen with current structure), append at the end.
    out: list[str] = []
    used = set()
    for p in paragraphs:
        # Sentinels may appear inside p as residual text
        s_match = re.search(r"\x00NOTA(\d+)\x00", p)
        if s_match:
            idx = int(s_match.group(1))
            clean = re.sub(r"\x00NOTA\d+\x00", "", p).strip()
            if clean:
                out.append(clean)
            if 0 <= idx < len(notas):
                out.append("> **Nota.** " + notas[idx])
                used.add(idx)
        else:
            out.append(p)
    for i, nota in enumerate(notas):
        if i not in used:
            out.append("> **Nota.** " + nota)

    # Merge a bare section marker like "§ I." with its following paragraph
    # (the BCN cache splits them across two <div class="p"> blocks).
    merged: list[str] = []
    i = 0
    while i < len(out):
        cur = out[i]
        m = re.match(r"^§?\s*([IVX]{1,4})\.?\s*$", cur.strip())
        if m and i + 1 < len(out) and not out[i + 1].startswith(("#", ">", "-")):
            merged.append(m.group(1) + ". " + out[i + 1].strip().rstrip("."))
            i += 2
        else:
            merged.append(cur)
            i += 1
    return [p for p in merged if p]


# ---------------------------------------------------------------------------
# Heading promotion
# ---------------------------------------------------------------------------

_RX_LIBRO = re.compile(
    r"^LIBRO\s+(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|[IVXLCDM]+|\d+)\b\s*[\.\-—:]?\s*(.*)$",
    re.IGNORECASE,
)
_RX_TITULO = re.compile(
    r"^(?:TÍTULO|TITULO)\s+(PRIMERO|SEGUNDO|TERCERO|CUART[O0]|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|PRELIMINAR|[IVXLCDM]+|\d+)\b\s*[\.\-—:]?\s*(.*)$",
    re.IGNORECASE,
)
_RX_CAPITULO = re.compile(
    r"^(?:Capítulo|Capitulo|CAPÍTULO|CAPITULO)\s+([IVXLCDM\d][-IVXLCDM\d.]*?)(?:\s+[—:]\s+(.*))?$",
    re.IGNORECASE,
)
_RX_PARRAFO = re.compile(
    r"^(?:Párrafo|Parrafo|PÁRRAFO|PARRAFO)\s+(\d+[ºo°]?|[IVXLCDM]+)\s*[-—:]?\s*(.*)$",
    re.IGNORECASE,
)
# Roman-numeral subsection inside a Código (e.g. "I. De los delitos.").
# Anchored so it doesn't fire on stray Roman numerals mid-text.
_RX_ROMAN_SUBSECTION = re.compile(
    r"^(?:§\s+|(?:Parte|PARTE|parte)\s+)?([IVX]{1,4})\.\s+([A-ZÁÉÍÓÚÑ][^.]{4,140})\.?$",
)

_RX_NUMBERED_SUBSECTION = re.compile(
    r"^(?:§\s+)?(\d{1,2})\.\s+([A-ZÁÉÍÓÚÑ][^.]{4,70})\.?$",
)
_RX_BARE_SECTION_MARK = re.compile(r"^§?\s*([IVX]{1,4})\.?\s*$")
_RX_ARTICULO_START = re.compile(
    r"^(?:Artículo|Articulo|ART(?:ÍCULO|ICULO)?\.?)\s+(\d+[ºo°]?(?:\s*(?:bis|ter|quáter|quater|BIS|TER|QU[ÁA]TER))?|[úu]nico|transitorio|primero|segundo|tercero|cuarto|quinto|sexto|s[ée]ptimo|octavo|noveno|d[ée]cimo|final)\s*[-—.:]*\s*(.*)$",
    re.IGNORECASE,
)
_RX_ARTICULOS_TRANS = re.compile(r"^Artículos\s+transitorios?$", re.IGNORECASE)


def _maybe_promote_heading(para: str, depth: int = 0, suppress_subsection: bool = False) -> list[str]:
    """If a single paragraph is or starts with a structural heading, split it."""
    p = para.strip()
    # Strip leading quotation marks / spurious punctuation so e.g.
    # '"Artículo único.- ...' still matches.
    p = re.sub(r'^["“”«»‚‹›\s]+', "", p)

    m = _RX_LIBRO.match(p)
    if m:
        num, rest = m.group(1).strip(), m.group(2).strip()
        if num.isalpha() and not set(num.upper()).issubset(set("IVXLCDM")):
            num = num.title()
        else:
            num = num.upper()
        title = f"# Libro {num}"
        if rest:
            return [title, rest]
        return [title]

    m = _RX_TITULO.match(p)
    if m:
        num, rest = m.group(1).strip(), m.group(2).strip()
        # Title-case Spanish ordinals (PRIMERO -> Primero); keep Roman
        # numerals uppercase. Roman = pure I/V/X/L/C/D/M.
        if num.isalpha() and not set(num.upper()).issubset(set("IVXLCDM")):
            num = num.title()
        else:
            num = num.upper()
        title = f"## Título {num}"
        if rest and not rest.lower().startswith(("art", "párrafo", "parrafo", "capítulo")):
            title = f"## Título {num} — {rest}"
            return [title]
        return [title] + ([rest] if rest else [])

    m = _RX_CAPITULO.match(p)
    if m:
        num = m.group(1).strip()
        rest = (m.group(2) or "").strip()
        title = f"## Capítulo {num}"
        if rest:
            title = f"## Capítulo {num} — {rest}"
        return [title]

    m = _RX_PARRAFO.match(p)
    if m:
        num, rest = m.group(1), m.group(2).strip()
        title = f"### Párrafo {num}"
        if rest:
            title = f"### Párrafo {num} — {rest}"
        return [title]

    # Roman subsections (incl. "Parte X.") are always allowed —
    # they tend to be true structural dividers even inside long chunks.
    m = _RX_ROMAN_SUBSECTION.match(p)
    if m:
        prefix = ""
        head = p[:m.start(1)].strip()
        if head.lower().startswith("parte"):
            prefix = "Parte "
        return [f"### {prefix}{m.group(1)}. {m.group(2).strip()}"]
    # Arabic-numbered subsections are list-item-shaped, so suppress them
    # once we've already emitted an Artículo heading in the same chunk.
    if not suppress_subsection:
        m = _RX_NUMBERED_SUBSECTION.match(p)
        if m:
            return [f"### {m.group(1)}. {m.group(2).strip()}"]

    if _RX_ARTICULOS_TRANS.match(p):
        return ["## Artículos transitorios"]

    m = _RX_ARTICULO_START.match(p)
    if m:
        num = m.group(1).strip()
        # Normalize BIS/TER suffix case for consistency
        num = re.sub(r"\b(BIS|TER|QU[ÁA]TER)\b", lambda mm: mm.group(1).lower(), num)
        body = m.group(2).strip()
        # Old codes like 1888 Código de Minería write "ART. 1.°" — the ordinal
        # symbol ends up captured as the body. Absorb it into the number.
        if re.fullmatch(r"[°ºo]", body):
            if not re.search(r"[°ºo]$", num):
                num = num + "°"
            body = ""
        out = [f"#### Artículo {num}"]
        if body:
            out.append(body)
        return out

    return [para]


# ---------------------------------------------------------------------------
# List markers within paragraphs
# ---------------------------------------------------------------------------

_LETTER_ITEM = re.compile(r"(?<=[\s.;:])\b([a-z])\)\s+", re.IGNORECASE)
_NUMBER_ITEM = re.compile(r"(?<=[\s.;:])\b(\d+)\.-\s+")


def _break_lists(paragraph: str) -> list[str]:
    """If a paragraph contains multiple lettered or numbered list items
    running together, split them into separate markdown bullet items."""
    letter_marks = list(_LETTER_ITEM.finditer(paragraph))
    number_marks = list(_NUMBER_ITEM.finditer(paragraph))

    # Require ≥3 markers — 2 alone too often gets triggered by stray dates
    # ("Núm. 1.- Santiago, 14 de Julio de 1970.-") or footnote-style references.
    marks = letter_marks if len(letter_marks) >= 3 else (number_marks if len(number_marks) >= 3 else [])
    if len(marks) < 3:
        return [paragraph]

    out: list[str] = []
    intro = paragraph[: marks[0].start()].strip()
    if intro:
        out.append(intro)
    for i, m in enumerate(marks):
        next_start = marks[i + 1].start() if i + 1 < len(marks) else len(paragraph)
        marker = m.group(0).strip()
        body = paragraph[m.end():next_start].strip()
        if body:
            out.append(f"- **{marker}** {body}")
    return out


# ---------------------------------------------------------------------------
# Top-level driver
# ---------------------------------------------------------------------------


def _walk_tree(items: Iterable, out: list[str], depth: int = 0) -> None:
    for item in items:
        if not isinstance(item, dict):
            continue
        t = item.get("t")
        if t:
            # Within one chunk, once an Artículo heading lands, suppress any
            # further subsection promotion — list items like "11. Las..."
            # inside an article body must stay as text, not headings.
            article_seen = False
            for para in _render_chunk(t):
                for sub in _maybe_promote_heading(
                    para, depth=depth, suppress_subsection=article_seen,
                ):
                    if sub.startswith("#### "):
                        article_seen = True
                    if sub.startswith(("#", ">", "- ")):
                        out.append(sub)
                    else:
                        out.extend(_break_lists(sub))
        children = item.get("h")
        if isinstance(children, list):
            _walk_tree(children, out, depth + 1)


def render(html_items: list) -> str:
    """Top-level: turn the BCN html tree into clean markdown."""
    paragraphs: list[str] = []
    _walk_tree(html_items, paragraphs)
    # Collapse adjacent identical paragraphs (some normas duplicate)
    deduped: list[str] = []
    last = None
    for p in paragraphs:
        if p != last:
            deduped.append(p)
        last = p
    return "\n\n".join(deduped).strip()


# ---------------------------------------------------------------------------
# CLI demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        print("usage: renderer_v2.py <path-to-version.json>", file=sys.stderr)
        sys.exit(2)
    d = json.load(open(path))
    print(render(d.get("html", [])))
