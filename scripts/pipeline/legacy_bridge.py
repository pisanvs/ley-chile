"""Bridge from typed ``Publication`` → legacy ``CommitContext``.

Purpose: let the unchanged ``build_history._make_fast_import_stream``
consume Publication objects from the new aggregator without modification.
This is what makes step 2 a safe, isolated change — we replace
``_collect_events`` only and validate that the new aggregator produces
the same stream payloads, leaving the rendering path untouched.

Throwaway code.  Step 5 removes this entire module when the rendering
path also moves to typed I/O.

The mapping flattens each Publication's per-affected-law change sets
back into the legacy single-dict shape:

    Publication.changes = [LawChangeSet(...), LawChangeSet(...), ...]
       ↓ flatten ↓
    CommitContext.files    = union of all change_set.files
    CommitContext.deletes  = concatenation of all change_set.deletes
    CommitContext.symlinks = union of all change_set.symlinks

This is exactly what legacy ``_collect_events`` produced by mutating a
shared dict — so the unchanged fast-import writer cannot tell the
difference.

``_seq`` and ``_rank`` are reproduced because legacy ``sort_key()``
uses them.  The fast-import writer re-sorts before emission, so we
need them to be self-consistent within the bridge output.
"""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import CommitContext  # noqa: E402

from schemas import CommitType, Publication  # noqa: E402


_LEGACY_RANK_BY_TIPO: dict[CommitType, int] = {
    CommitType.FEAT: 0,
    CommitType.UPDATE: 1,
    CommitType.DEROG: 2,
    CommitType.CHORE: 3,
}


def publication_to_commit_context(pub: Publication, *, seq: int) -> CommitContext:
    """Flatten one Publication into a legacy CommitContext.

    Per-affected-law change sets are merged back into the legacy
    shared-dict shape.  ``seq`` is the 1-based ordinal we'd have
    assigned in legacy ``_collect_events`` (used as the sort tiebreaker).
    """
    files: dict[str, bytes] = {}
    deletes: list[str] = []
    symlinks: dict[str, str] = {}
    for cs in pub.changes:
        files.update(cs.files)
        deletes.extend(cs.deletes)
        symlinks.update(cs.symlinks)

    # The id_norma field on legacy CommitContext was set from causa_id_str
    # if numeric, else 0.  We have a typed int, so just pass it through.
    return CommitContext(
        tipo=pub.tipo.value,
        scope=pub.scope.value,
        ley_numero=pub.causa_ley_numero,
        id_norma=pub.cause.causa_id_norma,
        date=pub.cause.date,
        titulo=pub.causa_titulo,
        files=files,
        deletes=deletes,
        symlinks=symlinks,
        subject=pub.subject,
        body=pub.body,
        extra=dict(pub.extra),
        _seq=seq,
        _rank=_LEGACY_RANK_BY_TIPO.get(pub.tipo, 0),
    )


def publications_to_commit_contexts(pubs: list[Publication]) -> list[CommitContext]:
    """Bridge a sorted list of Publications to legacy CommitContexts.

    Sequence numbers are assigned in input order; callers should pass
    publications already sorted by ``Publication.sort_key`` so the
    resulting CommitContext.sort_key remains stable.
    """
    return [publication_to_commit_context(p, seq=i + 1) for i, p in enumerate(pubs)]
