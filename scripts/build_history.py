"""
build_history.py — Generate a git fast-import stream from graph.json + cache/.

Reads:
  {DATA_ROOT}/graph.json                       — law dependency graph
  {DATA_ROOT}/cache/diffs/{idNorma}.json       — per-version diffs (from fetch_versions.py)
  {DATA_ROOT}/cache/versions/{idNorma}/{fecha}.json — raw norma JSON (from fetch_versions.py)
  {DATA_ROOT}/cache/tramitacion/{boletin}.json — optional tramitación data

Writes:
  git fast-import stream piped to `git fast-import` → historial branch

This is a clean read-then-generate operation. No fetching, no progress files,
no git commits during data collection.

Usage:
    python scripts/build_history.py [--data-root PATH] [--append] \\
        [--enrichers tramitacion,votaciones] [--dry-run]

    --dry-run      Print commit list without running git fast-import
    --append       Append to existing historial branch (for incremental updates)
    --enrichers    Comma-separated list of enrichers to enable (default: tramitacion)
"""

from __future__ import annotations

import argparse
import datetime
import html as html_module
import json
import logging
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Bootstrap sys.path so we can import sibling modules
# ---------------------------------------------------------------------------
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import detect_data_root, law_dir, CommitContext  # noqa: E402
from enrichers import Enricher  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AUTHOR_NAME = "Ley Chile"
AUTHOR_EMAIL = "leychile@bcn.cl"
TARGET_BRANCH = "historial"

_TAG_RE = re.compile(r"<[^>]+>")

# ---------------------------------------------------------------------------
# HTML → plain text
# ---------------------------------------------------------------------------


