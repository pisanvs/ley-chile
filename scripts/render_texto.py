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

import collections
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
_RX_ARTICULOS_TRANS = re.compile(r"^Art[íi]culos?\s+transitorios$|^Artículos\s+transitorio$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Article headings from the `estructura` tree
# ---------------------------------------------------------------------------
#
# get_norma_json returns an `estructura` outline next to `html`. Its nodes
# carry the same `i` as the html items, a name `n` ("Artículo 16 B",
# "Artículo 1 Transitorio", "Artículo 152 quinquies A") and a type `t`
# (0 Libro, 1 Título, 4 Párrafo, 5 Capítulo, 6 Artículo, None for
# Encabezado/Promulgación/Anexo). Each article is its own node, so the
# heading comes from the name instead of being guessed from the text — the
# regex lost letter suffixes ("16 A".."16 E" all became "Artículo 16"),
# lost "transitorio" when the text omits it, and promoted articles quoted
# inside amending laws.

_TIPO_ARTICULO = 6
_TIPO_DOBLE_ARTICULADO = 13
_RX_NODE_ARTICULO = re.compile(r"^(?:Art[íi]culo|ART[ÍI]CULO|Art\.|ART\.)\s*(.*)$")
# Codes that embed other laws name the nested articles "Artículo 79 (DEL
# ART. 8)"; the qualifier is what keeps them apart from the code's own 79.
_RX_NODE_QUALIFIER = re.compile(r"\((?:DEL?\s+)?ART[ÍI]?(?:CULO)?\.?\s*([^)]*)\)", re.IGNORECASE)
# Spelled ordinals, incl. 19th-century spellings (sétimo, sesto, nono) and
# one-word compounds (decimoquinto, vigesimoprimero, undécimo).
_ORDINAL = (
    r"[a-záéíóú]*(?:primero|segundo|tercero|cuarto|quinto|se[xs]to|s[ée]p?timo|octavo"
    r"|noveno|nono|d[ée]cimo|[ée]simo)"
)
_RX_ID_FIRST = re.compile(
    rf"^(?:\d+(?:-\d+)*[ºo°]?|[úu]nico|transitorio|final|{_ORDINAL}"
    r"|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez"
    r"|(?-i:[IVXL]{1,7}))$",
    re.IGNORECASE,
)
# Two-word compounds: "vigésimo primero" is one identifier, not "vigésimo".
_RX_ORDINAL_TENS = re.compile(
    r"^(?:d[ée]cimo|vig[ée]simo|trig[ée]simo|cuadrag[ée]simo|quincuag[ée]simo)$", re.IGNORECASE,
)
_RX_ORDINAL_UNIT = re.compile(
    r"^(?:primero|segundo|tercero|cuarto|quinto|se[xs]to|s[ée]p?timo|octavo|noveno|nono)$",
    re.IGNORECASE,
)
_ID_WORDS = r"bis|ter|qu[áa]ter|quinquies|sexies|septies|octies|novies|nonies|decies"
_RX_ID_WORD = re.compile(rf"^(?:{_ID_WORDS}|transitori[oa])$", re.IGNORECASE)
# Suffixes the text has beyond the node name (the tree has typos like
# "Artículo 49 QUÁRTER"). A capital counts only when the heading delimiter
# or another suffix follows, so "Artículo 12 A los efectos" keeps its body.
_LABEL_EXTRA = (
    rf"(?P<extra>(?:\s*-?\s*(?:(?:{_ID_WORDS}|transitori[oa])(?!\w)"
    rf"|(?-i:[A-ZÑ]{{1,2}})(?=\s*(?:[.\-—–:]|(?:{_ID_WORDS})(?!\w)))))*)"
)
# A letter suffix ("A", "Ñ", "AA") stays uppercase; words ("BIS",
# "Transitorio", "QUINTO") are lowercased like the regex path did for BIS/TER.
_RX_LETTER_SUFFIX = re.compile(r"^[A-ZÑ]{1,2}$")


def _node_index(estructura: list | None) -> dict:
    index: dict = {}
    stack = list(estructura or [])
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            if node.get("i") is not None:
                index[node["i"]] = node
            stack.extend(node.get("h") or [])
    return index


def _article_id(node: dict) -> tuple[list[str], str] | None:
    """Identifier tokens and qualifier of an article node.

    "Artículo 16 B"                      -> (["16", "B"], "")
    "Artículo 4 (DEL ART. 1) Transitorio" -> (["4", "transitorio"], "(art. 1)")
    "Artículo 5 CUMPLIMIENTO DE LOS ..."  -> (["5"], "")   epigraph dropped
    "Artículo"                            -> None          regex fallback
    """
    m = _RX_NODE_ARTICULO.match(re.sub(r"\s+", " ", (node.get("n") or "").strip()))
    if not m:
        return None
    rest = m.group(1)
    qualifier = ""
    q = _RX_NODE_QUALIFIER.search(rest)
    if q:
        qualifier = f"(art. {q.group(1).strip()})"
        rest = rest[:q.start()] + " " + rest[q.end():]
    # "211-A" is 211 + A, but "225-2" (Código Civil) is one number.
    rest = re.sub(r"\s*-\s*", "-", rest.strip(" .:—"))
    raw = [tok for tok in re.split(r"\s+|-(?=[^\d])", rest) if tok.strip("-")]
    if not raw or not _RX_ID_FIRST.match(raw[0]):
        return None
    if len(raw) > 1 and _RX_ORDINAL_TENS.match(raw[0]) and _RX_ORDINAL_UNIT.match(raw[1]):
        raw[:2] = [f"{raw[0]} {raw[1]}"]
    first = raw[0] if re.fullmatch(r"[IVXL]+", raw[0]) else raw[0].lower()
    tokens = [first]
    letters = 0
    for tok in raw[1:]:
        if tok.lower() == tokens[-1].lower():
            continue  # "Artículo 1 TRANSITORIO Transitorio"
        if _RX_ID_WORD.match(tok) or (tok.isdigit() and _RX_ID_WORD.match(tokens[-1])):
            tokens.append(tok.lower())  # "Artículo 129 BIS 17" (Código de Aguas)
        elif _RX_LETTER_SUFFIX.match(tok):
            tokens.append(tok)
            letters += 1
        elif re.fullmatch(r"[a-zñ]\)", tok, re.IGNORECASE):
            tokens.append(tok.lower())  # Código Penal "Artículo 483 a)"
        else:
            # An epigraph follows ("Artículo 2 DE LA LEY ..."): capitals right
            # before it are its first words, not suffixes.
            while letters and _RX_LETTER_SUFFIX.match(tokens[-1]):
                tokens.pop()
                letters -= 1
            break
    return tokens, qualifier


_ACCENT_CLASSES = {"a": "[aá]", "e": "[eé]", "i": "[ií]", "o": "[oó]", "u": "[uú]"}


def _loose(tok: str) -> str:
    """Regex for a token that ignores accents ("unico" matches "único")."""
    return "".join(
        r"\s*-\s*" if c == "-" else r"\s*" if c == " " else _ACCENT_CLASSES.get(c, re.escape(c))
        for c in tok.lower()
    )


def _strip_article_label(para: str, tokens: list[str]) -> tuple[str, list[str]] | None:
    """Cut the article label off the first paragraph of an article.

    Returns (body, heading tokens) or None when the paragraph doesn't start
    with the label. Heading tokens use the text's spelling ("único",
    "quáter", "1º") where it matches the node, and the node's for the rest.
    Tries the full identifier first, then drops trailing tokens: transitory
    articles are named "Artículo 1 Transitorio" but the text often says
    just "Artículo 1º.-".
    """
    p = re.sub(r'^["“”«»‚‹›\s]+', "", para)
    sep = r"\s*[ºo°]?\.?\s*-?\s*"
    for k in range(len(tokens), 0, -1):
        ident = f"(?P<t0>{_loose(tokens[0])})" + r"(?P<ord>\.?[ºo°]|\s*[º°])?" + "".join(
            f"{sep}(?P<t{n}>{_loose(tok)})" for n, tok in enumerate(tokens[1:k], 1)
        )
        rx = (
            r"^(?:Art[íi]culo|ART[ÍI]CULO|Art\.|ART\.)\s*" + ident
            + r"(?:\.?\s*[ºo°])?(?!\w)" + _LABEL_EXTRA + r"[\s.\-—–:]*"
        )
        m = re.match(rx, p, re.IGNORECASE)
        if m:
            heading = [
                tok if _RX_LETTER_SUFFIX.match(tok) or re.fullmatch(r"[IVXL]+", tok)
                else m.group(f"t{n}").lower()
                for n, tok in enumerate(tokens[:k])
            ]
            heading += [
                tok if _RX_LETTER_SUFFIX.match(tok) else tok.lower()
                for tok in re.split(r"[\s\-]+", m.group("extra")) if tok
            ]
            heading += [tok for tok in tokens[k:] if tok.lower() not in heading]
            # "1o" is an ordinal like "1º"; spelled with o it would also
            # change the article's slug (art-1o).
            heading[0] += (m.group("ord") or "").strip(" .").replace("o", "º").replace("O", "º")
            return p[m.end():].strip(), heading
    return None


def _maybe_promote_heading(
    para: str,
    depth: int = 0,
    suppress_subsection: bool = False,
    allow_articulo: bool = True,
) -> list[str]:
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

    m = _RX_ARTICULO_START.match(p) if allow_articulo else None
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


def _emit(
    paras: Iterable[str],
    out: list[str],
    depth: int,
    article_seen: bool = False,
    allow_articulo: bool = True,
) -> None:
    # Within one chunk, once an Artículo heading lands, suppress any
    # further subsection promotion — list items like "11. Las..."
    # inside an article body must stay as text, not headings.
    for para in paras:
        for sub in _maybe_promote_heading(
            para, depth=depth, suppress_subsection=article_seen,
            allow_articulo=allow_articulo,
        ):
            if sub.startswith("#### "):
                article_seen = True
            if sub.startswith(("#", ">", "- ")):
                out.append(sub)
            else:
                out.extend(_break_lists(sub))


# An article that holds a whole articulated text (Plan Regulador de
# Tocopilla: "Artículo 2°.- El texto de la Ordenanza ... es el siguiente:"
# then "ARTICULO 1." .. "ARTICULO 24."). LeyChile sometimes tags this as
# "Doble Articulado" in the tree, often not. In the text it is a run of
# unquoted labels counting up from 1; articles quoted by an amending law are
# in quotes and jump around ("Artículo 15", "Artículo 16").
_RX_QUOTED = re.compile(r'^["“”«»‚‹›]')
_MIN_EMBEDDED = 3


def _embedded_articles(paras: list[str]) -> set[int]:
    """Indices of paras that start the articles of an embedded text."""
    starts, last = [], 0
    for n, para in enumerate(paras):
        m = _RX_ARTICULO_START.match(para)
        if not m:
            continue
        base = re.match(r"\d+", m.group(1))
        if _RX_QUOTED.match(para) or not base:
            return set()
        num = int(base.group())
        if num not in (last, last + 1) or (not starts and num != 1):
            return set()
        starts.append(n)
        last = num
    return set(starts) if len(starts) >= _MIN_EMBEDDED else set()


def _emit_article(
    paras: list[str], tokens: list[str], qualifier: str, out: list[str], depth: int,
) -> None:
    heading = tokens
    if paras:
        stripped = _strip_article_label(paras[0], tokens)
        if stripped is not None:
            body, heading = stripped
            paras = ([body] if body else []) + paras[1:]
        else:
            # Label spelled differently from the node name: let the regex
            # find where the body starts, but keep the node's identifier.
            m = _RX_ARTICULO_START.match(re.sub(r'^["“”«»‚‹›\s]+', "", paras[0]))
            if m:
                paras = ([m.group(2).strip()] if m.group(2).strip() else []) + paras[1:]
    out.append(" ".join(["#### Artículo", *heading] + ([qualifier] if qualifier else [])))
    embedded = _embedded_articles(paras)
    if not embedded:
        # Anything shaped like an article heading inside the body is quoted
        # text (amending laws), since every real article is its own node.
        _emit(paras, out, depth, article_seen=True, allow_articulo=False)
        return
    # Inner articles are qualified with the outer one, like LeyChile's
    # nested-law names ("DEL ART. 2"), so they don't collide with it.
    inner_q = f"(art. {' '.join(tokens)})"
    for n, para in enumerate(paras):
        if n in embedded:
            head, *body = _maybe_promote_heading(para)
            out.append(f"{head} {inner_q}")
            _emit(body, out, depth, article_seen=True, allow_articulo=False)
        else:
            _emit([para], out, depth, article_seen=True, allow_articulo=False)


def _doble_articulado(estructura: list | None) -> dict:
    """Inner article id -> outer article tokens, for articles LeyChile tags
    as "Doble Articulado" (a type-13 node under an article)."""
    inner: dict = {}

    def walk(items, article, outer_tokens):
        for node in items or []:
            if not isinstance(node, dict):
                continue
            kind = node.get("t")
            if kind == _TIPO_ARTICULO:
                if outer_tokens and node.get("i") is not None:
                    inner[node["i"]] = outer_tokens
                walk(node.get("h"), node, None)
            elif kind == _TIPO_DOBLE_ARTICULADO and article is not None:
                art_id = _article_id(article)
                walk(node.get("h"), article, art_id[0] if art_id else None)
            else:
                walk(node.get("h"), article, outer_tokens)

    walk(estructura, None, None)
    return inner


def _article_ids(nodes: dict, estructura: list | None = None) -> dict:
    """Article identifier per html item id, with nested-law qualifiers only
    where needed: the largest group (the code itself, e.g. the Código Civil
    inside art. 2 of its DFL) stays bare, and other groups keep "(art. N)"
    only when the bare heading would collide. Doble Articulado inner
    articles that collide carry their outer article."""
    ids = {}
    for i, node in nodes.items():
        if node.get("t") == _TIPO_ARTICULO:
            art_id = _article_id(node)
            if art_id:
                ids[i] = art_id
    if not ids:
        return ids
    main_q = collections.Counter(q for _, q in ids.values()).most_common(1)[0][0]
    bare = collections.Counter(tuple(t) for t, _ in ids.values())
    out = {
        i: (t, "" if q == main_q or bare[tuple(t)] == 1 else q)
        for i, (t, q) in ids.items()
    }
    # The tree adds "Transitorio" to some names only ("Artículo DECIMOQUINTO
    # Transitorio" after a plain "DECIMOCUARTO" in Ley 20.529). Keep it, for
    # the whole group, only where it tells transitorios from permanent
    # articles with the same number (LGE "Artículo 1" / "1 Transitorio").
    trans = [i for i, (t, _) in out.items() if len(t) > 1 and t[-1] == "transitorio"]
    permanent = {tuple(t) for t, _ in out.values() if t[-1] != "transitorio"}
    if trans and not any(tuple(out[i][0][:-1]) in permanent for i in trans):
        for i in trans:
            out[i] = (out[i][0][:-1], out[i][1])
    for i, outer in _doble_articulado(estructura).items():
        t, q = ids.get(i, (None, None))
        if t is None or out[i][1] or bare[tuple(t)] == 1 or (main_q and q == main_q):
            continue  # unique, already qualified, or the embedded code itself
        out[i] = (t, f"(art. {' '.join(outer)})")
    return out


def _walk_tree(
    items: Iterable,
    out: list[str],
    depth: int = 0,
    nodes: dict | None = None,
    art_ids: dict | None = None,
) -> None:
    for item in items:
        if not isinstance(item, dict):
            continue
        t = item.get("t")
        node = nodes.get(item.get("i")) if nodes else None
        if t:
            paras = _render_chunk(t)
            art_id = (art_ids or {}).get(item.get("i"))
            if art_id and paras:
                _emit_article(paras, *art_id, out, depth)
            else:
                # Without a usable article node (no estructura, or a bare
                # "Artículo" name) the regex is all we have. Annexes (an
                # ordinance, a treaty) have articles the tree doesn't list.
                # Any other node is not an article, so nothing in it becomes one.
                allow = (
                    node is None
                    or node.get("t") == _TIPO_ARTICULO
                    or (node.get("n") or "").strip().lower().startswith("anexo")
                )
                _emit(paras, out, depth, allow_articulo=allow)
        children = item.get("h")
        if isinstance(children, list):
            _walk_tree(children, out, depth + 1, nodes, art_ids)


def render(html_items: list, estructura: list | None = None) -> str:
    """Top-level: turn the BCN html tree into clean markdown.

    Pass the response's ``estructura`` to take article headings from it;
    without it, headings are detected by regex.
    """
    paragraphs: list[str] = []
    nodes = _node_index(estructura)
    _walk_tree(html_items, paragraphs, nodes=nodes, art_ids=_article_ids(nodes, estructura))
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
    print(render(d.get("html", []), d.get("estructura")))
