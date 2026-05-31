"""Typed data contracts for the ley-chile pipeline.

These models replace the implicit JSON shapes that the legacy scripts pass
between phases. They are pure value objects: no IO, no network, no git.

Reading legacy JSON into these models is done by ``scripts.legacy.adapters``.
Future phases write these models directly.

Validation philosophy: fail at the boundary (parse time), not deep in the
pipeline. A malformed cache file should raise ``SchemaError`` with the file
path and the offending field — not surface as a ``KeyError`` 200 commits
into a fast-import.
"""

from .errors import SchemaError
from .enums import CommitType, Scope, NormaTipo, Clasificacion
from .catalog import CatalogEntry, Catalog
from .graph import Vigencia, ModificadaPorEdge, NormaNode, NormaGraph
from .versions import (
    DiffPart,
    DiffPayload,
    VersionDiffEntry,
    NormaDiffSeries,
    NormaVersionSnapshot,
)
from .events import CauseKey, LawChangeSet, Publication

__all__ = [
    "SchemaError",
    "CommitType",
    "Scope",
    "NormaTipo",
    "Clasificacion",
    "CatalogEntry",
    "Catalog",
    "Vigencia",
    "ModificadaPorEdge",
    "NormaNode",
    "NormaGraph",
    "DiffPart",
    "DiffPayload",
    "VersionDiffEntry",
    "NormaDiffSeries",
    "NormaVersionSnapshot",
    "CauseKey",
    "LawChangeSet",
    "Publication",
]
