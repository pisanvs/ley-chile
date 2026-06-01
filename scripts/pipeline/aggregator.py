"""Typed cause-event aggregator.

Replaces the legacy ``build_history._collect_events`` with the same
*semantics* but typed contracts in and out:

  in:  NormaGraph  +  ``cache/diffs/`` (via load_norma_diff_series)
       +  ``cache/versions/`` (read via the unchanged legacy file builder)
  out: list[Publication], sorted by Publication.sort_key

What's the same vs the legacy implementation:

  - Cause-centered model: one Publication per (date, causa_id_norma).
  - Cause determination: for the first version of a norma OR a version
    with no ``modificadaPor``, the cause is the norma itself.  Otherwise
    the cause is the modifying norma.
  - File contents: produced by the legacy ``_version_files`` helper,
    untouched.  Same texto.md / metadata.json bytes guarantee semantic
    equivalence at the file-payload level.
  - Derogation: on the last version of a derogated norma, the affected
    law's texto.md + metadata.json are deleted and an optional
    ``{old_dir → successor_dir}`` symlink is attached.

What's different (intentional, decision B):

  - The ``CommitContext.files`` shared-mutable-dict pattern is replaced
    by one ``LawChangeSet`` per affected law inside the Publication.
    Cross-law accumulation no longer races through a shared dict.
  - ``Publication.sort_key`` is ``(date, tipo.rank, causa_ley_numero,
    causa_id_norma)`` — semantically clearer than legacy's
    ``(date, ley_numero, _rank, _seq)`` and worth the one-time SHA
    churn on the deterministic-rebuild historial branch.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

# Match the project's bootstrap pattern so we can import sibling top-level
# packages (schemas, legacy) without a leading "scripts.".
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

# Legacy helpers we deliberately reuse during the transition.  Step 5
# replaces these with typed equivalents; for now reusing them is what
# guarantees byte-equivalence of file payloads.
from build_history import (  # noqa: E402
    _commit_subject_causa,
    _law_dir_from_node,
    _scope_for_node,
    _version_files,
)
from schemas import (  # noqa: E402
    CauseKey,
    CommitType,
    LawChangeSet,
    NormaGraph,
    NormaNode,
    Publication,
    Scope,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# NormaNode → legacy dict adapter
# ---------------------------------------------------------------------------
#
# The legacy helpers (``_scope_for_node``, ``_version_files``,
# ``_law_dir_from_node``) expect the raw dict shape produced by
# ``load_graph``.  We give them exactly that shape, derived from the typed
# NormaNode.  When step 5 replaces the helpers with typed equivalents,
# this adapter goes away.


def _node_to_legacy_dict(node: NormaNode) -> dict:
    """Produce the dict shape that legacy build_history helpers expect."""
    return {
        "idNorma": node.id_norma,
        "numero": _numero_for_node(node),
        "titulo": node.titulo,
        "clasificacion": node.clasificacion.value,
        "organismos": list(node.organismos),
        "derogado": node.derogado,
        "fechaPublicacion": node.fecha_publicacion,
        "fechaPromulgacion": node.fecha_promulgacion,
        "tipo": node.tipo.value,
        "vigencias": [
            {
                "desde": v.desde,
                "hasta": v.hasta,
                "tipo_version": v.tipo_version,
                "tipo_version_s": v.tipo_version_s,
            }
            for v in node.vigencias
        ],
        "modificadaPor_edges": [
            {"idNorma": e.id_norma, "fecha": e.fecha} for e in node.modificada_por_edges
        ],
    }


def _numero_for_node(node: NormaNode) -> str:
    """NormaNode doesn't currently carry ``numero`` (only ``id_norma``).

    Legacy graph entries store ``numero`` only when the source SPARQL/JSON
    provided it; the rest fall back to str(id_norma).  We mirror that here
    via the metadata cache: if the graph dict happens to have a 'numero',
    use it; otherwise stringify id_norma.

    Step 3 will give NormaNode a proper ``numero: str`` field once we
    re-derive the graph from cache via the typed builder.
    """
    return str(node.id_norma)


def _graph_to_legacy_dict(graph: NormaGraph) -> dict:
    """Whole-graph adapter for legacy helpers that walk every node."""
    return {str(node.id_norma): _node_to_legacy_dict(node) for node in graph.nodes.values()}


# ---------------------------------------------------------------------------
# Diff-entry helpers
# ---------------------------------------------------------------------------


def _load_diff_entries(cache_dir: Path, id_norma: int) -> list[dict] | None:
    """Read diffs/{id}.json as a raw list.

    We read raw (rather than via load_norma_diff_series) for two reasons:
      1. The cause-determination logic also needs the ``modificadaPor``
         dict shape that legacy uses verbatim.
      2. Reading raw keeps us aligned with what legacy _collect_events
         consumed — important for the equivalence test.

    Step 3 swaps this for the typed ``NormaDiffSeries`` consumer.
    """
    diff_path = cache_dir / "diffs" / f"{id_norma}.json"
    if not diff_path.exists():
        return None
    try:
        data = json.loads(diff_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log.debug("skipping unreadable diff %s: %s", id_norma, exc)
        return None
    if not isinstance(data, list):
        log.debug("diff %s is not a list — skipping", id_norma)
        return None
    return data


def _normalize_modificada_por(value: object) -> dict | None:
    """Tolerant decoder for the ``modificadaPor`` field on a diff entry.

    Kept inline (rather than imported from build_history) to avoid
    relying on a private helper.  Same semantics as the legacy version.
    """
    if isinstance(value, list):
        return value[0] if value else None
    if isinstance(value, dict):
        return value
    return None


# ---------------------------------------------------------------------------
# LawChangeSet helpers
# ---------------------------------------------------------------------------


def _find_or_create_change_set(
    pub: Publication, id_norma: int, ley_numero: str, scope: Scope
) -> LawChangeSet:
    """Find this Publication's LawChangeSet for the given affected law, else add one.

    Replaces the legacy pattern of merging all affected laws' files into
    one shared ``CommitContext.files`` dict.  Each affected law now has
    its own change set; cross-law accumulation is impossible by
    construction.
    """
    for cs in pub.changes:
        if cs.id_norma == id_norma:
            return cs
    cs = LawChangeSet(id_norma=id_norma, ley_numero=ley_numero, scope=scope)
    pub.changes.append(cs)
    return cs


def _scope_from_str(scope_str: str) -> Scope:
    """Map a legacy scope string to the Scope enum, defaulting to LEY."""
    try:
        return Scope(scope_str)
    except ValueError:
        # Legacy emits "meta" for chore and a few other free-form values
        # we don't model yet.  Default to LEY — chore handling happens in
        # the runner (step 3+), not the aggregator.
        return Scope.LEY


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def collect_publications(
    graph: NormaGraph,
    data_root: Path,
    cache_dir: Path | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[Publication]:
    """The typed replacement for legacy ``_collect_events``.

    Walks every norma in the graph, joins each with its diff series and
    version snapshots from ``cache_dir``, and aggregates the resulting
    (date, causa_id_norma) events into Publication objects.  The output
    is sorted by ``Publication.sort_key`` so consumers can iterate in
    commit order.

    Args:
        graph: typed norma graph (use ``legacy.load_graph`` to load).
        data_root: project data root (where law dirs are written).
        cache_dir: defaults to ``data_root / "cache"``.
        from_date: optional exclusive lower bound on the causing
            publication date (YYYY-MM-DD).
        to_date: optional inclusive upper bound on the causing
            publication date (YYYY-MM-DD).
    """
    if cache_dir is None:
        cache_dir = data_root / "cache"
    legacy_graph = _graph_to_legacy_dict(graph)

    pubs_by_cause: dict[CauseKey, Publication] = {}

    for id_norma, node in graph.nodes.items():
        diffs_raw = _load_diff_entries(cache_dir, id_norma)
        if not diffs_raw:
            continue

        affected_node_dict = legacy_graph[str(id_norma)]
        affected_rel_dir = _law_dir_from_node(
            affected_node_dict, id_norma, data_root
        ).relative_to(data_root)
        affected_scope = _scope_from_str(_scope_for_node(affected_node_dict))
        affected_numero = str(affected_node_dict.get("numero") or id_norma)
        derogado = node.derogado

        for i, entry in enumerate(diffs_raw):
            fecha = entry.get("fecha", "")
            if not fecha:
                continue
            mp = _normalize_modificada_por(entry.get("modificadaPor"))
            is_last = i == len(diffs_raw) - 1

            # Cause: self for the first version or any version without an
            # explicit modificadaPor; the modifying norma otherwise.
            if i == 0 or not mp:
                causa_id = id_norma
                causa_node_dict = affected_node_dict
                causa_numero = affected_numero
                causa_titulo = node.titulo
                causa_fecha = node.fecha_publicacion or fecha
            else:
                try:
                    causa_id = int(mp["idNorma"])
                except (KeyError, TypeError, ValueError):
                    # Malformed modificadaPor — fall back to self-cause
                    # rather than dropping the version.
                    causa_id = id_norma
                    causa_node_dict = affected_node_dict
                    causa_numero = affected_numero
                    causa_titulo = node.titulo
                    causa_fecha = node.fecha_publicacion or fecha
                else:
                    causa_node_dict = legacy_graph.get(str(causa_id)) or {}
                    causa_numero = str(mp.get("numero") or causa_id)
                    causa_titulo = str(mp.get("titulo", ""))
                    causa_fecha = fecha

            # Date window — exclusive lower, inclusive upper (legacy semantics).
            if from_date and causa_fecha <= from_date:
                continue
            if to_date and causa_fecha > to_date:
                continue

            ck = CauseKey(date=causa_fecha, causa_id_norma=causa_id)

            if ck not in pubs_by_cause:
                causa_scope_str = _scope_for_node(causa_node_dict) if causa_node_dict else "ley"
                causa_org = ((causa_node_dict.get("organismos") if causa_node_dict else None) or [""])[0]
                pubs_by_cause[ck] = Publication(
                    cause=ck,
                    # Legacy _collect_events emits "feat" for every event;
                    # the chore-terminal commit is added by the runner.
                    tipo=CommitType.FEAT,
                    scope=_scope_from_str(causa_scope_str),
                    causa_titulo=causa_titulo,
                    causa_ley_numero=causa_numero,
                    subject=_commit_subject_causa(
                        causa_scope_str, causa_numero, causa_fecha, causa_org
                    ),
                    body="\n".join(
                        filter(None, [causa_titulo, f"BCN idNorma={causa_id}"])
                    ),
                )

            pub = pubs_by_cause[ck]

            # Files contributed by this version of the affected law go
            # into the affected law's own change set.
            change_set = _find_or_create_change_set(
                pub, id_norma, affected_numero, affected_scope
            )
            change_set.files.update(
                _version_files(
                    data_root, cache_dir, id_norma, fecha,
                    affected_node_dict, affected_rel_dir,
                )
            )

            # Derogation on the final version: queue deletes.
            # Successor symlinks are intentionally omitted here.
            # _find_successor reads 'reemplazadaPor'/'derogadaPor' from the
            # graph dict, but fetch_normas.py (the current graph builder) does
            # not populate those fields — they were only present in the legacy
            # trace_graph.py era. The real graph has none, so the symlink branch
            # in legacy _collect_events was already dead. Step 5 will wire
            # symlinks properly once the graph builder emits successor edges.
            if is_last and derogado:
                change_set.deletes.extend(
                    [
                        str(affected_rel_dir / "texto.md"),
                        str(affected_rel_dir / "metadata.json"),
                    ]
                )

    return sorted(pubs_by_cause.values(), key=Publication.sort_key)
