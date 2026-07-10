"""Export the historial branch as NDJSON snapshot artifacts.

Runs at the end of the GitHub Actions pipeline, where the historial worktree is
already on disk. The Railway loader ingests what this writes. Git stays
canonical; these artifacts are the rebuild input that makes "drop the DB and
rebuild" a command you can actually run.

Dates come from real_date(), never from committer dates: GitHub rejects
negative Unix timestamps, so pre-1970 events clamp to 1970-01-01.
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from build_web_indexes import real_date
from schemas.snapshot import (
    EventRow, Manifest, ModRow, NormaRow, VersionRow, close_ranges, to_ndjson,
)
from segment import canonical_text, segment, sha256_text
from spans import ArticleRow, SpanRow, VersionInput, build_articles_and_spans

SHARD_SIZE = 50_000

# A single malformed norma must not kill a 357k-norma export; a systemic
# breakage must not pass silently. Abort past this failure rate.
FAILURE_RATE_ABORT = 0.001


@dataclass(frozen=True)
class CommitMeta:
    sha: str
    committer_date: str
    subject: str
    causa_id: int | None
    magnitude: int


def shard_name(kind: str, index: int) -> str:
    return f"{kind}-{index:03d}.ndjson.gz"


def build_manifest(
    snapshot_version: str, watermark: str, last_delta_seq: int, shards: list[str]
) -> Manifest:
    return Manifest(
        snapshot_version=snapshot_version,
        watermark=watermark,
        last_delta_seq=last_delta_seq,
        shards=shards,
    )


def coalesce_same_date(dated: list[tuple[str, CommitMeta]]) -> list[tuple[str, CommitMeta]]:
    """Collapse events sharing a date to the LAST commit of that date.

    Measured: 87 of 357,249 normas have 2+ publication events on one date, and
    idNorma 1984 was amended by three distinct laws on 2023-04-10. `version` has
    UNIQUE (id_norma, desde) and an EXCLUDE over overlapping dateranges, so two
    rows cannot share a date — and "the law as it read on 2023-04-10" has one
    answer: the tree state after all of that day's commits, i.e. the last one.

    `dated` must already be sorted by (date, git order); Python's sort is stable,
    so the last entry for a date is the last commit of that date. Every event
    survives in EventRow (see `events_for_norma`); nothing is discarded here
    except the redundant intermediate texts.
    """
    out: dict[str, CommitMeta] = {}
    for date, commit in dated:
        out[date] = commit          # later entries overwrite earlier ones
    return sorted(out.items())


def events_for_norma(
    id_norma: int, commits: list[CommitMeta]
) -> list[EventRow]:
    """One row per commit. Never coalesced — this is the audit trail."""
    return [
        EventRow(
            id_norma=id_norma,
            commit_sha=c.sha,
            fecha=real_date(subject=c.subject, committer_date=c.committer_date),
            causa_id=c.causa_id,
            subject=c.subject,
            magnitude=c.magnitude,
        )
        for c in commits
    ]


def versions_for_norma(
    id_norma: int,
    law_dir: str,
    commits: list[CommitMeta],
    textos: dict[str, str],
) -> tuple[list[VersionRow], list[ArticleRow], list[SpanRow], list[EventRow]]:
    """Project a norma's commit history onto version, article, span and event rows."""
    events = events_for_norma(id_norma, commits)

    dated = sorted(
        ((real_date(subject=c.subject, committer_date=c.committer_date), c) for c in commits),
        key=lambda pair: pair[0],   # stable: preserves git order within a date
    )
    dated = coalesce_same_date(dated)
    ranges = close_ranges([d for d, _ in dated])

    versions = [
        VersionRow(
            id_norma=id_norma,
            desde=desde,
            hasta=hasta,
            commit_sha=c.sha,
            causa_id=c.causa_id,
            subject=c.subject,
            magnitude=c.magnitude,
            texto_sha256=sha256_text(textos[c.sha]),
            canonical_sha256=sha256_text(canonical_text(segment(textos[c.sha]))),
        )
        for (desde, hasta), (_, c) in zip(ranges, dated)
    ]

    articles, spans = build_articles_and_spans(
        id_norma,
        [VersionInput(desde=v.desde, hasta=v.hasta, texto=textos[v.commit_sha]) for v in versions],
    )
    return versions, articles, spans, events


SENTINEL_YEAR = 2100   # LeyChile uses 2222-02-02 for open-ended "current"


