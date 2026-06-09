"""Build static SPA indexes from the historial worktree.

This module exposes pure functions tested in tests/test_build_web_indexes.py
plus a CLI entry point that performs filesystem + git reads.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class NormaMetadata:
    id_norma: int
    numero: str
    tipo: str
    titulo: str
    organismo: str
    fecha_publicacion: str


@dataclass(frozen=True)
class Commit:
    sha: str
    date: str          # YYYY-MM-DD
    causa_id: int      # idNorma of the law that caused this version
    subject: str
    magnitude: int     # lines changed in this version's diff (rough)


def parse_metadata(meta: dict[str, Any]) -> NormaMetadata:
    """Project a metadata.json dict onto the typed shape used by the index builder."""
    return NormaMetadata(
        id_norma=int(meta["idNorma"]),
        numero=str(meta.get("numero", "")),
        tipo=str(meta.get("tipo", "")),
        titulo=str(meta.get("titulo", "")),
        organismo=str(meta.get("organismo", "")),
        fecha_publicacion=str(meta.get("fechaPublicacion", "")),
    )


def raw_text_url(*, repo: str, sha: str, rel_path: str) -> str:
    """Immutable raw.githubusercontent URL for a file at a specific commit SHA."""
    return f"https://raw.githubusercontent.com/{repo}/{sha}/{rel_path}"


def commits_index_path(out_dir: Path, *, id_norma: int) -> Path:
    """Where to write the per-law commits shard."""
    return out_dir / "idx" / "commits" / f"{id_norma}.json"


def aggregate_manifest(commits: dict[int, list[Commit]], *, repo: str) -> dict[str, Any]:
    """Roll per-law commit lists into top-level corpus stats for manifest.json."""
    all_dates = [c.date for cs in commits.values() for c in cs if c.date]
    years = sorted({int(d[:4]) for d in all_dates if len(d) >= 4 and d[:4].isdigit()})
    return {
        "repo": repo,
        "normas_count": len(commits),
        "versions_count": sum(len(cs) for cs in commits.values()),
        "year_min": years[0] if years else None,
        "year_max": years[-1] if years else None,
    }


def _git_log_for_path(historial: Path, rel_path: str) -> list[tuple[str, str, str]]:
    """Return [(sha, iso_date, subject), ...] of commits touching rel_path on the historial branch."""
    out = subprocess.check_output(
        ["git", "-C", str(historial), "log", "--format=%H%x09%cs%x09%s", "--", rel_path],
        text=True,
    )
    rows: list[tuple[str, str, str]] = []
    for line in out.strip().splitlines():
        sha, date, subject = line.split("\t", 2)
        rows.append((sha, date, subject))
    return rows


def _causa_from_subject(subject: str) -> int:
    """Best-effort: extract the causa idNorma from a commit subject. Pipeline writes `... id=NNN ...`
    as a stable trailer; fall back to 0 if not present."""
    import re
    m = re.search(r"\bid=(\d+)\b", subject)
    return int(m.group(1)) if m else 0


def build(*, historial: Path, out_dir: Path, repo: str) -> dict[str, Any]:
    """CLI entry point. Walks historial worktree, emits shards under out_dir.

    Filesystem + git heavy — NOT covered by unit tests."""
    commits_by_id: dict[int, list[Commit]] = {}

    # Walk every leaf metadata.json (one per law dir)
    for meta_path in sorted(historial.glob("**/metadata.json")):
        if "cache/" in meta_path.as_posix():
            continue
        meta = json.loads(meta_path.read_text())
        norma = parse_metadata(meta)
        rel_dir = meta_path.parent.relative_to(historial).as_posix()
        rows = _git_log_for_path(historial, rel_dir + "/texto.md")
        commit_list = [
            Commit(sha=sha, date=date, causa_id=_causa_from_subject(subject),
                   subject=subject, magnitude=0)
            for sha, date, subject in rows
        ]
        commits_by_id[norma.id_norma] = commit_list

        shard_path = commits_index_path(out_dir, id_norma=norma.id_norma)
        shard_path.parent.mkdir(parents=True, exist_ok=True)
        shard_path.write_text(json.dumps({
            "norma": asdict(norma),
            "commits": [asdict(c) for c in commit_list],
            "rel_dir": rel_dir,
        }, ensure_ascii=False, separators=(",", ":")))

    manifest = aggregate_manifest(commits_by_id, repo=repo)
    manifest_path = out_dir / "idx" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--historial", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path, help="e.g. web/public")
    p.add_argument("--repo", default="pisanvs/ley-chile")
    args = p.parse_args()
    m = build(historial=args.historial, out_dir=args.out, repo=args.repo)
    print(json.dumps(m, indent=2))


if __name__ == "__main__":
    main()
