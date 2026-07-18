"""Tests for scripts/verify_pipeline.py — honest pipeline reporter.

verify_pipeline produces a JSON report of REAL artifact counts (not script
self-reports) so the README can stop lying about completion.  It also detects
internal inconsistencies (corrupt cache, stale historial, orphan graph nodes)
and exits non-zero when any are found.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import verify_pipeline as vp  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers to build a synthetic pipeline state
# ---------------------------------------------------------------------------

def _write_catalog(root: Path, ids: list[int], complete: bool = True) -> Path:
    """Write a catalog.json in the new dict format."""
    path = root / "catalog.json"
    payload = {
        "entries": [{"idNorma": i, "tipo": "ley", "fechaPublicacion": "2020-01-01"} for i in ids],
        "last_code": ids[-1] if ids else 0,
        "complete": complete,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _write_graph(root: Path, ids: list[int]) -> Path:
    """Write a monolithic graph.json (verify_pipeline must also accept shards)."""
    path = root / "graph.json"
    nodes = {str(i): {"idNorma": i, "fechaPublicacion": "2020-01-01"} for i in ids}
    path.write_text(json.dumps(nodes), encoding="utf-8")
    return path


def _write_diffs_and_versions(
    cache_dir: Path, id_norma: int, fechas: list[str]
) -> None:
    diffs = cache_dir / "diffs"
    diffs.mkdir(parents=True, exist_ok=True)
    entries = [{"fecha": f, "diff": None, "tipo_version_s": "Única"} for f in fechas]
    (diffs / f"{id_norma}.json").write_text(json.dumps(entries), encoding="utf-8")
    for fecha in fechas:
        d = cache_dir / "versions" / str(id_norma)
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{fecha}.json").write_text('{"html":[]}', encoding="utf-8")


def _write_historial_dir(root: Path, ids: list[int], type_dir: str = "leyes") -> Path:
    historial = root / "historial"
    for i in ids:
        d = historial / type_dir / str(i)
        d.mkdir(parents=True, exist_ok=True)
        (d / "metadata.json").write_text(f'{{"idNorma":{i}}}', encoding="utf-8")
    return historial


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_clean_pipeline_reports_consistent_counts(tmp_path):
    """A consistent pipeline produces a report with matching numbers and exit 0."""
    _write_catalog(tmp_path, [100, 200, 300])
    _write_graph(tmp_path, [100, 200, 300])
    cache = tmp_path / "cache"
    _write_diffs_and_versions(cache, 100, ["2020-01-01"])
    _write_diffs_and_versions(cache, 200, ["2020-06-01", "2021-03-01"])
    historial = _write_historial_dir(tmp_path, [100])

    report = vp.gather_report(
        catalog_path=tmp_path / "catalog.json",
        graph_path=tmp_path / "graph.json",
        cache_dir=cache,
        historial_dir=historial,
    )

    assert report["catalog"]["entries"] == 3
    assert report["catalog"]["complete"] is True
    assert report["graph"]["nodes"] == 3
    assert report["cache"]["diff_files"] == 2
    assert report["cache"]["version_files"] == 3  # 1 + 2
    assert report["historial"]["norma_dirs"] == 1
    assert report["inconsistencies"] == []


def test_diff_referencing_missing_version_is_inconsistent(tmp_path):
    """A diff entry pointing to a fecha with no cache/versions/{id}/{fecha}.json
    is a corrupt-cache signal — must surface as an inconsistency."""
    _write_catalog(tmp_path, [100])
    _write_graph(tmp_path, [100])
    cache = tmp_path / "cache"
    # Write a diff that references TWO dates but only one version JSON exists.
    diffs = cache / "diffs"
    diffs.mkdir(parents=True)
    (diffs / "100.json").write_text(
        json.dumps([
            {"fecha": "2020-01-01", "diff": None},
            {"fecha": "2020-06-01", "diff": None},  # missing on disk
        ]),
        encoding="utf-8",
    )
    ver_dir = cache / "versions" / "100"
    ver_dir.mkdir(parents=True)
    (ver_dir / "2020-01-01.json").write_text("{}", encoding="utf-8")
    # 2020-06-01.json deliberately NOT written

    report = vp.gather_report(
        catalog_path=tmp_path / "catalog.json",
        graph_path=tmp_path / "graph.json",
        cache_dir=cache,
        historial_dir=None,
    )
    assert any(
        "100" in str(item) and "2020-06-01" in str(item)
        for item in report["inconsistencies"]
    ), f"expected a missing-version inconsistency, got {report['inconsistencies']!r}"


def test_historial_norma_not_in_graph_is_inconsistent(tmp_path):
    """A historial dir for a norma that isn't in the graph means stale data."""
    _write_catalog(tmp_path, [100])
    _write_graph(tmp_path, [100])
    cache = tmp_path / "cache"
    cache.mkdir()
    # Historial has TWO normas — 100 (in graph) and 999 (NOT in graph)
    historial = _write_historial_dir(tmp_path, [100, 999])

    report = vp.gather_report(
        catalog_path=tmp_path / "catalog.json",
        graph_path=tmp_path / "graph.json",
        cache_dir=cache,
        historial_dir=historial,
    )
    assert any("999" in str(item) for item in report["inconsistencies"]), (
        f"expected stale-historial inconsistency for 999, got {report['inconsistencies']!r}"
    )


