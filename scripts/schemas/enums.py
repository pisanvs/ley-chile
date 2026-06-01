"""Enums for stringly-typed legacy fields.

Each enum keeps the legacy string values as the enum *value* so JSON
serialization is identical to today's hand-written strings. New code
should reference the enum members; the legacy adapters translate raw
strings into enum members at the boundary.
"""

from __future__ import annotations

from enum import Enum


class CommitType(str, Enum):
    """Conventional-commit-style ``tipo`` for a Publication."""

    FEAT = "feat"
    UPDATE = "update"
    DEROG = "derog"
    CHORE = "chore"

    @property
    def rank(self) -> int:
        """Stable ordering rank used as a sort tiebreaker.

        feat (new law) sorts before update (amendment) sorts before
        derog (repeal) sorts before chore (housekeeping). This matches
        the magic-number ``_rank`` field used by legacy CommitContext.
        """
        return _COMMIT_TYPE_RANK[self]


_COMMIT_TYPE_RANK: dict[CommitType, int] = {
    CommitType.FEAT: 0,
    CommitType.UPDATE: 1,
    CommitType.DEROG: 2,
    CommitType.CHORE: 3,
}


class Scope(str, Enum):
    """Conventional-commit-style ``scope`` for a Publication."""

    LEY = "ley"
    MODIFICACION = "modificacion"
    DL = "dl"
    DFL = "dfl"
    DTO = "dto"
    COD = "cod"
    OTRAS = "otras"


class NormaTipo(str, Enum):
    """LeyChile / BCN norma type codes seen in catalog + graph data."""

    LEY = "ley"
    DL = "dl"
    DFL = "dfl"
    DTO = "dto"
    COD = "cod"
    ACD = "acd"
    AA = "aa"
    OTRAS = "otras"

    @classmethod
    def parse(cls, raw: str | None) -> "NormaTipo":
        """Map a free-form tipo string (possibly empty) to a member.

        Unknown values collapse to OTRAS rather than raising — the
        upstream taxonomy is open, and refusing to ingest a norma
        because of a new tipo code is worse than parking it under OTRAS.
        """
        if not raw:
            return cls.LEY
        s = raw.strip().lower()
        for m in cls:
            if m.value == s:
                return m
        return cls.OTRAS


class Clasificacion(str, Enum):
    """Whether a law is substantive or only amends other laws."""

    SUSTANTIVA = "sustantiva"
    MODIFICATORIA = "modificatoria"
