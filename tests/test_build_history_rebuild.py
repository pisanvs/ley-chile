"""Tests for build_history.py --rebuild mode.

The --rebuild mode treats the historial branch as a *generated artifact* fully
derivable from the diffs cache.  Key invariants:

  1. The generated fast-import stream begins with a `reset refs/heads/historial`
     so the new branch atomically replaces whatever was there before.
  2. Given identical input, the stream is byte-for-byte identical
     (deterministic — no implicit time.now() or randomness in commit metadata).
  3. All collected events are sorted by date so commits walk forward in time.
  4. The branch tip is set via `from :<mark>` to the last commit's mark.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_history as bh
from utils import CommitContext  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures: tiny synthetic graph + diffs cache
# ---------------------------------------------------------------------------

def _node(numero: str, fecha: str, *, vigencias: list[str] | None = None) -> dict:
    """Build a graph node for a sustantiva Ley."""
    vigencias = vigencias or [fecha]
    return {
        "numero": numero,
        "fechaPublicacion": fecha,
        "titulo": f"Ley {numero}",
        "tipo": "Ley",
        "clasificacion": "sustantiva",
        "organismos": [],
        "vigencias": [{"desde": v} for v in vigencias],
        "derogado": False,
        "modificadaPor_edges": [],
    }


def _write_diffs(cache_dir: Path, id_norma: int, fechas: list[str]) -> None:
    """Write a diffs file (one entry per fecha, no modificadaPor)."""
    diffs_dir = cache_dir / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    entries = [
        {"fecha": f, "modificadaPor": None, "diff": None, "tipo_version_s": "Única"}
        for f in fechas
    ]
    (diffs_dir / f"{id_norma}.json").write_text(json.dumps(entries), encoding="utf-8")


def _write_version(cache_dir: Path, id_norma: int, fecha: str, body: str = "x") -> None:
    """Write a versioned norma JSON so _version_files has texto.md content."""
    ver_dir = cache_dir / "versions" / str(id_norma)
    ver_dir.mkdir(parents=True, exist_ok=True)
    payload = {"html": [{"i": 1, "t": body}]}
    (ver_dir / f"{fecha}.json").write_text(json.dumps(payload), encoding="utf-8")


@pytest.fixture
def synthetic_cache(tmp_path):
    """3 normas, 5 total events spread across distinct dates."""
    cache_dir = tmp_path / "cache"
    graph = {
        "100": _node("100", "2020-01-15"),
        "200": _node("200", "2020-06-10", vigencias=["2020-06-10", "2021-03-22"]),
        "300": _node("300", "2021-11-05"),
    }
    _write_diffs(cache_dir, 100, ["2020-01-15"])
    _write_version(cache_dir, 100, "2020-01-15", "Cuerpo Ley 100")
    _write_diffs(cache_dir, 200, ["2020-06-10", "2021-03-22"])
    _write_version(cache_dir, 200, "2020-06-10", "Cuerpo Ley 200 v1")
    _write_version(cache_dir, 200, "2021-03-22", "Cuerpo Ley 200 v2")
    _write_diffs(cache_dir, 300, ["2021-11-05"])
    _write_version(cache_dir, 300, "2021-11-05", "Cuerpo Ley 300")
    return graph, cache_dir, tmp_path


# ---------------------------------------------------------------------------
# Invariant 1: rebuild stream starts with reset, no prior parent
# ---------------------------------------------------------------------------

def test_rebuild_stream_starts_with_reset(synthetic_cache):
    """--rebuild mode must emit `reset refs/heads/historial` so the new branch
    atomically replaces whatever was there, with no parent inheritance."""
    graph, cache_dir, data_root = synthetic_cache
    events = bh._collect_events(graph, data_root, cache_dir=cache_dir)
    events_sorted = sorted(events, key=lambda e: e.sort_key())

    stream = bh._make_fast_import_stream(events_sorted, append=False, rebuild=True)
    head = stream[:200].decode("utf-8", errors="replace")
    assert head.startswith("reset refs/heads/historial\n"), (
        f"rebuild stream must start with a branch reset; got: {head!r}"
    )
    # No `from refs/heads/historial` inheritance anywhere — rebuild ignores the prior branch
    assert b"from refs/heads/historial" not in stream, (
        "rebuild stream must not inherit from the existing historial branch"
    )


# ---------------------------------------------------------------------------
# Invariant 2: deterministic — same input → identical bytes
# ---------------------------------------------------------------------------

def test_rebuild_stream_is_deterministic(synthetic_cache):
    """Two rebuilds over the same cache must produce byte-identical streams."""
    graph, cache_dir, data_root = synthetic_cache
    events_a = bh._collect_events(graph, data_root, cache_dir=cache_dir)
    events_b = bh._collect_events(graph, data_root, cache_dir=cache_dir)
    stream_a = bh._make_fast_import_stream(
        sorted(events_a, key=lambda e: e.sort_key()), append=False, rebuild=True
    )
    stream_b = bh._make_fast_import_stream(
        sorted(events_b, key=lambda e: e.sort_key()), append=False, rebuild=True
    )
    assert stream_a == stream_b, "rebuild stream must be deterministic"


# ---------------------------------------------------------------------------
# Invariant 3: commits emitted in date-ascending order
# ---------------------------------------------------------------------------

def test_rebuild_commits_are_date_ordered(synthetic_cache):
    """Commit `committer` timestamps in the stream must be monotonically
    non-decreasing — history walks forward in time, like real legislation."""
    graph, cache_dir, data_root = synthetic_cache
    events = bh._collect_events(graph, data_root, cache_dir=cache_dir)
    events_sorted = sorted(events, key=lambda e: e.sort_key())
    stream = bh._make_fast_import_stream(events_sorted, append=False, rebuild=True)

    # fast-import committer lines: "committer Name <email> <ts> +0000"
    import re
    timestamps = [int(m.group(1)) for m in re.finditer(rb"committer .+? <[^>]+> (\d+) ", stream)]
    assert timestamps, "no committer lines found in stream"
    assert timestamps == sorted(timestamps), (
        f"committer timestamps must be monotonically non-decreasing; got {timestamps}"
    )


# ---------------------------------------------------------------------------
# Invariant 4: branch tip set to the last commit
# ---------------------------------------------------------------------------

def test_rebuild_stream_ends_with_branch_pointer(synthetic_cache):
    """The stream must end with `reset refs/heads/historial\nfrom :<mark>\n` so
    after fast-import the branch points to the last commit, not stays orphan."""
    graph, cache_dir, data_root = synthetic_cache
    events = bh._collect_events(graph, data_root, cache_dir=cache_dir)
    events_sorted = sorted(events, key=lambda e: e.sort_key())
    stream = bh._make_fast_import_stream(events_sorted, append=False, rebuild=True)

    import re
    # Look for the trailing reset+from with a mark number
    tail = stream[-200:].decode("utf-8", errors="replace")
    m = re.search(r"reset refs/heads/historial\nfrom :(\d+)\n", tail)
    assert m, f"stream must end with a 'reset+from :<mark>' for the branch tip; tail: {tail!r}"


# ---------------------------------------------------------------------------
# Invariant 5: every collected event becomes exactly one commit
# ---------------------------------------------------------------------------

def test_rebuild_emits_one_commit_per_event(synthetic_cache):
    """Each CommitContext → exactly one `commit refs/heads/historial` line.
    No deduping (the cache IS the dedupe layer); no skipping."""
    graph, cache_dir, data_root = synthetic_cache
    events = bh._collect_events(graph, data_root, cache_dir=cache_dir)
    events_sorted = sorted(events, key=lambda e: e.sort_key())
    stream = bh._make_fast_import_stream(events_sorted, append=False, rebuild=True)
    commit_lines = stream.count(b"commit refs/heads/historial\n")
    assert commit_lines == len(events_sorted), (
        f"expected {len(events_sorted)} commits, stream contains {commit_lines}"
    )


# ---------------------------------------------------------------------------
# Invariant 6: rebuild produces no commits when cache is empty (graceful)
# ---------------------------------------------------------------------------

def test_rebuild_with_no_events_emits_empty_stream(tmp_path):
    """Empty cache → empty stream. Don't blow up; don't emit a malformed reset."""
    stream = bh._make_fast_import_stream([], append=False, rebuild=True)
    assert stream == b"", f"empty input must yield empty stream, got {stream!r}"
