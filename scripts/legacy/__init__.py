"""Read-only adapters from the legacy on-disk JSON shapes to typed schemas.

Existence rationale: months of polite rate-limited fetches against
LeyChile produced ``catalog.json``, ``graph_shards/*.json``, and the
``cache/`` tree. None of that data is shaped by the refactor — the cache
holds upstream payloads, so it survives any rewrite of our internal
model. The graph and catalog are ours but cheap to re-derive.

These adapters let the refactored pipeline read everything that's already
on disk, validate it through ``scripts.schemas``, and route it to the
new code paths without re-fetching anything.

Nothing here writes the legacy format back. Once the new pipeline is
trusted, this whole subpackage is removable in a single commit.
"""

from .adapters import (
    load_catalog,
    load_graph,
    load_norma_diff_series,
    load_norma_version_snapshot,
    load_norma_snapshot,
    iter_diff_series,
    iter_version_snapshots,
)

__all__ = [
    "load_catalog",
    "load_graph",
    "load_norma_diff_series",
    "load_norma_version_snapshot",
    "load_norma_snapshot",
    "iter_diff_series",
    "iter_version_snapshots",
]
