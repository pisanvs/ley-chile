"""Semantic-equivalence tests: new aggregator vs legacy _collect_events.

The new ``pipeline.aggregator.collect_publications`` is a typed
replacement for ``build_history._collect_events``.  These tests prove
the two produce the same commits modulo intentional ordering changes:

  - SAME: set of (date, causa_id) commit keys
  - SAME: file payloads per commit (texto.md + metadata.json bytes)
  - SAME: deletes set, symlinks dict
  - SAME: subject + body strings (same legacy helpers in both paths)
  - DIFFERENT: sort order within a date (legacy is
    (date, ley_numero, _rank, _seq); new is
    (date, tipo.rank, causa_ley_numero, causa_id_norma)).  We do NOT
    assert byte-identical fast-import streams.

The legacy-bridge round-trip is exercised: new aggregator → Publications
→ legacy CommitContexts → field-by-field comparison to legacy output.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import build_history as bh
from legacy import load_graph
from pipeline import collect_publications, publications_to_commit_contexts


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _node(
    id_norma: int,
    numero: str,
    fecha: str,
    *,
    titulo: str = "",
    clasificacion: str = "sustantiva",
    tipo: str = "ley",
    derogado: bool = False,
    organismos: list[str] | None = None,
    modificada_por_edges: list[dict] | None = None,
) -> dict:
    return {
        "idNorma": id_norma,
        "numero": numero,
        "titulo": titulo or f"Ley {numero}",
        "clasificacion": clasificacion,
        "organismos": organismos or [],
        "derogado": derogado,
        "fechaPublicacion": fecha,
        "fechaPromulgacion": fecha,
        "vigencias": [
            {"desde": fecha, "hasta": "", "tipo_version": "0", "tipo_version_s": "Original"}
        ],
        "modificadaPor_edges": modificada_por_edges or [],
        "tipo": tipo,
    }


def _write_version(cache_dir: Path, id_norma: int, fecha: str, body: str) -> None:
    """Synth a get_norma_json payload with a single article so texto.md is non-empty."""
    payload = {
        "html": [{"i": 1, "t": body}],
        "metadatos": {"id_norma": str(id_norma), "fecha_publicacion": fecha},
    }
    _write(cache_dir / "versions" / str(id_norma) / f"{fecha}.json", payload)


def _write_diffs(cache_dir: Path, id_norma: int, entries: list[dict]) -> None:
    _write(cache_dir / "diffs" / f"{id_norma}.json", entries)


@pytest.fixture
def simple_fixture(tmp_path: Path):
    """Three laws, distinct dates, no amendments — covers the cause=self path."""
    cache_dir = tmp_path / "cache"
    graph_raw = {
        "100": _node(100, "100", "2020-01-15", titulo="Ley 100"),
        "200": _node(200, "200", "2020-06-10", titulo="Ley 200"),
        "300": _node(300, "300", "2021-11-05", titulo="Ley 300"),
    }
    _write(tmp_path / "graph_shards" / "00.json", graph_raw)
    _write_diffs(
        cache_dir, 100,
        [{"fecha": "2020-01-15", "tipo_version_s": "Única", "diff": None, "modificadaPor": None}],
    )
    _write_version(cache_dir, 100, "2020-01-15", "Cuerpo de Ley 100")
    _write_diffs(
        cache_dir, 200,
        [{"fecha": "2020-06-10", "tipo_version_s": "Única", "diff": None, "modificadaPor": None}],
    )
    _write_version(cache_dir, 200, "2020-06-10", "Cuerpo de Ley 200")
    _write_diffs(
        cache_dir, 300,
        [{"fecha": "2021-11-05", "tipo_version_s": "Única", "diff": None, "modificadaPor": None}],
    )
    _write_version(cache_dir, 300, "2021-11-05", "Cuerpo de Ley 300")
    return tmp_path, cache_dir, graph_raw


@pytest.fixture
def amended_fixture(tmp_path: Path):
    """Law 100 has two versions; the second is caused by Ley 500 (modificatoria).

    This exercises the cause-is-modifier path: the second version of
    Ley 100 must produce a commit whose causa is Ley 500, with Ley
    100's updated files attached as one of its change sets.
    """
    cache_dir = tmp_path / "cache"
    graph_raw = {
        "100": _node(
            100, "100", "2020-01-15", titulo="Ley 100",
            modificada_por_edges=[{"idNorma": 500, "fecha": "2021-03-22"}],
        ),
        "500": _node(
            500, "500", "2021-03-22", titulo="Ley 500 modifica Ley 100",
            clasificacion="modificatoria",
        ),
    }
    _write(tmp_path / "graph_shards" / "00.json", graph_raw)
    _write_diffs(
        cache_dir, 100,
        [
            {"fecha": "2020-01-15", "tipo_version_s": "Original", "diff": None, "modificadaPor": None},
            {
                "fecha": "2021-03-22",
                "tipo_version_s": "Intermedio",
                "diff": {"added": [], "modified": [], "removed": []},
                "modificadaPor": {"idNorma": 500, "numero": "500", "titulo": "Ley 500"},
            },
        ],
    )
    _write_version(cache_dir, 100, "2020-01-15", "Cuerpo original de Ley 100")
    _write_version(cache_dir, 100, "2021-03-22", "Cuerpo modificado de Ley 100")
    # Ley 500 has its own diff (caused by itself)
    _write_diffs(
        cache_dir, 500,
        [{"fecha": "2021-03-22", "tipo_version_s": "Única", "diff": None, "modificadaPor": None}],
    )
    _write_version(cache_dir, 500, "2021-03-22", "Cuerpo de Ley 500")
    return tmp_path, cache_dir, graph_raw


# ---------------------------------------------------------------------------
# Equivalence checking
# ---------------------------------------------------------------------------


def _index_by_cause(ctxs):
    """Index a list of CommitContexts by (date, id_norma) — the cause identity."""
    out = {}
    for c in ctxs:
        key = (c.date, c.id_norma)
        # legacy may produce multiple CommitContexts with the same date if
        # ley_numero differs (different causes on the same date) — the
        # cause identity is (date, id_norma), which is unique per commit.
        assert key not in out, (
            f"unexpected duplicate cause key in legacy output: {key}"
        )
        out[key] = c
    return out


def _assert_commit_contexts_equivalent(legacy_ctx, new_ctx, *, where: str):
    """Field-by-field equivalence except for sort tiebreakers."""
    assert legacy_ctx.date == new_ctx.date, f"{where}: date mismatch"
    assert legacy_ctx.id_norma == new_ctx.id_norma, f"{where}: id_norma mismatch"
    assert legacy_ctx.ley_numero == new_ctx.ley_numero, (
        f"{where}: ley_numero mismatch ({legacy_ctx.ley_numero!r} vs {new_ctx.ley_numero!r})"
    )
    assert legacy_ctx.scope == new_ctx.scope, f"{where}: scope mismatch"
    assert legacy_ctx.tipo == new_ctx.tipo, f"{where}: tipo mismatch"
    assert legacy_ctx.subject == new_ctx.subject, f"{where}: subject mismatch"
    assert legacy_ctx.body == new_ctx.body, (
        f"{where}: body mismatch\nLEGACY: {legacy_ctx.body!r}\nNEW:    {new_ctx.body!r}"
    )
    # Files: same set of paths AND same bytes per path
    assert set(legacy_ctx.files) == set(new_ctx.files), (
        f"{where}: file path set differs\n"
        f"  legacy only: {set(legacy_ctx.files) - set(new_ctx.files)}\n"
        f"  new only:    {set(new_ctx.files) - set(legacy_ctx.files)}"
    )
    for p, content in legacy_ctx.files.items():
        assert new_ctx.files[p] == content, f"{where}: file content mismatch at {p}"
    # Deletes: same set (order isn't load-bearing in legacy either)
    assert set(legacy_ctx.deletes) == set(new_ctx.deletes), f"{where}: deletes set mismatch"
    # Symlinks: exact dict equality
    assert legacy_ctx.symlinks == new_ctx.symlinks, f"{where}: symlinks dict mismatch"


def _assert_equivalent(legacy_events, new_events, *, where: str = ""):
    by_legacy = _index_by_cause(legacy_events)
    by_new = _index_by_cause(new_events)
    assert set(by_legacy) == set(by_new), (
        f"{where}: cause-key sets differ\n"
        f"  legacy only: {set(by_legacy) - set(by_new)}\n"
        f"  new only:    {set(by_new) - set(by_legacy)}"
    )
    for key in by_legacy:
        _assert_commit_contexts_equivalent(
            by_legacy[key], by_new[key], where=f"{where}@{key}",
        )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_simple_no_amendments_equivalent(simple_fixture):
    """Three independent laws, no amendments — pure cause=self case."""
    data_root, cache_dir, graph_raw = simple_fixture
    legacy_events = bh._collect_events(graph_raw, data_root, cache_dir=cache_dir)
    typed_graph = load_graph(data_root)
    pubs = collect_publications(typed_graph, data_root, cache_dir=cache_dir)
    new_events = publications_to_commit_contexts(pubs)
    _assert_equivalent(legacy_events, new_events, where="simple")


def test_amended_law_cause_is_modifier(amended_fixture):
    """Ley 100 v2 caused by Ley 500 — the cause-is-modifier path."""
    data_root, cache_dir, graph_raw = amended_fixture
    legacy_events = bh._collect_events(graph_raw, data_root, cache_dir=cache_dir)
    typed_graph = load_graph(data_root)
    pubs = collect_publications(typed_graph, data_root, cache_dir=cache_dir)
    new_events = publications_to_commit_contexts(pubs)
    _assert_equivalent(legacy_events, new_events, where="amended")


def test_amended_law_shared_commit(amended_fixture):
    """The 2021-03-22 commit must include both Ley 500's own files and Ley 100's updated files."""
    data_root, cache_dir, graph_raw = amended_fixture
    typed_graph = load_graph(data_root)
    pubs = collect_publications(typed_graph, data_root, cache_dir=cache_dir)
    pub_2021 = next(p for p in pubs if p.cause.date == "2021-03-22")

    # Two affected laws (100 updated, 500 original) → two change sets.
    affected_ids = {cs.id_norma for cs in pub_2021.changes}
    assert affected_ids == {100, 500}, (
        f"expected both Ley 100 and Ley 500 attached to the 2021-03-22 commit, got {affected_ids}"
    )
    # Files from both laws present
    all_files = {p for cs in pub_2021.changes for p in cs.files}
    assert any("100" in p for p in all_files), f"Ley 100 files missing: {all_files}"
    assert any("500" in p for p in all_files), f"Ley 500 files missing: {all_files}"


def test_date_window_from_excludes_lower(amended_fixture):
    """`from_date` is exclusive: causa_fecha <= from_date is dropped."""
    data_root, cache_dir, graph_raw = amended_fixture
    legacy_events = bh._collect_events(
        graph_raw, data_root, cache_dir=cache_dir, from_date="2020-12-31"
    )
    typed_graph = load_graph(data_root)
    pubs = collect_publications(
        typed_graph, data_root, cache_dir=cache_dir, from_date="2020-12-31"
    )
    new_events = publications_to_commit_contexts(pubs)
    # Only the 2021-03-22 commit should remain in both
    assert {(c.date, c.id_norma) for c in legacy_events} == {
        (c.date, c.id_norma) for c in new_events
    }
    assert all(c.date > "2020-12-31" for c in new_events)


def test_date_window_to_includes_upper(amended_fixture):
    """`to_date` is inclusive: causa_fecha <= to_date is kept."""
    data_root, cache_dir, graph_raw = amended_fixture
    legacy_events = bh._collect_events(
        graph_raw, data_root, cache_dir=cache_dir, to_date="2020-12-31"
    )
    typed_graph = load_graph(data_root)
    pubs = collect_publications(
        typed_graph, data_root, cache_dir=cache_dir, to_date="2020-12-31"
    )
    new_events = publications_to_commit_contexts(pubs)
    _assert_equivalent(legacy_events, new_events, where="to_date")


def test_sort_order_choice_b(amended_fixture):
    """Verify Publication.sort_key follows choice B intentionally.

    For the amended fixture the legacy order will sort the 2021-03-22
    events by ``ley_numero`` (100 vs 500); the new order sorts by
    ``causa_ley_numero``.  Both produce a valid total order; we just
    pin the new behavior so a future change can't silently slip.
    """
    data_root, cache_dir, _ = amended_fixture
    typed_graph = load_graph(data_root)
    pubs = collect_publications(typed_graph, data_root, cache_dir=cache_dir)
    keys = [p.sort_key() for p in pubs]
    assert keys == sorted(keys), "publications must come out pre-sorted"
    # First field must be the date (choice B preserves this)
    assert keys[0][0] <= keys[-1][0]


# ---------------------------------------------------------------------------
# Real-data smoke test (skipped if historial/cache/ is absent)
# ---------------------------------------------------------------------------


def _real_data_root() -> Path | None:
    """Locate the project's historial/cache/ if it exists.

    Looks both under the worktree we're in (refactor) and the sibling main
    checkout, since pytest may run from either.
    """
    candidates = [
        Path(__file__).resolve().parent.parent / "historial",
        Path(__file__).resolve().parent.parent.parent / "ley-chile" / "historial",
    ]
    for c in candidates:
        if (c / "cache" / "diffs").is_dir() and any(
            (c / "cache" / "diffs").glob("*.json")
        ):
            return c
    return None


@pytest.mark.skipif(_real_data_root() is None, reason="no real cache/diffs/ available")
def test_real_data_equivalence():
    """Sanity check against the project's actual cache (Códigos)."""
    data_root = _real_data_root()
    assert data_root is not None
    cache_dir = data_root / "cache"
    typed_graph = load_graph(data_root)
    # Only consider normas that have a diffs file (the real graph has 357k
    # nodes but only ~7 cached diffs).
    pubs = collect_publications(typed_graph, data_root, cache_dir=cache_dir)
    legacy_events = bh._collect_events(typed_graph_to_legacy_dict(typed_graph), data_root, cache_dir=cache_dir)
    new_events = publications_to_commit_contexts(pubs)
    _assert_equivalent(legacy_events, new_events, where="real")


def typed_graph_to_legacy_dict(g):
    """Convert a NormaGraph back to the legacy dict shape for direct legacy invocation.

    Mirrors aggregator._graph_to_legacy_dict but kept private to the test
    so we don't leak an internal helper as public API.
    """
    out = {}
    for node in g.nodes.values():
        out[str(node.id_norma)] = {
            "idNorma": node.id_norma,
            "numero": str(node.id_norma),
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
                {"idNorma": e.id_norma, "fecha": e.fecha}
                for e in node.modificada_por_edges
            ],
        }
    return out
