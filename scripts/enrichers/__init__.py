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

import sys
from pathlib import Path

# Ensure parent scripts/ directory is on the path so utils is importable
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import CommitContext  # noqa: E402 — re-exported for backward compat

__all__ = ["CommitContext", "Enricher"]


# ---------------------------------------------------------------------------
# Base Enricher
# ---------------------------------------------------------------------------


class Enricher:
    """Base class. Subclasses override enrich(ctx)."""

    def enrich(self, ctx: CommitContext) -> None:
        """Mutate ctx.body or ctx.extra with additional data."""
        pass
