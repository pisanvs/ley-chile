"""Typed pipeline phases.

Replaces the legacy script-as-module entry points piece by piece.
Each module here owns one phase of the cause-centered build, consuming
typed schemas from ``scripts.schemas`` and emitting typed outputs.

Step 2: ``aggregator.collect_publications`` replaces the legacy
``build_history._collect_events``. The bridge in ``legacy_bridge`` lets
the unchanged ``_make_fast_import_stream`` consume our new Publications
during the transition.
"""

from .aggregator import collect_publications
from .legacy_bridge import publications_to_commit_contexts

__all__ = [
    "collect_publications",
    "publications_to_commit_contexts",
]