def _html_to_text(h: str) -> str:
    """Strip HTML tags, decode entities, collapse whitespace."""
    text = _TAG_RE.sub("", h)
    text = html_module.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _flatten_html(items: list) -> dict[int, str]:
    """Recursively flatten html items to {part_id: html_text}."""
    result: dict[int, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        if "i" in item and "t" in item:
            result[item["i"]] = item["t"]
        if "h" in item:
            result.update(_flatten_html(item["h"]))
    return result


def _flatten_to_texto(items: list) -> str:
    """Flatten html item tree to plain-text lines (no blank lines)."""
    parts = _flatten_html(items)
    lines = [_html_to_text(v) for v in parts.values() if v]
    return "\n".join(line for line in lines if line)


# ---------------------------------------------------------------------------
# Timestamp helpers
# ---------------------------------------------------------------------------


def _date_to_unix(date_str: str, seq: int = 0) -> int:
    """Convert YYYY-MM-DD to Unix timestamp (noon UTC). seq offsets for tiebreaking."""
    try:
        d = datetime.date.fromisoformat(date_str)
        dt = datetime.datetime(d.year, d.month, d.day, 12, 0, 0,
                               tzinfo=datetime.timezone.utc)
        return int(dt.timestamp()) + seq
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------

def _scope_for_node(node: dict) -> str:
    clasificacion = node.get("clasificacion", "sustantiva")
    tipo = (node.get("tipo") or "").lower()
    if tipo in ("dl", "decreto ley", "decreto-ley"):
        return "dl"
    if tipo in ("dfl", "decreto con fuerza de ley"):
        return "dfl"
    if clasificacion == "modificatoria":
        return "modificacion"
    return "ley"


def _law_dir_from_node(node: dict, id_norma: int, data_root: Path) -> Path:
    return law_dir(
        numero=node.get("numero", str(id_norma)),
        clasificacion=node.get("clasificacion", "sustantiva"),
        tipo=node.get("tipo", ""),
        id_norma=id_norma,
        fecha=node.get("fechaPublicacion", ""),
        fecha_promulgacion=node.get("fechaPromulgacion", ""),
        organismo=(node.get("organismos") or [""])[0],
        data_root=data_root,
    )


# ---------------------------------------------------------------------------
# Event collection — graph.json + cache/diffs/
# ---------------------------------------------------------------------------


def _load_graph(data_root: Path) -> dict:
    graph_path = data_root / "graph.json"
    if not graph_path.exists():
        log.warning("graph.json not found at %s", graph_path)
        return {}
    try:
        return json.loads(graph_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.error("Failed to load graph.json: %s", exc)
        return {}


def _load_diffs(data_root: Path, id_norma: int) -> list | None:
    diff_path = data_root / "cache" / "diffs" / f"{id_norma}.json"
    if not diff_path.exists():
        return None
    try:
        return json.loads(diff_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.debug("Failed to load diffs for %s: %s", id_norma, exc)
        return None


def _load_version_json(data_root: Path, id_norma: int, fecha: str) -> dict | None:
    ver_path = data_root / "cache" / "versions" / str(id_norma) / f"{fecha}.json"
    if not ver_path.exists():
        return None
    try:
        return json.loads(ver_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.debug("Failed to load version %s/%s: %s", id_norma, fecha, exc)
        return None


def _version_files(
    data_root: Path,
    id_norma: int,
    fecha: str,
    node: dict,
    rel_dir: Path,
) -> dict[str, bytes]:
    """Build the files dict for one law version commit."""
    ver_data = _load_version_json(data_root, id_norma, fecha)
    files: dict[str, bytes] = {}

    if ver_data:
        texto = _flatten_to_texto(ver_data.get("html", []))
        if texto:
            path = str(rel_dir / "texto.md")
            files[path] = texto.encode("utf-8")

    # Always write metadata.json
    meta = {
        "idNorma": id_norma,
        "numero": node.get("numero"),
        "titulo": node.get("titulo"),
        "fechaPublicacion": node.get("fechaPublicacion"),
        "tipo": node.get("tipo"),
        "clasificacion": node.get("clasificacion"),
        "version": fecha,
    }
    meta_path = str(rel_dir / "metadata.json")
    files[meta_path] = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")

    return files


def _find_successor(graph: dict, id_norma: int) -> Optional[str]:
    """Find a successor law's numero from the graph (derogated → replaced by)."""
    node = graph.get(str(id_norma), {})
    # Try 'reemplazadaPor' or 'derogadaPor' edges
    for key in ("reemplazadaPor", "derogadaPor"):
        succ = node.get(key)
        if succ:
            if isinstance(succ, list) and succ:
                succ = succ[0]
            if isinstance(succ, dict):
                return succ.get("numero")
            return str(succ)
    return None


def _collect_events(
    graph: dict,
    data_root: Path,
) -> list[CommitContext]:
    """Walk graph nodes and build CommitContext list from diffs cache."""
    events: list[CommitContext] = []
    seq = 0

    for id_norma_str, node in graph.items():
        try:
            id_norma = int(id_norma_str)
        except ValueError:
            continue

        diffs = _load_diffs(data_root, id_norma)
        if diffs is None:
            # No diffs cache yet — skip silently (fetch_versions may still be running)
            continue

        if not diffs:
            continue

        numero = node.get("numero", id_norma_str)
        titulo = node.get("titulo", "")
        fecha_pub = node.get("fechaPublicacion", "")
        derogado = node.get("derogado", False)
        scope = _scope_for_node(node)
        rel_dir = _law_dir_from_node(node, id_norma, data_root).relative_to(data_root)

        for i, entry in enumerate(diffs):
            fecha = entry.get("fecha", "")
            if not fecha:
                continue

            is_feat = (i == 0)
            is_last = (i == len(diffs) - 1)
            modificada_por = entry.get("modificadaPor")

            if is_feat:
                tipo = "feat"
                subject = f"feat({scope}): Ley {numero} publicada"
                body_lines = []
                if titulo:
                    body_lines.append(titulo)
                    body_lines.append("")
                body_lines.append(f"BCN idNorma={id_norma}")
                if fecha_pub:
                    body_lines.append(f"Publicación: {fecha_pub}")
                body = "\n".join(body_lines).strip()
                rank = 0
            else:
                tipo = "update"
                if modificada_por:
                    mod_numero = modificada_por.get("numero", "")
                    subject = f"update({scope}): Ley {numero} modificada por Ley {mod_numero} — versión {fecha}"
                    body = f"Modificada por: {modificada_por.get('titulo', '')}\n\nBCN idNorma={id_norma}".strip()
                else:
                    subject = f"update({scope}): Ley {numero} modificada — versión {fecha}"
                    body = f"BCN idNorma={id_norma}"
                rank = 1

            seq += 1
            ctx = CommitContext(
                tipo=tipo,
                scope=scope,
                ley_numero=str(numero),
                id_norma=id_norma,
                date=fecha,
                titulo=titulo,
                files=_version_files(data_root, id_norma, fecha, node, rel_dir),
                deletes=[],
                symlinks={},
                subject=subject,
                body=body,
                extra={
                    "boletin": node.get("boletin"),
                    "rel_dir": str(rel_dir),
                    "modificadaPor": modificada_por,
                },
                _seq=seq,
                _rank=rank,
            )
            events.append(ctx)

            # Derogation event after the last version
            if is_last and derogado:
                all_paths = [str(rel_dir / "texto.md"), str(rel_dir / "metadata.json")]
                symlinks: dict[str, str] = {}
                succ_numero = _find_successor(graph, id_norma)
                if succ_numero:
                    succ_node = next(
                        (n for n in graph.values() if str(n.get("numero")) == str(succ_numero)),
                        None,
                    )
                    if succ_node:
                        succ_id = int(next(
                            (k for k, v in graph.items() if v is succ_node), 0
                        ))
                        succ_rel = _law_dir_from_node(succ_node, succ_id, data_root).relative_to(data_root)
                        symlinks[str(rel_dir)] = str(succ_rel)

                seq += 1
                derog_ctx = CommitContext(
                    tipo="derog",
                    scope=scope,
                    ley_numero=str(numero),
                    id_norma=id_norma,
                    date=fecha,
                    titulo=titulo,
                    files={},
                    deletes=all_paths,
                    symlinks=symlinks,
                    subject=f"derog({scope}): Ley {numero} derogada",
                    body=f"Derogada: {fecha}\nBCN idNorma={id_norma}",
                    extra={"rel_dir": str(rel_dir)},
                    _seq=seq,
                    _rank=2,
                )
                events.append(derog_ctx)

    return events


def _build_chore_init(data_root: Path, seq: int) -> CommitContext:
    """Initial chore commit with graph.json snapshot."""
    graph_path = data_root / "graph.json"
    files: dict[str, bytes] = {}
    if graph_path.exists():
        files["graph.json"] = graph_path.read_bytes()
    return CommitContext(
        tipo="chore",
        scope="meta",
        ley_numero="",
        id_norma=0,
        date="1900-01-01",  # sorts before all law events
        titulo="",
        files=files,
        deletes=[],
        symlinks={},
        subject="chore(init): pipeline graph-first",
        body="Initial graph snapshot.",
        _seq=seq,
        _rank=3,
    )


def _build_chore_final(data_root: Path, seq: int, last_date: str) -> CommitContext:
    """Final chore commit with graph.json + catalog.json."""
    files: dict[str, bytes] = {}
    for name in ("graph.json", "catalog.json"):
        p = data_root / name
        if p.exists():
            files[name] = p.read_bytes()
    return CommitContext(
        tipo="chore",
        scope="meta",
        ley_numero="",
        id_norma=0,
        date=last_date or datetime.date.today().isoformat(),
        titulo="",
        files=files,
        deletes=[],
        symlinks={},
        subject="chore(meta): graph final state",
        body="Final graph and catalog snapshot.",
        _seq=seq,
        _rank=3,
    )


# ---------------------------------------------------------------------------
# Grouping helpers (mirror rebuild_history.py pattern)
# ---------------------------------------------------------------------------


def _group_key(ctx: CommitContext) -> tuple:
    """All feat/update/derog with the same (date, trigger_numero) share one commit."""
    if ctx.tipo in ("feat", "update", "derog"):
        mod = (ctx.extra.get("modificadaPor") or {}).get("numero") if ctx.extra else None
        trigger = mod if mod else ctx.ley_numero
        return (ctx.date, "law", trigger)
    return (ctx.date, ctx.tipo, ctx._seq)


def _group_events(sorted_events: list[CommitContext]) -> list[list[CommitContext]]:
    groups: list[list[CommitContext]] = []
    for ctx in sorted_events:
        if groups and _group_key(groups[-1][0]) == _group_key(ctx):
            groups[-1].append(ctx)
        else:
            groups.append([ctx])
    return groups


def _merge_body(group: list[CommitContext]) -> str:
    primary = group[0]
    body = primary.body or ""
    if len(group) == 1:
        return body

    modified: list[str] = []
    derogated: list[str] = []
    for ctx in group[1:]:
        if ctx.tipo == "derog":
            if ctx.ley_numero not in derogated:
                derogated.append(ctx.ley_numero)
        elif ctx.tipo == "update":
            if ctx.ley_numero not in modified:
                modified.append(ctx.ley_numero)
    modified = [n for n in modified if n not in derogated]

    extra: list[str] = []
    if modified:
        extra.append("Modifica: " + ", ".join(f"Ley {n}" for n in modified))
    if derogated:
        extra.append("Deroga: " + ", ".join(f"Ley {n}" for n in derogated))
    if not extra:
        return body
    return (body + "\n\n" + "\n".join(extra)).strip() if body else "\n".join(extra)


# ---------------------------------------------------------------------------
# git fast-import stream generation
# ---------------------------------------------------------------------------


def _make_fast_import_stream(
    events: list[CommitContext],
    append: bool,
) -> bytes:
    stream_parts: list[bytes] = []
    mark = 0
    parent_mark: Optional[int] = None

    def next_mark() -> int:
        nonlocal mark
        mark += 1
        return mark

    def enc(s: str) -> bytes:
        return s.encode("utf-8")

    def write_commit(
        subject: str,
        body: str,
        unix_ts: int,
        files: dict[str, bytes],
        m: int,
        parent_m: Optional[int],
        delete_files: Optional[list[str]] = None,
        symlinks: Optional[dict[str, str]] = None,
        from_branch: bool = False,
    ) -> None:
        msg = subject
        if body and body.strip():
            msg = subject + "\n\n" + body.strip() + "\n"
        msg_bytes = msg.encode("utf-8")
        ts_str = f"{unix_ts} +0000"
        author_line = f"author {AUTHOR_NAME} <{AUTHOR_EMAIL}> {ts_str}"
        committer_line = f"committer {AUTHOR_NAME} <{AUTHOR_EMAIL}> {ts_str}"

        commit_header = (
            f"commit refs/heads/{TARGET_BRANCH}\n"
            f"mark :{m}\n"
            f"{author_line}\n"
            f"{committer_line}\n"
            f"data {len(msg_bytes)}\n"
        )
        stream_parts.append(enc(commit_header))
        stream_parts.append(msg_bytes)
        stream_parts.append(b"\n")

        if from_branch:
            stream_parts.append(enc(f"from refs/heads/{TARGET_BRANCH}\n"))
        elif parent_m is not None:
            stream_parts.append(enc(f"from :{parent_m}\n"))

        for rel_path, content in files.items():
            file_header = f"M 100644 inline {rel_path}\ndata {len(content)}\n"
            stream_parts.append(enc(file_header))
            stream_parts.append(content)
            stream_parts.append(b"\n")

        if delete_files:
            for rel_path in delete_files:
                stream_parts.append(enc(f"D {rel_path}\n"))

        if symlinks:
            for sym_path, target in symlinks.items():
                target_bytes = target.encode("utf-8")
                stream_parts.append(
                    enc(f"M 120000 inline {sym_path}\ndata {len(target_bytes)}\n")
                )
                stream_parts.append(target_bytes)
                stream_parts.append(b"\n")

        stream_parts.append(b"\n")

    sorted_events = sorted(events, key=lambda e: e.sort_key())
    groups = _group_events(sorted_events)

    for i, group in enumerate(groups):
        primary = group[0]
        m = next_mark()
        unix_ts = _date_to_unix(primary.date, seq=i)

        merged_files: dict[str, bytes] = {}
        merged_deletes: list[str] = []
        merged_symlinks: dict[str, str] = {}
        for ctx in group:
            merged_files.update(ctx.files)
            merged_deletes.extend(ctx.deletes)
            merged_symlinks.update(ctx.symlinks)

        deleted_set = set(merged_deletes)
        merged_files = {p: c for p, c in merged_files.items() if p not in deleted_set}

        from_branch = (i == 0 and append)
        write_commit(
            subject=primary.subject,
            body=_merge_body(group),
            unix_ts=unix_ts,
            files=merged_files,
            m=m,
            parent_m=parent_mark,
            delete_files=merged_deletes or None,
            symlinks=merged_symlinks or None,
            from_branch=from_branch,
        )
        parent_mark = m

    if mark > 0:
        stream_parts.append(enc(f"reset refs/heads/{TARGET_BRANCH}\nfrom :{mark}\n\n"))

    return b"".join(stream_parts)


# ---------------------------------------------------------------------------
# Enricher loading
# ---------------------------------------------------------------------------


def _load_enrichers(names: list[str], data_root: Path) -> list[Enricher]:
    enrichers: list[Enricher] = []
    for name in names:
        name = name.strip()
        if not name:
            continue
        if name == "tramitacion":
            from enrichers.tramitacion import TramitacionEnricher
            enrichers.append(TramitacionEnricher(data_root))
        elif name == "votaciones":
            from enrichers.votaciones import VotacionesEnricher
            enrichers.append(VotacionesEnricher())
        else:
            log.warning("Unknown enricher: %s — skipping", name)
    return enrichers


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate git fast-import stream from graph.json + cache/"
    )
    parser.add_argument(
        "--data-root",
        metavar="PATH",
        help="Path to data root (default: auto-detect via LEYCHILE_DATA_ROOT or ./historial)",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append to existing historial branch instead of rebuilding from scratch",
    )
    parser.add_argument(
        "--enrichers",
        default="tramitacion",
        metavar="LIST",
        help="Comma-separated enrichers to enable (default: tramitacion)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commit list without running git fast-import",
    )
    args = parser.parse_args()

    data_root = Path(args.data_root).resolve() if args.data_root else detect_data_root()
    log.info("DATA_ROOT = %s", data_root)

    # Load graph
    graph = _load_graph(data_root)
    log.info("Loaded graph: %d nodes", len(graph))

    # Collect events
    events = _collect_events(graph, data_root)
    log.info("Collected %d version events", len(events))

    # Chore commits
    seq = len(events) + 1
    chore_init = _build_chore_init(data_root, seq)
    seq += 1
    last_date = max((e.date for e in events), default=datetime.date.today().isoformat())
    chore_final = _build_chore_final(data_root, seq, last_date)

    all_events = [chore_init] + events + [chore_final]

    # Apply enrichers
    enricher_names = [n for n in args.enrichers.split(",") if n.strip()]
    enrichers = _load_enrichers(enricher_names, data_root)
    if enrichers:
        log.info("Applying %d enricher(s): %s", len(enrichers), ", ".join(enricher_names))
        for ctx in all_events:
            for enricher in enrichers:
                enricher.enrich(ctx)

    if args.dry_run:
        sorted_events = sorted(all_events, key=lambda e: e.sort_key())
        groups = _group_events(sorted_events)
        print(f"Dry run — {len(groups)} commit(s) would be generated:\n")
        for i, group in enumerate(groups):
            primary = group[0]
            print(f"  [{i+1:4d}] {primary.date}  {primary.subject}")
            if len(group) > 1:
                for ctx in group[1:]:
                    print(f"             + {ctx.subject}")
        print(f"\nTotal: {len(groups)} commit(s) from {len(all_events)} event(s).")
        return

    # Guard --append: if branch doesn't exist, fall back to fresh import
    append = args.append
    if append:
        branch_check = subprocess.run(
            ["git", "-C", str(data_root), "rev-parse", "--verify", f"refs/heads/{TARGET_BRANCH}"],
            capture_output=True,
        )
        if branch_check.returncode != 0:
            log.info("Branch '%s' does not exist — ignoring --append, doing fresh import.", TARGET_BRANCH)
            append = False

    # Generate fast-import stream
    log.info("Generating git fast-import stream ...")
    stream = _make_fast_import_stream(all_events, append=append)
    log.info("Stream size: %d bytes", len(stream))

    if not stream:
        log.info("No events to import — nothing to do.")
        return

    # Pipe to git fast-import
    # If data_root is a worktree, git -C data_root still works
    cmd = ["git", "-C", str(data_root), "fast-import", "--force", "--quiet"]
    if not append:
        # Wipe existing historial branch first
        subprocess.run(
            ["git", "-C", str(data_root), "branch", "-D", TARGET_BRANCH],
            capture_output=True,
        )

    log.info("Running: %s", " ".join(cmd))
    result = subprocess.run(cmd, input=stream, capture_output=True)
    if result.returncode != 0:
        log.error("git fast-import failed:\n%s", result.stderr.decode(errors="replace"))
        sys.exit(1)
    log.info("git fast-import complete.")

    # Checkout / reset the branch tip if it exists as worktree
    log.info("Done. Branch '%s' updated.", TARGET_BRANCH)


if __name__ == "__main__":
    main()
