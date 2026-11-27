"""
verify_pipeline.py — honest pipeline reporter.

Compares REAL artifact counts on disk (catalog entries, graph nodes, cache
files, historial metadata.json files) and surfaces internal inconsistencies
(corrupt cache, stale historial, orphan references).  Replaces the
self-reported progress numbers that have lied repeatedly during development.

Output: JSON to stdout, deterministic given the same inputs.

Exit codes:
  0 — all observed counts are internally consistent.
  1 — at least one inconsistency detected (details in `inconsistencies`).
  2 — an input artifact was missing (catalog/graph not found).

Usage:
    python scripts/verify_pipeline.py \\
        --catalog-path ./catalog.json \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        [--historial-dir ./historial]
"""
from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import (  # noqa: E402
    diff_id_from_path,
    graph_exists,
    iter_diff_files,
    load_diff_file,
    load_graph,
)
from build_web_indexes import real_date  # noqa: E402


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def _load_catalog(catalog_path: Path) -> tuple[list[dict], bool]:
    """Return (entries, complete).  Tolerates plain-list legacy format."""
    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return raw, True
    entries = raw.get("entries", [])
    return entries, bool(raw.get("complete", False))


def _year(date_str: str) -> int | None:
    """Parse the leading YYYY of a date string, or None if not 4 digits."""
    if not date_str or len(date_str) < 4 or not date_str[:4].isdigit():
        return None
    return int(date_str[:4])


def is_buildable(node: dict) -> bool:
    """Whether a graph node can ever produce a historial commit.

    A norma is buildable iff it has:
      * a real fechaPublicacion (present, year <= 2100), AND
      * at least one real vigencia (a version whose `desde` year <= 2100).

    Excluded (structurally un-buildable, ~19k of the ~358k catalog):
      * undated normas (no fechaPublicacion),
      * sentinel/garbage dates (year > 2100, e.g. LeyChile's `2222-02-02`),
      * zero-vigencia stubs (SPARQL placeholders LeyChile never serves).

    These can never reach `historial`, so counting them in the progress
    denominator caps the bar below 100% forever. Basing % on buildable normas
    makes 100% actually reachable.
    """
    if not isinstance(node, dict):
        return False
    y = _year(node.get("fechaPublicacion", "") or "")
    if y is None or y > 2100:
        return False
    vigs = node.get("vigencias") or []
    for v in vigs:
        if not isinstance(v, dict):
            continue
        vy = _year(v.get("desde", "") or "")
        if vy is not None and vy <= 2100:
            return True
    return False


# ---------------------------------------------------------------------------
# Inconsistency detectors
# ---------------------------------------------------------------------------

def _check_cache_completeness(cache_dir: Path) -> tuple[int, int, list[str]]:
    """For each diffs/{id}.json, every entry's `fecha` must have a
    matching versions/{id}/{fecha}.json on disk.

    Returns (diff_file_count, version_file_count, list_of_missing_pairs).
    """
    diffs_dir = cache_dir / "diffs"
    versions_dir = cache_dir / "versions"
    diff_files = list(iter_diff_files(diffs_dir))
    inconsistencies: list[str] = []
    for diff_file in diff_files:
        id_str = diff_id_from_path(diff_file)
        try:
            entries = load_diff_file(diff_file)
        except (json.JSONDecodeError, OSError) as exc:
            inconsistencies.append(f"corrupt diff file: {id_str} ({exc})")
            continue
        if not isinstance(entries, list):
            inconsistencies.append(f"diff file not a list: {id_str}")
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            fecha = entry.get("fecha", "")
            if not fecha:
                continue
            if not (versions_dir / id_str / f"{fecha}.json").exists():
                inconsistencies.append(
                    f"diff references missing version: {id_str}/{fecha}"
                )

    version_files = (
        sum(1 for _ in versions_dir.glob("*/*.json"))
        if versions_dir.is_dir() else 0
    )
    return len(diff_files), version_files, inconsistencies


