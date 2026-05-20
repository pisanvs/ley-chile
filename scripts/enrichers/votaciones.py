"""
votaciones.py — Placeholder enricher for votación data.

Will read cache/tramitacion/ for voting record data when available.
"""

from __future__ import annotations

from enrichers import CommitContext, Enricher


class VotacionesEnricher(Enricher):
    """Placeholder — reads cache/tramitacion/ for votacion data."""

    def enrich(self, ctx: CommitContext) -> None:
        pass  # TODO: implement when voting data is available