def test_cli_exits_nonzero_on_inconsistency(tmp_path):
    """End-to-end CLI: inconsistencies → exit code 1."""
    _write_catalog(tmp_path, [100])
    _write_graph(tmp_path, [100])
    cache = tmp_path / "cache"
    cache.mkdir()
    # Diff file with no corresponding version JSON
    (cache / "diffs").mkdir()
    (cache / "diffs" / "100.json").write_text(
        json.dumps([{"fecha": "2020-01-01", "diff": None}]),
        encoding="utf-8",
    )
    # No versions/100/2020-01-01.json on disk

    script = Path(__file__).resolve().parent.parent / "scripts" / "verify_pipeline.py"
    result = subprocess.run(
        [sys.executable, str(script),
         "--catalog-path", str(tmp_path / "catalog.json"),
         "--graph-path", str(tmp_path / "graph.json"),
         "--cache-dir", str(cache)],
        capture_output=True, text=True,
    )
    assert result.returncode != 0, f"expected non-zero exit, got {result.returncode}"
    # Output must still be valid JSON so callers can parse it for diagnostics
    payload = json.loads(result.stdout)
    assert payload["inconsistencies"], "expected at least one inconsistency in payload"


def test_cli_exits_zero_on_clean_state(tmp_path):
    """CLI returns 0 + JSON when everything is consistent."""
    _write_catalog(tmp_path, [100])
    _write_graph(tmp_path, [100])
    cache = tmp_path / "cache"
    _write_diffs_and_versions(cache, 100, ["2020-01-01"])

    script = Path(__file__).resolve().parent.parent / "scripts" / "verify_pipeline.py"
    result = subprocess.run(
        [sys.executable, str(script),
         "--catalog-path", str(tmp_path / "catalog.json"),
         "--graph-path", str(tmp_path / "graph.json"),
         "--cache-dir", str(cache)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, f"got {result.returncode}: {result.stderr}"
    payload = json.loads(result.stdout)
    assert payload["inconsistencies"] == []
    assert payload["catalog"]["entries"] == 1
    assert payload["cache"]["diff_files"] == 1


def test_is_buildable_classification():
    """Only dated, non-sentinel normas with >=1 real vigencia are buildable."""
    # Buildable: dated + a real vigencia.
    assert vp.is_buildable(
        {"fechaPublicacion": "2020-01-01", "vigencias": [{"desde": "2020-01-01"}]}
    )
    # Undated -> excluded.
    assert not vp.is_buildable(
        {"fechaPublicacion": "", "vigencias": [{"desde": "2020-01-01"}]}
    )
    # Sentinel publication date (year > 2100) -> excluded.
    assert not vp.is_buildable(
        {"fechaPublicacion": "2878-01-01", "vigencias": [{"desde": "2020-01-01"}]}
    )
    # Zero-vigencia stub -> excluded.
    assert not vp.is_buildable({"fechaPublicacion": "2020-01-01", "vigencias": []})
    # Only sentinel vigencias (2222-02-02) -> no real vigencia -> excluded.
    assert not vp.is_buildable(
        {"fechaPublicacion": "2026-01-15", "vigencias": [{"desde": "2222-02-02"}]}
    )


def test_gather_report_counts_buildable(tmp_path):
    """gather_report exposes graph.buildable = count of buildable graph nodes."""
    _write_catalog(tmp_path, [100, 200, 300, 400])
    # Custom graph: 100 buildable, 200 undated, 300 sentinel-date, 400 stub.
    graph_path = tmp_path / "graph.json"
    graph_path.write_text(json.dumps({
        "100": {"idNorma": 100, "fechaPublicacion": "2020-01-01",
                "vigencias": [{"desde": "2020-01-01"}]},
        "200": {"idNorma": 200, "fechaPublicacion": "",
                "vigencias": [{"desde": "2020-01-01"}]},
        "300": {"idNorma": 300, "fechaPublicacion": "2878-01-01",
                "vigencias": [{"desde": "2878-01-01"}]},
        "400": {"idNorma": 400, "fechaPublicacion": "2020-01-01", "vigencias": []},
    }), encoding="utf-8")
    cache = tmp_path / "cache"
    cache.mkdir()

    report = vp.gather_report(
        catalog_path=tmp_path / "catalog.json",
        graph_path=graph_path,
        cache_dir=cache,
        historial_dir=None,
    )
    assert report["graph"]["nodes"] == 4
    assert report["graph"]["buildable"] == 1  # only norma 100


def test_report_is_deterministic(tmp_path):
    """Same inputs → byte-identical JSON output (sorted, no time.now())."""
    _write_catalog(tmp_path, [100, 200])
    _write_graph(tmp_path, [100, 200])
    cache = tmp_path / "cache"
    _write_diffs_and_versions(cache, 100, ["2020-01-01"])
    _write_diffs_and_versions(cache, 200, ["2020-06-01"])

    args = dict(
        catalog_path=tmp_path / "catalog.json",
        graph_path=tmp_path / "graph.json",
        cache_dir=cache,
        historial_dir=None,
    )
    a = json.dumps(vp.gather_report(**args), sort_keys=True)
    b = json.dumps(vp.gather_report(**args), sort_keys=True)
    assert a == b, "report must be deterministic across calls"