def _check_historial_against_graph(
    historial_dir: Path, graph_ids: set[str]
) -> tuple[int, list[str], dict[str, str]]:
    """Each metadata.json under historial must reference an idNorma that's in
    the current graph.  Stale entries (norma removed from graph but still in
    historial) are reported.  Returns (real_dir_count, inconsistencies).
    """
    inconsistencies: list[str] = []
    meta_by_dir: dict[str, str] = {}
    real_dirs = 0
    # rglob recurses to any depth — necessary because law_dir produces paths
    # at varying nesting: leyes/{N}/metadata.json (2 levels),
    # dfl/{org}/{N}/metadata.json (3 levels), etc/{tipo}/{N}/metadata.json
    # (3 levels). The previous glob "*/*/metadata.json" only matched 2-level
    # paths and missed every DFL/DTO/etc-routed norma — that's why the
    # README progress bar appeared stuck around 22%.
    for meta in historial_dir.rglob("metadata.json"):
        # Skip anything inside .git/ defensively (rglob normally wouldn't
        # descend into a sibling .git but worktrees can put symlinks weird).
        if ".git" in meta.parts:
            continue
        real_dirs += 1
        try:
            payload = json.loads(meta.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            inconsistencies.append(f"unreadable metadata.json: {meta.relative_to(historial_dir)}")
            continue
        id_norma = str(payload.get("idNorma", "")) if isinstance(payload, dict) else ""
        if id_norma:
            meta_by_dir[meta.parent.relative_to(historial_dir).as_posix()] = id_norma
        if id_norma and id_norma not in graph_ids:
            inconsistencies.append(
                f"historial has stale norma not in graph: {id_norma} "
                f"({meta.relative_to(historial_dir)})"
            )
    return real_dirs, inconsistencies, meta_by_dir


def _cached_version_dates(cache_dir: Path) -> dict[str, set[str]]:
    """idNorma -> set of real version dates present in the diffs cache."""
    out: dict[str, set[str]] = {}
    for diff_file in iter_diff_files(cache_dir / "diffs"):
        id_str = diff_id_from_path(diff_file)
        try:
            entries = load_diff_file(diff_file)
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(entries, list):
            continue
        fechas = set()
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            fecha = entry.get("fecha", "")
            year = _year(fecha)
            if year is not None and year <= 2100:
                fechas.add(fecha)
        if fechas:
            out[id_str] = fechas
    return out


_HIST_REC = "__VP_REC__"
_HIST_END = "__VP_END__"
_HIST_SEP = chr(1)


def _historial_commit_dates(historial_dir: Path) -> dict[str, set[str]] | None:
    """rel_dir -> dates of the commits that touched its texto.md.

    Dates come from the commit subject via `real_date`, not from the committer
    date: build_history clamps pre-1970 timestamps and same-day events can
    shift by a day. Returns None when the directory is not a readable git
    repository, in which case the check is skipped instead of reported.

    git-dependent; the comparison itself is `missing_versions`.
    """
    fmt = _HIST_REC + "%cs" + _HIST_SEP + "%s" + _HIST_END
    try:
        out = subprocess.check_output(
            ["git", "-C", str(historial_dir), "log",
             f"--format={fmt}", "--name-only", "--diff-filter=ACMRT"],
            text=True, stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, OSError):
        return None
    dates: dict[str, set[str]] = {}
    for block in out.split(_HIST_REC)[1:]:
        head, _, tail = block.partition(_HIST_END)
        committer_date, _, subject = head.partition(_HIST_SEP)
        fecha = real_date(subject=subject, committer_date=committer_date)
        for line in tail.splitlines():
            line = line.strip()
            if line.endswith("/texto.md"):
                dates.setdefault(line[: -len("/texto.md")], set()).add(fecha)
    return dates


def missing_versions(
    *,
    cached: dict[str, set[str]],
    committed: dict[str, set[str]],
    meta_by_dir: dict[str, str],
    today: str,
    limit: int = 20,
) -> tuple[int, list[str]]:
    """Cached versions of an already-built norma that produced no commit.

    A norma present in historial must have one commit per cached version whose
    date has arrived. Versions dated in the future are excluded: LeyChile lists
    deferred vigencias ahead of time and the build emits them once in force.

    Normas with no commit at all are skipped — those are simply not built yet,
    which the buildable/norma_dirs counts already cover. What this catches is
    the silent case: a norma that *is* in historial while some of its cached
    versions never produced a commit, so it keeps serving an older text while
    every other metric looks healthy.

    Returns (total_missing, inconsistencies), the list capped at `limit`.
    """
    total = 0
    issues: list[str] = []
    for rel_dir, id_norma in sorted(meta_by_dir.items()):
        got = committed.get(rel_dir)
        if not got:
            continue
        expected = {d for d in cached.get(id_norma, set()) if d <= today}
        missing = sorted(expected - got)
        if not missing:
            continue
        total += len(missing)
        issues.append(
            f"historial missing {len(missing)} cached version(s) for norma "
            f"{id_norma} ({rel_dir}): {', '.join(missing[:3])}"
            + (" ..." if len(missing) > 3 else "")
        )
    return total, issues[:limit]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def gather_report(
    catalog_path: Path,
    graph_path: Path,
    cache_dir: Path,
    historial_dir: Path | None = None,
    today: str | None = None,
) -> dict:
    """Build the full report dict.  Pure read-only operation."""
    if today is None:
        today = datetime.date.today().isoformat()
    entries, complete = _load_catalog(catalog_path)
    catalog_ids = {str(e["idNorma"]) for e in entries if isinstance(e, dict) and "idNorma" in e}

    graph = load_graph(graph_path) if graph_exists(graph_path) else {}
    graph_ids = set(graph.keys())
    buildable = sum(1 for node in graph.values() if is_buildable(node))

    diff_count, version_count, cache_issues = _check_cache_completeness(cache_dir)

    inconsistencies: list[str] = list(cache_issues)

    # Cross-check: graph nodes that aren't in the catalog (orphan metadata).
    catalog_orphans = sorted(graph_ids - catalog_ids)
    if catalog_orphans:
        inconsistencies.append(
            f"graph has {len(catalog_orphans)} nodes not in catalog (e.g. {catalog_orphans[:3]})"
        )

    historial_count = 0
    versions_missing = 0
    if historial_dir is not None and historial_dir.is_dir():
        historial_count, hist_issues, meta_by_dir = _check_historial_against_graph(
            historial_dir, graph_ids
        )
        inconsistencies.extend(hist_issues)

        # Every cached version whose date has arrived must have produced a
        # commit for a norma that is already in historial. Without this a
        # version can be dropped by the build with nothing reporting it:
        # the cache looks complete, the watermark advances, and the norma
        # keeps serving an older text.
        committed = _historial_commit_dates(historial_dir)
        if committed is not None:
            versions_missing, missing_issues = missing_versions(
                cached=_cached_version_dates(cache_dir),
                committed=committed,
                meta_by_dir=meta_by_dir,
                today=today,
            )
            inconsistencies.extend(missing_issues)

    # Deterministic ordering for downstream consumers (README, CI logs).
    inconsistencies.sort()

    return {
        "catalog": {
            "entries": len(entries),
            "complete": complete,
        },
        "graph": {
            "nodes": len(graph),
            # Normas that can actually be built (dated, non-sentinel, >=1 real
            # vigencia). This is the honest progress denominator.
            "buildable": buildable,
        },
        "cache": {
            "diff_files": diff_count,
            "version_files": version_count,
        },
        "historial": {
            "norma_dirs": historial_count,
            "versions_missing": versions_missing,
        },
        "inconsistencies": inconsistencies,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-path", required=True, metavar="PATH")
    parser.add_argument("--graph-path", required=True, metavar="PATH")
    parser.add_argument("--cache-dir", required=True, metavar="PATH")
    parser.add_argument("--historial-dir", metavar="PATH", default=None)
    args = parser.parse_args()

    catalog_path = Path(args.catalog_path)
    graph_path = Path(args.graph_path)
    cache_dir = Path(args.cache_dir)
    historial_dir = Path(args.historial_dir) if args.historial_dir else None

    if not catalog_path.exists():
        print(json.dumps({"error": f"catalog not found at {catalog_path}"}), file=sys.stderr)
        sys.exit(2)
    if not graph_exists(graph_path):
        print(json.dumps({"error": f"graph not found at {graph_path}"}), file=sys.stderr)
        sys.exit(2)

    report = gather_report(
        catalog_path=catalog_path,
        graph_path=graph_path,
        cache_dir=cache_dir,
        historial_dir=historial_dir,
    )

    # JSON to stdout, sorted keys for deterministic byte output.
    print(json.dumps(report, indent=2, sort_keys=True))
    sys.exit(0 if not report["inconsistencies"] else 1)


if __name__ == "__main__":
    main()
