"""Article segmentation for Chilean legislative text.

Single source of truth: the frontend consumes pre-segmented articles from the
database and does not re-parse texto.md. The TypeScript twin in
web/src/lib/segment.ts exists only as the golden-test reference and is deleted
at cutover (Task 17).

Two source formats coexist in the corpus:
  - Post-renderer markdown (render_texto.py): `#### Artículo 5° bis` on its
    own line. This is what `historial` actually contains.
  - Legacy inline: `Artículo 5°.-` embedded in flowing prose.

If neither is present we yield one `__doc__` segment, so reconstruction stays
lossless even when the heuristic finds nothing.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass

__all__ = [
    "Segment", "normalize_label", "label_to_slug", "segment",
    "content_text", "canonical_text", "sha256_text",
]


@dataclass(frozen=True)
class Segment:
    label: str
    slug: str
    raw_heading: str
    body: str


_COMBINING = re.compile(r"[̀-ͯ]")
_ORDINAL = re.compile(r"[°º]")  # ° DEGREE, º MASCULINE ORDINAL


def normalize_label(s: str) -> str:
    """Normalize a label so different spellings of one article match.

    Ordinals are stripped BEFORE NFKD: 'º' (U+00BA) decomposes to 'o', so
    stripping afterwards would leave "articulo 1o" while "1°" yields
    "articulo 1" — one article, two identities. See spec §6.3.
    """
    s = _ORDINAL.sub("", s)
    s = s.lower()
    s = unicodedata.normalize("NFKD", s)
    s = _COMBINING.sub("", s)
    s = re.sub(r"\bart\.", "articulo", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def label_to_slug(label: str) -> str:
    if label == "__preamble__":
        return "preambulo"
    if label == "__doc__":
        return "doc"
    s = re.sub(r"^articulo\s+", "art-", label)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    s = re.sub(r"-+", "-", s)
    return re.sub(r"^-|-$", "", s)


_HEADING_RE = re.compile(
    r"(^|\s)(Art[íi]culo|Art\.)\s+"
    r"([0-9]+[°º]?(?:\s+(?:bis|ter|quater|qu[íi]nquies))?"
    r"|[úu]nico|primero|segundo|tercero|cuarto|quinto|sexto"
    r"|s[ée]ptimo|octavo|noveno|d[ée]cimo|transitorio|final)"
    r"(?:\s+transitori[ao])?\.?-",
    re.IGNORECASE,
)

# `\b` after `Art(?:ículo|\.)` means the `Art.` abbreviation can never match:
# '.' and the following space are both non-word. Preserved deliberately —
# render_texto.py:286 always emits `#### Artículo {num}`.
_MD_HEADING_RE = re.compile(
    r"^(#{2,4})\s+Art(?:[íi]culo|\.)\b\s+(\S[^\n]*?)\s*$",
    re.MULTILINE | re.IGNORECASE,
)


def _preamble_of(text: str, first_start: int) -> list[Segment]:
    pre = text[:first_start].strip()
    if not pre:
        return []
    return [Segment("__preamble__", label_to_slug("__preamble__"), "", pre)]


def _segment_md(text: str, matches: list[re.Match]) -> list[Segment]:
    out = _preamble_of(text, matches[0].start())
    for i, m in enumerate(matches):
        seg_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        identifier = (m.group(2) or "").strip()
        label = normalize_label(f"articulo {identifier}")
        out.append(Segment(
            label, label_to_slug(label),
            f"Artículo {identifier}",
            text[m.end():seg_end].strip(),
        ))
    return out


def _segment_inline(text: str, matches: list[re.Match]) -> list[Segment]:
    out = _preamble_of(text, matches[0].start())
    for i, m in enumerate(matches):
        lead = len(m.group(1) or "")
        start = m.start() + lead
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end]
        heading_len = len(m.group(0)) - lead
        identifier = (m.group(3) or "").strip()
        kind_raw = (m.group(2) or "Artículo").strip()
        kind = "articulo" if kind_raw.lower().startswith("art") else kind_raw
        label = normalize_label(f"{kind} {identifier}")
        out.append(Segment(
            label, label_to_slug(label),
            chunk[:heading_len].strip(),
            chunk[heading_len:].strip(),
        ))
    return out


def segment(text: str) -> list[Segment]:
    md = list(_MD_HEADING_RE.finditer(text))
    if md:
        return _segment_md(text, md)
    inline = list(_HEADING_RE.finditer(text))
    if not inline:
        return [Segment("__doc__", label_to_slug("__doc__"), "", text.strip())]
    return _segment_inline(text, inline)


def content_text(seg: Segment) -> str:
    """The canonical unit of one segment: heading and body, or body alone."""
    return f"{seg.raw_heading}\n{seg.body}" if seg.raw_heading else seg.body


def canonical_text(segs: list[Segment]) -> str:
    """Order-, heading- and body-sensitive; whitespace-insensitive.

    The validation gate (spec §8.1) hashes this, not the raw texto.md:
    segmentation strips bodies and rewrites headings, so byte-identity with
    the committed file is unachievable by construction.
    """
    return "\n\n".join(content_text(s) for s in segs)


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()
