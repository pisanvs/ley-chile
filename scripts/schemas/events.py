"""Event-aggregation primitives that replace the legacy CommitContext.

The legacy ``CommitContext`` mixed three responsibilities:

  1. Event identity:        ``(date, ley_numero, id_norma, tipo, scope)``
  2. Accumulated filetree:  ``files``, ``deletes``, ``symlinks``
  3. Rendered commit text:  ``subject``, ``body``, ``extra``

That mix is why ``_collect_events`` had to key an ``events_by_cause`` dict
by ``(fecha, causa_id_str)`` and mutate ``ctx.files`` across affected
laws — a foot­gun behind the *one-commit-per-publication* invariant.

Here we split them. ``CauseKey`` is immutable; ``LawChangeSet`` is one
affected law's filetree edits; ``Publication`` is the rendered commit
with a list of change sets. Aggregation is done in
``scripts.pipeline.aggregator.CauseEventAggregator`` (built in step 3 of
the migration plan).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .enums import CommitType, Scope


@dataclass(frozen=True, slots=True, order=True)
class CauseKey:
    """Immutable identity of a single legislative publication event.

    Two affected-law records with the same ``CauseKey`` belong to the
    same git commit. Field order matches the desired sort order
    (date first, then publication identity) so ``sorted()`` works
    without a custom key.
    """

    date: str  # YYYY-MM-DD — the publishing norma's fechaPublicacion
    causa_id_norma: int  # the *causing* norma's idNorma (not the affected law's)


@dataclass(slots=True)
class LawChangeSet:
    """Filetree changes applied to ONE affected law as part of a Publication.

    Multiple ``LawChangeSet`` records compose into a single ``Publication``
    when their ``CauseKey``s match. Mutability is local to one law, so
    cross-law accumulation no longer races through a shared dict.
    """

    id_norma: int
    ley_numero: str
    scope: Scope
    files: dict[str, bytes] = field(default_factory=dict)
    deletes: list[str] = field(default_factory=list)
    symlinks: dict[str, str] = field(default_factory=dict)

    def is_empty(self) -> bool:
        return not (self.files or self.deletes or self.symlinks)


@dataclass(slots=True)
class Publication:
    """One git commit: the rendered output of aggregating change sets.

    ``tipo`` is derived from the *causing* norma (feat for a new
    sustantiva, update for a modificatoria, derog for a repeal, chore
    for housekeeping). ``scope`` is also the causing norma's. The
    change-set list holds every affected law in stable order.
    """

    cause: CauseKey
    tipo: CommitType
    scope: Scope
    causa_titulo: str
    causa_ley_numero: str
    subject: str
    body: str
    changes: list[LawChangeSet] = field(default_factory=list)
    extra: dict = field(default_factory=dict)  # enricher data, NOT rendered text

    def sort_key(self) -> tuple:
        """Total order across publications.

        date → tipo rank (feat < update < derog < chore) → ley_numero.
        Matches the intent of the legacy ``CommitContext.sort_key`` but
        derives rank from ``tipo`` instead of carrying a redundant
        ``_rank`` field.
        """
        return (self.cause.date, self.tipo.rank, self.causa_ley_numero, self.cause.causa_id_norma)

    @property
    def is_empty(self) -> bool:
        """A publication with no actual file changes — should be dropped."""
        return all(c.is_empty() for c in self.changes)
