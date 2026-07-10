"""Article dedup and validity-span coalescing.

Store each distinct article body once; store when it was in force. A version's
text is reconstructed by selecting the articles whose span contains the date.

Run identity is (slug, body_sha256, ord): a body that survives unchanged but
moves position must split its span, because `ord` determines reading order and
reading order is a property of the version, not of the article.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import groupby

from segment import Segment, segment, sha256_text

__all__ = [
    "VersionInput", "ArticleRow", "SpanRow", "build_articles_and_spans", "reconstruct",
]


@dataclass(frozen=True)
class VersionInput:
    desde: str            # YYYY-MM-DD
    hasta: str | None     # None = vigente
    texto: str


@dataclass(frozen=True)
class ArticleRow:
    id_norma: int
    slug: str
    label: str
    raw_heading: str
    body: str
    body_sha256: str


@dataclass(frozen=True)
class SpanRow:
    id_norma: int
    slug: str
    body_sha256: str
    desde: str
    hasta: str | None
    ord: int


def _contiguous_runs(indices: list[int]) -> list[list[int]]:
    """[0,1,3,4,5] -> [[0,1],[3,4,5]]"""
    runs: list[list[int]] = []
    for _, group in groupby(enumerate(sorted(indices)), key=lambda p: p[1] - p[0]):
        runs.append([i for _, i in group])
    return runs


def build_articles_and_spans(
    id_norma: int, versions: list[VersionInput]
) -> tuple[list[ArticleRow], list[SpanRow]]:
    ordered = sorted(versions, key=lambda v: v.desde)

    articles: dict[tuple[str, str], ArticleRow] = {}
    # (slug, body_sha256, ord) -> version indices where it appears at that position
    occurrences: dict[tuple[str, str, int], list[int]] = {}

    for i, v in enumerate(ordered):
        for position, seg in enumerate(segment(v.texto)):
            sha = sha256_text(seg.body)
            articles.setdefault(
                (seg.slug, sha),
                ArticleRow(id_norma, seg.slug, seg.label, seg.raw_heading, seg.body, sha),
            )
            occurrences.setdefault((seg.slug, sha, position), []).append(i)

    spans: list[SpanRow] = []
    for (slug, sha, position), idxs in occurrences.items():
        for run in _contiguous_runs(idxs):
            spans.append(SpanRow(
                id_norma=id_norma, slug=slug, body_sha256=sha,
                desde=ordered[run[0]].desde, hasta=ordered[run[-1]].hasta, ord=position,
            ))

    spans.sort(key=lambda s: (s.desde, s.ord))
    return list(articles.values()), spans


def _contains(span: SpanRow, fecha: str) -> bool:
    return span.desde <= fecha and (span.hasta is None or fecha <= span.hasta)


def reconstruct(
    articles: list[ArticleRow], spans: list[SpanRow], fecha: str
) -> list[Segment]:
    """Rebuild a version's segments as of `fecha`, in reading order."""
    by_key = {(a.slug, a.body_sha256): a for a in articles}
    live = sorted((s for s in spans if _contains(s, fecha)), key=lambda s: s.ord)
    return [
        Segment(
            label=by_key[(s.slug, s.body_sha256)].label,
            slug=s.slug,
            raw_heading=by_key[(s.slug, s.body_sha256)].raw_heading,
            body=by_key[(s.slug, s.body_sha256)].body,
        )
        for s in live
    ]
