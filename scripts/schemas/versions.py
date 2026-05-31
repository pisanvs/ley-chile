"""Versions and per-version diffs.

Two distinct legacy shapes live here.

1. ``cache/diffs/{id}.json`` — a list, one entry per published version of
   that norma, with an optional diff against the previous version::

       [
         {"fecha": "1857-01-01", "tipo_version_s": "Texto Original", "diff": null},
         {
           "fecha": "1965-03-18",
           "tipo_version_s": "Intermedio",
           "diff": {
             "added":    [{"part_id": 8722402, "old": null, "new": "<html>..."}, ...],
             "modified": [{"part_id": ...,    "old": "...", "new": "..."}, ...],
             "removed":  [{"part_id": ...,    "old": "...", "new": null}, ...]
           }
         }, ...
       ]

   Wrapped as ``NormaDiffSeries(id_norma, entries=[VersionDiffEntry, ...])``.

2. ``cache/versions/{id}/{fecha}.json`` — the full LeyChile
   ``get_norma_json`` response for that version: ``html`` (nested
   article tree), ``metadatos`` block, plus ancillary arrays. We keep
   the raw payload accessible since rendering uses it whole; ``metadatos``
   is the only field we type strictly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .errors import SchemaError


@dataclass(frozen=True, slots=True)
class DiffPart:
    """One added / modified / removed article-part in a version diff."""

    part_id: int
    old: str | None
    new: str | None

    @classmethod
    def from_legacy(cls, raw: dict) -> "DiffPart":
        return cls(
            part_id=int(raw["part_id"]),
            old=raw.get("old"),
            new=raw.get("new"),
        )


@dataclass(slots=True)
class DiffPayload:
    """The three lists inside one version's ``diff`` field."""

    added: list[DiffPart] = field(default_factory=list)
    modified: list[DiffPart] = field(default_factory=list)
    removed: list[DiffPart] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not (self.added or self.modified or self.removed)

    @classmethod
    def from_legacy(cls, raw: dict | None) -> "DiffPayload | None":
        """Return ``None`` for the legacy ``"diff": null`` (original version)."""
        if raw is None:
            return None
        if not isinstance(raw, dict):
            raise SchemaError(
                f"diff payload must be an object or null, got {type(raw).__name__}",
                field="diff",
            )
        return cls(
            added=[DiffPart.from_legacy(p) for p in raw.get("added") or []],
            modified=[DiffPart.from_legacy(p) for p in raw.get("modified") or []],
            removed=[DiffPart.from_legacy(p) for p in raw.get("removed") or []],
        )


@dataclass(slots=True)
class VersionDiffEntry:
    """One published version of a norma: date, label, and optional diff."""

    fecha: str  # YYYY-MM-DD; the original version has the law's pub date
    tipo_version_s: str
    diff: DiffPayload | None  # None on the original (no predecessor to diff against)

    @classmethod
    def from_legacy(cls, raw: dict, *, source: str | None = None) -> "VersionDiffEntry":
        try:
            return cls(
                fecha=str(raw["fecha"]),
                tipo_version_s=str(raw.get("tipo_version_s", "")),
                diff=DiffPayload.from_legacy(raw.get("diff")),
            )
        except (KeyError, TypeError, ValueError) as e:
            raise SchemaError(
                f"malformed version diff entry: {e}",
                source=source,
                field=f"entry[{raw.get('fecha', '?')}]",
            ) from e


@dataclass(slots=True)
class NormaDiffSeries:
    """All version diffs for one norma, ordered by ``fecha`` ascending."""

    id_norma: int
    entries: list[VersionDiffEntry] = field(default_factory=list)

    @classmethod
    def from_legacy(
        cls, id_norma: int, raw: list, *, source: str | None = None
    ) -> "NormaDiffSeries":
        if not isinstance(raw, list):
            raise SchemaError(
                f"diff series must be a list, got {type(raw).__name__}",
                source=source,
            )
        return cls(
            id_norma=id_norma,
            entries=[VersionDiffEntry.from_legacy(e, source=source) for e in raw],
        )


# ---------------------------------------------------------------------------
# Full per-version snapshots (cache/versions/{id}/{fecha}.json)
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class NormaVersionSnapshot:
    """A full LeyChile ``get_norma_json`` response for one version date.

    The ``html`` tree, ``proyectos``, ``jurisprudencia`` etc. are kept
    as raw nested structures because the renderer consumes them whole.
    Only ``metadatos`` is strictly required for the pipeline.
    """

    id_norma: int
    fecha: str  # YYYY-MM-DD — the version date this snapshot represents
    html: list[Any] = field(default_factory=list)
    metadatos: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)  # everything else, lossless

    @classmethod
    def from_legacy(
        cls, id_norma: int, fecha: str, raw: dict, *, source: str | None = None
    ) -> "NormaVersionSnapshot":
        if not isinstance(raw, dict):
            raise SchemaError(
                f"version snapshot must be an object, got {type(raw).__name__}",
                source=source,
            )
        return cls(
            id_norma=id_norma,
            fecha=fecha,
            html=list(raw.get("html") or []),
            metadatos=dict(raw.get("metadatos") or {}),
            raw=raw,
        )