def mod_rows_for(id_norma: int, node: dict) -> list[ModRow]:
    """Build modificacion rows from a graph node's `modificadaPor_edges`.

    Edges are DICTS — `{"idNorma": 30232, "fecha": "1989-12-06"}` — written by
    fetch_normas.py's `_extract_edges_from_html`. Verified: all 12,010 edges in
    the real graph are dicts, zero are bare ints. `int(edge)` on a dict raises
    TypeError on the first modified norma, i.e. most of the corpus.

    Each edge carries its OWN fecha: the date that modification took effect.
    Using the target's `fechaPublicacion` instead would stamp every modification
    of a law with the law's own publication date.

    Bare ints are tolerated for legacy caches (see `NormaNode.from_legacy`).
    Sentinel dates (2222-02-02) are dropped.
    """
    rows: list[ModRow] = []
    seen: set[tuple[int, str]] = set()
    for edge in node.get("modificadaPor_edges") or []:
        if isinstance(edge, dict):
            causa, fecha = edge.get("idNorma"), edge.get("fecha") or ""
        else:
            causa, fecha = edge, node.get("fechaPublicacion") or ""
        if causa is None or len(fecha) < 4 or not fecha[:4].isdigit():
            continue
        if int(fecha[:4]) > SENTINEL_YEAR:
            continue
        key = (int(causa), fecha)
        if key in seen:                       # PK is (causa_id, target_id, fecha)
            continue
        seen.add(key)
        rows.append(ModRow(causa_id=int(causa), target_id=id_norma,
                           fecha=fecha, commit_sha=""))
    return rows


def build_law_dir_index(historial: Path) -> dict[int, str]:
    """Map idNorma -> the norma's directory, relative to `historial`.

    `graph.json` does not carry `law_dir`; its nodes hold only idNorma, tipo,
    numero, titulo, organismos, clasificacion, derogado, the fechas, vigencias
    and modificadaPor_edges. Rather than re-derive the layout with
    `utils.law_dir()` — which resolves collisions by reading metadata.json
    anyway, and which would silently export nothing if it ever disagreed with
    the tree — read the layout `build_history.py` actually wrote.

    A malformed metadata.json is skipped, not fatal: one bad norma must not
    abort a corpus-wide export. `main()` aborts if the whole index is empty.
    """
    index: dict[int, str] = {}
    for meta in historial.rglob("metadata.json"):
        try:
            id_norma = json.loads(meta.read_text(encoding="utf-8", errors="replace"))["idNorma"]
        except (OSError, ValueError, KeyError, TypeError):
            continue
        index[int(id_norma)] = meta.parent.relative_to(historial).as_posix()
    return index


# --------------------------------------------------------------------------
# Git reading. Not unit-tested (requires a repo); exercised by Task 11's E2E.
# --------------------------------------------------------------------------

def read_commits(historial: Path, law_dir: str) -> list[CommitMeta]:
    """`git log` over one law's directory, oldest first.

    Reads the body as well as the subject. The causa lives in the body — real
    commits look like:

        Otra [id 1224599] publicada (2026-05-29)
        <blank>
        BCN idNorma=1224599

    Records are \\x1e-separated because bodies contain newlines.
    """
    out = subprocess.run(
        ["git", "-C", str(historial), "log", "--reverse",
         "--format=%H%x1f%cI%x1f%s%x1f%b%x1e", "--", law_dir],
        capture_output=True, text=True, check=True,
    ).stdout
    commits: list[CommitMeta] = []
    for record in out.split("\x1e"):
        record = record.strip("\n")
        if not record:
            continue
        sha, cdate, subject, body = record.split("\x1f", 3)
        commits.append(CommitMeta(
            sha=sha, committer_date=cdate[:10], subject=subject,
            causa_id=causa_from_message(subject, body), magnitude=0,
        ))
    return commits


_CAUSA_RE = re.compile(r"\bidNorma=(\d+)\b")


def causa_from_message(subject: str, body: str) -> int | None:
    """Body first, then subject — mirrors build_web_indexes.py's _CAUSA_RE use.

    `build_history.py` writes the causa as `BCN idNorma={id}` in the body. The
    subject carries `[id 1224599]` in a different shape, and for named laws
    (`Ley N°21819 publicada (...)`) it carries no id at all. Parsing only the
    subject would silently null every causa_id, dropping the modificadora →
    modificada relationship the whole project exists to expose.
    """
    m = _CAUSA_RE.search(body) or _CAUSA_RE.search(subject)
    return int(m.group(1)) if m else None


def read_textos(historial: Path, refs: list[tuple[str, str]]) -> dict[str, str]:
    """Batch-read `{sha}:{path}` blobs. One process for all 408k versions.

    `git cat-file --batch` reads requests on stdin and emits
    `<oid> <type> <size>\\n<contents>\\n` per hit, `<ref> missing\\n` per miss.
    """
    stdin = "".join(f"{sha}:{path}\n" for sha, path in refs)
    proc = subprocess.run(
        ["git", "-C", str(historial), "cat-file", "--batch"],
        input=stdin.encode(), capture_output=True, check=True,
    )
    out, pos, result = proc.stdout, 0, {}
    for sha, _path in refs:
        header_end = out.index(b"\n", pos)
        header = out[pos:header_end].decode()
        if header.endswith("missing"):
            pos = header_end + 1
            continue
        size = int(header.rsplit(" ", 1)[1])
        body_start = header_end + 1
        result[sha] = out[body_start:body_start + size].decode("utf-8", errors="replace")
        pos = body_start + size + 1  # trailing newline
    return result


