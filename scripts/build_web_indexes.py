"""Build static SPA indexes from the historial worktree.

This module exposes pure functions tested in tests/test_build_web_indexes.py
plus a CLI entry point that performs filesystem + git reads.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

_CAUSA_RE = re.compile(r"\bidNorma=(\d+)\b")

# Pattern build_history.py emits in commit subjects:
#   "Decreto N°X (...) publicada (YYYY-MM-DD)"
#   "Ley «...» [id N] promulgada (YYYY-MM-DD)"
# Used to recover the *real* publication date because the git committer date is
# unreliable: GitHub rejects negative Unix timestamps so pre-1970 events are
# clamped to 1970-01-01, and post-1970 events sometimes shift by ±1 day when
# multiple normas publish on the same calendar date.
_PUB_DATE_RE = re.compile(
    r"\b(?:publicada|publicado|promulgada|promulgado|modificada|derogada)\s*\((\d{4}-\d{2}-\d{2})\)"
)


def real_date(*, subject: str, committer_date: str) -> str:
    """Prefer the date encoded in the commit subject when present.

    Falls back to the committer date when the subject has no `publicada (...)`
    trailer. Returns the input committer_date unchanged if the parsed date
    is malformed (defensive).
    """
    m = _PUB_DATE_RE.search(subject)
    if not m:
        return committer_date
    parsed = m.group(1)
    if len(parsed) == 10 and parsed[4] == "-" and parsed[7] == "-":
        return parsed
    return committer_date


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


def _causa_from_message(subject: str, body: str) -> int:
    """Extract the causa idNorma. build_history.py writes `BCN idNorma=NNN` in the body."""
    m = _CAUSA_RE.search(body) or _CAUSA_RE.search(subject)
    return int(m.group(1)) if m else 0


_REC = "__LCH_REC__"
_END = "__LCH_END__"


def _walk_history(historial: Path) -> list[tuple[str, str, str, str, list[str]]]:
    """Single bulk `git log` pass.

    Returns [(sha, iso_date, subject, body, [touched_files...]), ...] in git-log order
    (newest first). Uses sentinel-delimited custom format so multi-line bodies and the
    file list (from --name-only) parse cleanly in one stream.
    """
    fmt = f"{_REC}%H\x01%cs\x01%s\x01%b{_END}"
    out = subprocess.check_output(
        ["git", "-C", str(historial), "log",
         f"--format={fmt}", "--name-only", "--diff-filter=ACMRT"],
        text=True,
    )
    rows: list[tuple[str, str, str, str, list[str]]] = []
    for block in out.split(_REC)[1:]:
        head, _, tail = block.partition(_END)
        parts = head.split("\x01", 3)
        if len(parts) != 4:
            continue
        sha, date, subject, body = parts
        files = [line for line in tail.splitlines() if line.strip()]
        rows.append((sha, date, subject, body, files))
    return rows


def build(*, historial: Path, out_dir: Path, repo: str) -> dict[str, Any]:
    """CLI entry point. Two passes: working-tree metadata scan + single bulk git log.

    Filesystem + git heavy — NOT covered by unit tests."""
    # Pass 1: working-tree walk → rel_dir → NormaMetadata
    by_dir: dict[str, NormaMetadata] = {}
    for meta_path in sorted(historial.glob("**/metadata.json")):
        if "cache/" in meta_path.as_posix():
            continue
        try:
            meta = json.loads(meta_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        rel_dir = meta_path.parent.relative_to(historial).as_posix()
        by_dir[rel_dir] = parse_metadata(meta)
    by_id: dict[int, tuple[str, NormaMetadata]] = {
        nm.id_norma: (d, nm) for d, nm in by_dir.items()
    }

    # Pass 2: single bulk git log, distribute commits to laws by touched texto.md
    commits_by_id: dict[int, list[Commit]] = {nm_id: [] for nm_id in by_id}
    for sha, date, subject, body, files in _walk_history(historial):
        causa_id = _causa_from_message(subject, body)
        seen: set[int] = set()
        for f in files:
            if not f.endswith("/texto.md"):
                continue
            rel_dir = f[: -len("/texto.md")]
            norma = by_dir.get(rel_dir)
            if not norma or norma.id_norma in seen:
                continue
            seen.add(norma.id_norma)
            commits_by_id[norma.id_norma].append(
                Commit(
                    sha=sha,
                    date=real_date(subject=subject, committer_date=date),
                    causa_id=causa_id,
                    subject=subject,
                    magnitude=0,
                )
            )

    # Write a shard per law that has at least one commit
    populated: dict[int, list[Commit]] = {}
    for nm_id, cs in commits_by_id.items():
        if not cs:
            continue
        cs.sort(key=lambda c: c.date)
        rel_dir, norma = by_id[nm_id]
        shard = commits_index_path(out_dir, id_norma=nm_id)
        shard.parent.mkdir(parents=True, exist_ok=True)
        shard.write_text(json.dumps({
            "norma": asdict(norma),
            "commits": [asdict(c) for c in cs],
            "rel_dir": rel_dir,
        }, ensure_ascii=False, separators=(",", ":")))
        populated[nm_id] = cs

    manifest = aggregate_manifest(populated, repo=repo)
    idx_dir = out_dir / "idx"
    idx_dir.mkdir(parents=True, exist_ok=True)
    (idx_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

    _emit_titles(idx_dir, by_id, populated)
    _emit_by_numero(idx_dir, by_id, populated)
    _emit_landing(idx_dir, by_id, populated)
    _emit_by_year(idx_dir, by_id, populated)
    _emit_modifies(idx_dir, by_id, populated)
    _emit_modified_by(idx_dir, by_id, populated)

    return manifest


def _emit_titles(idx_dir: Path, by_id: dict[int, tuple[str, NormaMetadata]],
                 populated: dict[int, list[Commit]]) -> None:
    """Powers Cmd-K. One row per law that has at least one commit."""
    titles = []
    for nm_id in populated:
        _, nm = by_id[nm_id]
        titles.append({
            "idNorma": nm.id_norma,
            "numero": nm.numero,
            "tipo": nm.tipo,
            "titulo": nm.titulo,
            "organismo": nm.organismo,
            "fechaPublicacion": nm.fecha_publicacion,
        })
    titles.sort(key=lambda t: t["idNorma"])
    (idx_dir / "titles.json").write_text(
        json.dumps(titles, ensure_ascii=False, separators=(",", ":"))
    )


def _emit_by_numero(idx_dir: Path, by_id: dict[int, tuple[str, NormaMetadata]],
                    populated: dict[int, list[Commit]]) -> None:
    """numero (string) → [idNorma, ...]. Multiple idNormas can share a numero
    when the BCN catalog has duplicates across tipos or organismos."""
    by_numero: dict[str, list[int]] = {}
    for nm_id in populated:
        _, nm = by_id[nm_id]
        key = str(nm.numero).strip()
        if not key:
            continue
        by_numero.setdefault(key, []).append(nm.id_norma)
    (idx_dir / "by-numero.json").write_text(
        json.dumps(by_numero, ensure_ascii=False, separators=(",", ":"))
    )


def _all_events(by_id: dict[int, tuple[str, NormaMetadata]],
                populated: dict[int, list[Commit]]) -> list[dict[str, Any]]:
    """Flatten every (norma, commit) pair into the landing event shape.
    Includes organismo so the homepage can show origin without an extra fetch."""
    out: list[dict[str, Any]] = []
    for nm_id, cs in populated.items():
        _, nm = by_id[nm_id]
        for c in cs:
            out.append({
                "sha": c.sha,
                "date": c.date,
                "causaId": c.causa_id,
                "subject": c.subject,
                "idNorma": nm.id_norma,
                "numero": nm.numero,
                "tipo": nm.tipo,
                "titulo": nm.titulo,
                "organismo": nm.organismo,
            })
    return out


def _emit_landing(idx_dir: Path, by_id: dict[int, tuple[str, NormaMetadata]],
                  populated: dict[int, list[Commit]]) -> None:
    """Powers the Time Machine landing: year histogram + tipos histogram +
    recent events feed. The full event corpus is sharded by year via
    _emit_by_year so clicking on any year resolves to a real page of events."""
    year_counts: dict[int, int] = {}
    tipo_counts: dict[str, int] = {}
    for nm_id, cs in populated.items():
        _, nm = by_id[nm_id]
        for c in cs:
            if len(c.date) >= 4 and c.date[:4].isdigit():
                y = int(c.date[:4])
                year_counts[y] = year_counts.get(y, 0) + 1
        # One tipo bucket per norma (not per commit) — keeps the chip counts
        # aligned with how users think of the catalog.
        tipo_counts[nm.tipo] = tipo_counts.get(nm.tipo, 0) + 1

    recent = _all_events(by_id, populated)
    recent.sort(key=lambda e: e["date"], reverse=True)

    landing = {
        "yearHistogram": [
            {"year": y, "count": c} for y, c in sorted(year_counts.items())
        ],
        "recentEvents": recent[:500],
        "tipos": [
            {"tipo": t, "count": c}
            for t, c in sorted(tipo_counts.items(), key=lambda x: -x[1])
        ],
    }
    (idx_dir / "landing.json").write_text(
        json.dumps(landing, ensure_ascii=False, separators=(",", ":"))
    )


def _emit_by_year(idx_dir: Path, by_id: dict[int, tuple[str, NormaMetadata]],
                  populated: dict[int, list[Commit]]) -> None:
    """Per-year shards so the homepage can resolve a year click to real
    events even when the year is older than the recentEvents window."""
    by_year: dict[int, list[dict[str, Any]]] = {}
    for ev in _all_events(by_id, populated):
        if len(ev["date"]) >= 4 and ev["date"][:4].isdigit():
            y = int(ev["date"][:4])
            by_year.setdefault(y, []).append(ev)

    out_dir = idx_dir / "by-year"
    out_dir.mkdir(parents=True, exist_ok=True)
    for y, events in by_year.items():
        events.sort(key=lambda e: e["date"], reverse=True)
        (out_dir / f"{y}.json").write_text(
            json.dumps(events, ensure_ascii=False, separators=(",", ":"))
        )


def build_modifies(
    by_id: dict[int, tuple[str, NormaMetadata]],
    populated: dict[int, list[Commit]],
) -> dict[int, list[dict[str, Any]]]:
    """Inverse index: for every causa law X, the list of laws+versions whose
    commits were caused by X. Skips self-edits (a law's own initial publication
    or self-modifications) so the surface is strictly *outgoing* modifications.
    Pure function — split out so it can be unit-tested.
    """
    out: dict[int, list[dict[str, Any]]] = {}
    for target_id, cs in populated.items():
        _, target = by_id[target_id]
        for c in cs:
            if c.causa_id == 0 or c.causa_id == target_id:
                continue
            out.setdefault(c.causa_id, []).append({
                "idNorma": target.id_norma,
                "date": c.date,
                "sha": c.sha,
                "titulo": target.titulo,
                "tipo": target.tipo,
                "numero": target.numero,
            })
    # Sort each entry oldest → newest for stable display.
    for rows in out.values():
        rows.sort(key=lambda r: r["date"])
    return out


def _emit_modifies(idx_dir: Path, by_id: dict[int, tuple[str, NormaMetadata]],
                   populated: dict[int, list[Commit]]) -> None:
    """One file per causa law: `idx/modifies/{causaId}.json` → list of
    modifications that law performed on others. Powers the
    "Aperturar modificaciones" button in the reader."""
    modifies = build_modifies(by_id, populated)
    modifies_dir = idx_dir / "modifies"
    modifies_dir.mkdir(parents=True, exist_ok=True)
    for causa_id, rows in modifies.items():
        (modifies_dir / f"{causa_id}.json").write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        )


def build_modified_by(
    by_id: dict[int, tuple[str, NormaMetadata]],
    populated: dict[int, list[Commit]],
) -> dict[int, list[dict[str, Any]]]:
    """Inverse index in the *other* direction: for every target law T, the
    distinct modifier laws that have edited it, plus when. Each entry
    aggregates over all commits caused by the same modifier — one row per
    (target, modifier) pair, not one per modification commit, so a chatty
    modifier collapses into a single sidebar item with a count.

    Skips the law's own initial publication / self-edits (causa_id == target).
    Modifier rows that don't resolve to a known norma (causa_id not in by_id —
    e.g. data lag) are skipped so the UI doesn't render broken links.
    """
    out: dict[int, list[dict[str, Any]]] = {}
    for target_id, cs in populated.items():
        # (modifier_id) → mutable accumulator
        agg: dict[int, dict[str, Any]] = {}
        for c in cs:
            if c.causa_id == 0 or c.causa_id == target_id:
                continue
            modifier = by_id.get(c.causa_id)
            if modifier is None:
                continue
            _, mod = modifier
            row = agg.get(c.causa_id)
            if row is None:
                agg[c.causa_id] = {
                    "modifierId": mod.id_norma,
                    "modifierTipo": mod.tipo,
                    "modifierNumero": mod.numero,
                    "modifierTitulo": mod.titulo,
                    "firstDate": c.date,
                    "lastDate": c.date,
                    "count": 1,
                    # The set of dates in *target's* history this modifier
                    # touched. Listed so the UI can offer "ver cambio" jumps.
                    "touchedDates": [c.date],
                }
            else:
                row["count"] += 1
                if c.date < row["firstDate"]:
                    row["firstDate"] = c.date
                if c.date > row["lastDate"]:
                    row["lastDate"] = c.date
                row["touchedDates"].append(c.date)
        if not agg:
            continue
        rows = list(agg.values())
        # Sort by most-recent first, then by id for determinism.
        rows.sort(key=lambda r: (r["lastDate"], r["modifierId"]), reverse=True)
        for r in rows:
            r["touchedDates"] = sorted(set(r["touchedDates"]))
        out[target_id] = rows
    return out


def _emit_modified_by(idx_dir: Path, by_id: dict[int, tuple[str, NormaMetadata]],
                      populated: dict[int, list[Commit]]) -> None:
    """One file per target law: `idx/modified_by/{idNorma}.json` → list of
    laws that have modified it. Powers the right-rail "Modificadores" tab."""
    modified_by = build_modified_by(by_id, populated)
    out_dir = idx_dir / "modified_by"
    out_dir.mkdir(parents=True, exist_ok=True)
    for target_id, rows in modified_by.items():
        (out_dir / f"{target_id}.json").write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        )


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
