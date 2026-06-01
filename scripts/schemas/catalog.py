"""Catalog: the BCN SPARQL projection of all norma IDs.

Legacy shape (catalog.json on the code branch)::

    {
      "entries": [{"idNorma": 1, "tipo": "acd", "fechaPublicacion": "1991-05-13"}, ...],
      "last_code": "...",
      "complete": true
    }

The new shape preserves the same fields but typed and immutable.
``last_code`` and ``complete`` are SPARQL resume-state, only meaningful
to ``build_catalog.py``; they are kept opaque here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from .enums import NormaTipo
from .errors import SchemaError


@dataclass(frozen=True, slots=True)
class CatalogEntry:
    """One row in the BCN catalog projection."""

    id_norma: int
    tipo: NormaTipo
    fecha_publicacion: str  # YYYY-MM-DD; SPARQL guarantees ISO format

    @classmethod
    def from_legacy(cls, raw: dict, *, source: str | None = None) -> "CatalogEntry":
        try:
            return cls(
                id_norma=int(raw["idNorma"]),
                tipo=NormaTipo.parse(raw.get("tipo")),
                fecha_publicacion=str(raw.get("fechaPublicacion", "")),
            )
        except (KeyError, TypeError, ValueError) as e:
            raise SchemaError(
                f"malformed catalog entry: {e}", source=source, field="entries[]"
            ) from e


@dataclass(slots=True)
class Catalog:
    """A snapshot of the BCN catalog plus its SPARQL resume state."""

    entries: list[CatalogEntry] = field(default_factory=list)
    last_code: str | None = None
    complete: bool = False

    def __len__(self) -> int:
        return len(self.entries)

    def ids(self) -> Iterable[int]:
        return (e.id_norma for e in self.entries)

    @classmethod
    def from_legacy(cls, raw: dict, *, source: str | None = None) -> "Catalog":
        if not isinstance(raw, dict):
            raise SchemaError(
                f"catalog must be an object, got {type(raw).__name__}", source=source
            )
        entries_raw = raw.get("entries")
        if not isinstance(entries_raw, list):
            raise SchemaError(
                "catalog 'entries' must be a list", source=source, field="entries"
            )
        return cls(
            entries=[CatalogEntry.from_legacy(e, source=source) for e in entries_raw],
            last_code=raw.get("last_code"),
            complete=bool(raw.get("complete", False)),
        )