def _write_shards(out_dir: Path, kind: str, rows: list) -> list[str]:
    names = []
    for i in range(0, max(len(rows), 1), SHARD_SIZE):
        chunk = rows[i:i + SHARD_SIZE]
        if not chunk:
            break
        name = shard_name(kind, i // SHARD_SIZE)
        with gzip.open(out_dir / name, "wt", encoding="utf-8") as fh:
            fh.write(to_ndjson(chunk))
        names.append(name)
    return names


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--historial", type=Path, required=True)
    ap.add_argument("--graph", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--snapshot-version", required=True)
    ap.add_argument("--watermark", required=True)
    ap.add_argument("--delta-seq", type=int, default=0)
    ap.add_argument("--only", type=Path, default=None,
                    help="newline-delimited idNormas for a delta artifact")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    graph = json.loads(args.graph.read_text(encoding="utf-8"))

    # graph.json does NOT carry law_dir — its nodes hold only idNorma, tipo, numero,
    # titulo, organismos, clasificacion, derogado, fechaPublicacion/Promulgacion,
    # vigencias and modificadaPor_edges. Read the directory layout from the tree
    # build_history.py actually wrote, rather than re-deriving it with utils.law_dir():
    # a re-derivation that disagreed with the tree would silently export nothing.
    law_dirs = build_law_dir_index(args.historial)
    if not law_dirs:
        print(f"ABORT: no metadata.json found under {args.historial}; nothing to export.")
        return 1

    wanted = None
    if args.only:
        wanted = {int(x) for x in args.only.read_text().split()}

    normas, versions, articles, spans, mods, events = [], [], [], [], [], []
    considered = 0
    failures: list[tuple[int, str]] = []

    for key, node in graph.items():
        id_norma = int(key)
        if wanted is not None and id_norma not in wanted:
            continue
        law_dir = law_dirs.get(id_norma)
        if not law_dir or not (args.historial / law_dir / "texto.md").exists():
            continue
        considered += 1

        # Isolate per norma. One legislatively-odd law must not take down a
        # 357k-norma export; the failure-rate check below still catches a
        # systemic breakage.
        try:
            commits = read_commits(args.historial, law_dir)
            if not commits:
                continue
            textos = read_textos(args.historial, [(c.sha, f"{law_dir}/texto.md") for c in commits])
            commits = [c for c in commits if c.sha in textos]
            if not commits:
                continue
            v, a, s, e = versions_for_norma(id_norma, law_dir, commits, textos)
        except Exception as exc:                      # noqa: BLE001 — isolation is the point
            failures.append((id_norma, f"{type(exc).__name__}: {exc}"))
            continue

        versions += v
        articles += a
        spans += s
        events += e
        normas.append(NormaRow(
            id_norma=id_norma,
            tipo=node.get("tipo", ""),
            numero=str(node.get("numero", "")),
            titulo=node.get("titulo", ""),
            organismo=(node.get("organismos") or [""])[0],
            clasificacion=node.get("clasificacion", ""),
            derogado=bool(node.get("derogado", False)),
            fecha_publicacion=node.get("fechaPublicacion") or None,
            law_dir=law_dir,
        ))
        mods += mod_rows_for(id_norma, node)

    for id_norma, why in failures[:20]:
        print(f"  SKIPPED idNorma={id_norma}: {why}")
    if failures and len(failures) > max(1, int(FAILURE_RATE_ABORT * considered)):
        print(f"ABORT: {len(failures)} of {considered} normas failed "
              f"(> {FAILURE_RATE_ABORT:.1%}). No manifest written.")
        return 1

    # Fail closed. An export that matched nothing must not write a manifest: the
    # loader would happily ingest it, advance its watermark, and report success
    # while the database stayed empty. A delta legitimately selecting no normas
    # should not have been invoked in the first place.
    if not normas:
        print(f"ABORT: matched 0 normas from {len(graph)} graph nodes and "
              f"{len(law_dirs)} law dirs. No manifest written.")
        return 1

    shards: list[str] = []
    for kind, rows in [("normas", normas), ("versions", versions),
                       ("articulos", articles), ("spans", spans),
                       ("mods", mods), ("events", events)]:
        shards += _write_shards(args.out, kind, rows)

    manifest = build_manifest(args.snapshot_version, args.watermark, args.delta_seq, shards)
    (args.out / "manifest.json").write_text(
        json.dumps(manifest.__dict__, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"normas={len(normas)} versions={len(versions)} events={len(events)} "
          f"articulos={len(articles)} spans={len(spans)} mods={len(mods)} "
          f"shards={len(shards)} skipped={len(failures)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
