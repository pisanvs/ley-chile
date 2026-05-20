"""
enrichers — post-processing enrichers for CommitContext objects.

Each enricher receives a CommitContext and may mutate its body or extra fields
with additional metadata (tramitación sessions, votaciones, etc.).

Usage::

    from enrichers import Enricher
    from enrichers.tramitacion import TramitacionEnricher

    enrichers = [TramitacionEnricher(data_root)]
    for ctx in contexts:
        for e in enrichers:
            e.enrich(ctx)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# CommitContext
# ---------------------------------------------------------------------------


@dataclass
class CommitContext:
    """All data needed to emit one git fast-import commit."""

    tipo: str          # "feat" | "update" | "derog" | "chore"
    scope: str         # "ley" | "modificacion" | "dl" | etc.
    ley_numero: str    # e.g. "20000"
    id_norma: int
    date: str          # YYYY-MM-DD
    titulo: str
    files: dict        # {git_path: bytes}
    deletes: list      # [git_path]
    symlinks: dict     # {git_path: target_str}
    subject: str       # commit message subject line
    body: str          # commit message body (multi-line OK)
    extra: dict = field(default_factory=dict)  # free-form for enrichers

    # Internal sequencing — used for tiebreaking sort within same date
    _seq: int = 0
    _rank: int = 0  # 0=feat, 1=update, 2=derog, 3=chore

    def sort_key(self) -> tuple:
        return (self.date, self.ley_numero, self._rank, self._seq)


# ---------------------------------------------------------------------------
# Base Enricher
# ---------------------------------------------------------------------------


class Enricher:
    """Base class. Subclasses override enrich(ctx)."""

    def enrich(self, ctx: CommitContext) -> None:
        """Mutate ctx.body or ctx.extra with additional data."""
        pass
