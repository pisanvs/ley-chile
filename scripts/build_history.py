"""
build_history.py — Generate a git fast-import stream from graph.json + cache/.

Reads:
  {DATA_ROOT}/graph.json                       — law dependency graph
  {DATA_ROOT}/cache/diffs/{idNorma}.json.gz    — per-version diffs (from fetch_versions.py, gzipped)
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

from utils import (  # noqa: E402
    CommitContext,
    detect_data_root,
    find_diff_path,
    graph_exists,
    law_dir,
    load_diff_file,
    load_graph,
    setup_logging,
)
from enrichers import Enricher  # noqa: E402

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


_EPOCH_ORDINAL = datetime.date(1970, 1, 1).toordinal()


def _date_to_unix(date_str: str, seq: int = 0) -> int:
    """Convert YYYY-MM-DD to Unix timestamp (noon UTC). seq offsets for tiebreaking.

    Uses ordinal arithmetic so pre-1900 dates (e.g. 1855-12-14) work on all
    platforms without relying on the C time_t range.

    Pre-1970 dates produce negative timestamps that are technically valid in
    git's wire format but rejected by `git fsck --strict` — which is what
    GitHub runs on receive (`receive.fsckObjects=true`). Pushes containing
    such commits fail with "badDate: invalid author/committer line" and the
    pack is rejected with HTTP 500. For the Chilean legal corpus (oldest
    laws ~1810), this means we must clamp negative results. We use the
    monotonic `seq` index to do that: pre-1970 commits collapse into the
    first few seconds of 1970-01-01 while preserving their relative order.
    Real publication dates are preserved in the commit subject.
    """
    try:
        d = datetime.date.fromisoformat(date_str)
        days_since_epoch = d.toordinal() - _EPOCH_ORDINAL
        ts = days_since_epoch * 86400 + 43200 + seq  # noon UTC
        return max(seq, ts)
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------

# Major types stay top-level in the historial layout. Everything else lives
# under etc/{tipo}/ and is treated as ancillary documentation.
MAJOR_SCOPES = {"ley", "modificacion", "dl", "dfl", "dto", "cod"}

# Maps the LeyChile `abreviacion` (lowercased) and a few legacy long-form
# strings to a normalized scope identifier. Unknown tipos are passed through
# as-is so they retain their identity rather than collapsing to "ley".
_TIPO_NORMALIZE = {
    "dl": "dl",
    "decreto ley": "dl",
    "decreto-ley": "dl",
    "dfl": "dfl",
    "decreto con fuerza de ley": "dfl",
    "dto": "dto",
    "decreto": "dto",
    "decreto supremo": "dto",
    "decreto-supremo": "dto",
    "cod": "cod",
    "ley": "ley",
    "lei": "ley",  # archaic spelling
}


def _scope_for_node(node: dict) -> str:
    """Normalize a node's tipo into a scope used for paths + commit labels.

    For a `ley` flagged as modificatoria, return "modificacion". For unknown
    tipos, return the lowercased tipo verbatim — that keeps res/cir/acd/etc.
    from being mislabeled as "ley".
    """
    clasificacion = node.get("clasificacion", "sustantiva")
    tipo = (node.get("tipo") or "").lower().strip()
    scope = _TIPO_NORMALIZE.get(tipo, tipo or "otro")
    if scope == "ley" and clasificacion == "modificatoria":
        return "modificacion"
    return scope


# Human-readable labels for commit subjects. Keyed by normalized scope.
# Unknown scopes fall back to title-cased scope.
TIPO_LABELS = {
    "ley": "Ley",
    "modificacion": "Ley",
    "dl": "Decreto Ley",
    "dfl": "Decreto con Fuerza de Ley",
    "dto": "Decreto Supremo",
    "cod": "Código",
    "res": "Resolución",
    "cir": "Circular",
    "acd": "Acuerdo",
    "aa": "Auto Acordado",
    "avi": "Aviso",
    "cer": "Certificado",
    "of": "Oficio",
    "ord": "Ordinario",
    "orz": "Ordenanza",
    "rec": "Rectificación",
    "ins": "Instrucción",
    "ncg": "Norma de Carácter General",
    "cci": "Circular del Banco Central",
    "dic": "Dictamen",
    "ses": "Sesión",
    "sen": "Proyecto de Ley",
    "msj": "Mensaje",
    "msg": "Mensaje",
    "cv": "Convenio",
    "rm": "Resolución Municipal",
    "bando": "Bando",
    "lei": "Lei",  # archaic
    "tra": "Tratado",
    "sc": "Disposición",
    "otr": "Otra",
    "otro": "Otra",
    "ntf": "Notificación",
}


def _tipo_label(scope: str) -> str:
    """Human label for commit messages. Falls back to title-cased scope."""
    if scope in TIPO_LABELS:
        return TIPO_LABELS[scope]
    return scope.replace("-", " ").title() if scope else "Norma"


def _normalize_modificada_por(value: object) -> dict | None:
    if isinstance(value, list):
        return value[0] if value else None
    if isinstance(value, dict):
        return value
    return None


# Sentinel values LeyChile uses when a norma has no legal number.
_NO_NUMERO_SENTINELS = {"", "s/n", "sn", "sin numero", "sin número"}


def _commit_subject_causa(
    scope: str,
    numero: str,
    fecha: str,
    organismo: str = "",
    titulo: str = "",
    id_norma: str | int | None = None,
) -> str:
    """Build a commit subject for a publication event.

    Handles missing/sentinel numero gracefully:
      - real number → "Ley N°20338 publicada (2009-04-01)"
      - alphanumeric like "PENAL" or "1855" for cod → "Código Penal publicada (...)"
        (drops the awkward "N°PENAL" pattern)
      - missing/'S/N' → "Auto Acordado «titulo extract» (id 32) publicada (...)"
    """
    label = _tipo_label(scope)
    org_suffix = (
        f" ({organismo})" if organismo and scope in ("dfl", "dl", "dto") else ""
    )

    norm_numero = (numero or "").strip()
    norm_lower = norm_numero.lower()
    has_numero = norm_numero and norm_lower not in _NO_NUMERO_SENTINELS

    if has_numero:
        # Prefer a clean form when the "numero" is actually a name/word
        # (e.g. cod="PENAL" → "Código Penal" rather than "Código N°PENAL").
        if scope == "cod" and not norm_numero.isdigit():
            head = f"{label} {norm_numero.title()}"
        else:
            head = f"{label} N°{norm_numero}"
        return f"{head}{org_suffix} publicada ({fecha})"

    # No numero — fall back to a short titulo extract + id reference.
    snippet = (titulo or "").strip().replace("\n", " ").replace("  ", " ")
    snippet = snippet[:60].rstrip()
    if id_norma:
        suffix = f" [id {id_norma}]"
    else:
        suffix = ""
    if snippet:
        return f"{label} «{snippet}»{org_suffix}{suffix} publicada ({fecha})"
    return f"{label}{org_suffix}{suffix} publicada ({fecha})"


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


def _build_path_registry(graph: dict, data_root: Path) -> dict[str, Path]:
    """Pre-compute every norma's historial directory with collision resolution.

    `_collision_free_path` in utils.law_dir only works against a filesystem
    that already has the conflicting metadata.json — useless during
    fast-import, which builds a tree in-memory. Without a pre-pass registry,
    two normas with the same (slug, numero) collide silently:
    norma 179583 (res N°20, MUNICIPALIDAD DE TOCOPILLA, 2000) and
    norma 1163150 (res N°20, DGA, 2021) both wrote to etc/res/20/, and the
    second commit overwrote the first.

    Walk the graph in id_norma order (deterministic). The first norma to
    claim a path keeps it; later collisions get `-{id_norma}` suffix.
    """
    registry: dict[str, Path] = {}
    claimed: dict[Path, str] = {}

    def _sort_key(k: str) -> int:
        try:
            return int(k)
        except ValueError:
            return 0

    for id_norma_str in sorted(graph.keys(), key=_sort_key):
        node = graph[id_norma_str]
        try:
            id_norma = int(id_norma_str)
        except ValueError:
            continue

        candidate = _law_dir_from_node(node, id_norma, data_root)
        rel = candidate.relative_to(data_root)

        if rel in claimed and claimed[rel] != id_norma_str:
            # Collision: append id_norma suffix.
            rel = rel.parent / f"{rel.name}-{id_norma}"
        claimed[rel] = id_norma_str
        registry[id_norma_str] = data_root / rel

    return registry


# ---------------------------------------------------------------------------
# Event collection — graph.json + cache/diffs/
# ---------------------------------------------------------------------------


def _load_graph(data_root: Path) -> dict:
    graph_path = data_root / "graph.json"
    if not graph_exists(graph_path):
        log.warning("graph not found at %s (no graph_shards/ or graph.json)", graph_path)
        return {}
    try:
        return load_graph(graph_path)
    except Exception as exc:
        log.error("Failed to load graph: %s", exc)
        return {}


def _load_diffs(cache_dir: Path, id_norma: int) -> list | None:
    diff_path = find_diff_path(cache_dir / "diffs", id_norma)
    if diff_path is None:
        return None
    try:
        return load_diff_file(diff_path)
    except Exception as exc:
        log.debug("Failed to load diffs for %s: %s", id_norma, exc)
        return None


def _load_version_json(cache_dir: Path, id_norma: int, fecha: str) -> dict | None:
    ver_path = cache_dir / "versions" / str(id_norma) / f"{fecha}.json"
    if not ver_path.exists():
        return None
    try:
        return json.loads(ver_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.debug("Failed to load version %s/%s: %s", id_norma, fecha, exc)
        return None


def _version_files(
    data_root: Path,
    cache_dir: Path,
    id_norma: int,
    fecha: str,
    node: dict,
    rel_dir: Path,
) -> dict[str, bytes]:
    """Build the files dict for one law version commit."""
    ver_data = _load_version_json(cache_dir, id_norma, fecha)
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
    cache_dir: Path | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    path_registry: dict[str, Path] | None = None,
) -> list[CommitContext]:
    """Walk graph nodes; build one CommitContext per *causing* norma (cause-centered model)."""
    if cache_dir is None:
        cache_dir = data_root / "cache"
    if path_registry is None:
        path_registry = _build_path_registry(graph, data_root)

    events_by_cause: dict[tuple, CommitContext] = {}
    seq = 0

    for id_norma_str, node in graph.items():
        try:
            id_norma = int(id_norma_str)
        except ValueError:
            continue

        diffs = _load_diffs(cache_dir, id_norma)
        if not diffs:
            continue

        # Use the pre-pass registry (collision-resolved) instead of computing
        # paths on the fly. Falls back to law_dir for normas not in the
        # registry (shouldn't happen if registry covers the full graph).
        reg_path = path_registry.get(id_norma_str)
        if reg_path is None:
            reg_path = _law_dir_from_node(node, id_norma, data_root)
        rel_dir = reg_path.relative_to(data_root)
        derogado = node.get("derogado", False)

        for i, entry in enumerate(diffs):
            fecha = entry.get("fecha", "")
            if not fecha:
                continue

            modificada_por = _normalize_modificada_por(entry.get("modificadaPor"))
            is_last = (i == len(diffs) - 1)

            # Determine causing law. Keep numero as the *real* legal number
            # (or empty/sentinel — subject builder handles fallbacks). Never
            # substitute idNorma for numero; that produces fake numbers like
            # "Ley N°1016627" where 1016627 is actually an internal id.
            if i == 0 or not modificada_por:
                causa_id_str = id_norma_str
                causa_numero = node.get("numero") or ""
                causa_titulo = node.get("titulo", "")
                causa_fecha = node.get("fechaPublicacion") or fecha
                causa_node = node
            else:
                causa_id_str = str(modificada_por["idNorma"])
                # Prefer the modifier's numero from the diff entry; fall back
                # to the modifier node's numero in the graph; otherwise empty.
                causa_numero = (
                    modificada_por.get("numero")
                    or graph.get(causa_id_str, {}).get("numero")
                    or ""
                )
                causa_titulo = (
                    modificada_por.get("titulo")
                    or graph.get(causa_id_str, {}).get("titulo", "")
                )
                causa_fecha = fecha
                causa_node = graph.get(causa_id_str, {})

            # Date window filter (from_date exclusive, to_date inclusive)
            if from_date and causa_fecha <= from_date:
                continue
            if to_date and causa_fecha > to_date:
                continue

            key = (causa_fecha, causa_id_str)

            if key not in events_by_cause:
                seq += 1
                causa_scope = _scope_for_node(causa_node)
                causa_org = (causa_node.get("organismos") or [""])[0]
                events_by_cause[key] = CommitContext(
                    tipo="feat",
                    scope=causa_scope,
                    ley_numero=causa_numero,
                    id_norma=int(causa_id_str) if causa_id_str.isdigit() else 0,
                    date=causa_fecha,
                    titulo=causa_titulo,
                    files={},
                    deletes=[],
                    symlinks={},
                    subject=_commit_subject_causa(
                        causa_scope,
                        causa_numero,
                        causa_fecha,
                        causa_org,
                        titulo=causa_titulo,
                        id_norma=causa_id_str,
                    ),
                    body="\n".join(filter(None, [causa_titulo, f"BCN idNorma={causa_id_str}"])),
                    _seq=seq,
                    _rank=0,
                )

            # Add this version's files to the causing commit
            events_by_cause[key].files.update(
                _version_files(data_root, cache_dir, id_norma, fecha, node, rel_dir)
            )

            # Derogation: deletes + optional symlink attached to the same causing commit
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
                        # Use registry for the successor too
                        succ_reg = path_registry.get(str(succ_id))
                        if succ_reg is None:
                            succ_reg = _law_dir_from_node(succ_node, succ_id, data_root)
                        succ_rel = succ_reg.relative_to(data_root)
                        symlinks[str(rel_dir)] = str(succ_rel)
                events_by_cause[key].deletes.extend(all_paths)
                events_by_cause[key].symlinks.update(symlinks)

    return list(events_by_cause.values())


def _build_chore_final(seq: int, last_date: str) -> CommitContext:
    """Empty closing commit — always sorts after all law events on the same date."""
    return CommitContext(
        tipo="chore",
        scope="meta",
        ley_numero="~",  # "~" (0x7E) sorts after all digits/letters — always last on same date
        id_norma=0,
        date=last_date or datetime.date.today().isoformat(),
        titulo="",
        files={},
        deletes=[],
        symlinks={},
        subject="Fin del historial procesado",
        body="",
        _seq=seq,
        _rank=4,
    )


# ---------------------------------------------------------------------------
# git fast-import stream generation
# ---------------------------------------------------------------------------


def _make_fast_import_stream(
    events: list[CommitContext],
    append: bool,
    rebuild: bool = False,
) -> bytes:
    """Generate a fast-import stream from an ordered list of events.

    Modes (mutually exclusive — at most one of `append`/`rebuild` may be True):

      - default (append=False, rebuild=False): fresh import. The first commit
        is a root commit (no `from` line); the trailing reset repoints the
        branch.  Suitable for an empty/missing historial.

      - append=True: incremental. The first commit's parent is the current
        historial tip (`from refs/heads/historial`).  Used to add commits
        chronologically after the existing tip.

      - rebuild=True: regenerate.  Emits a leading `reset refs/heads/historial`
        with no `from`, atomically wiping the branch before the new commits
        land.  No parent inheritance from the prior branch.  Used to make
        historial a fully derived artifact (deterministic given the cache).
    """
    if append and rebuild:
        raise ValueError("append and rebuild are mutually exclusive")
    if rebuild and not events:
        return b""  # nothing to do; don't emit a dangling reset
    stream_parts: list[bytes] = []
    mark = 0
    parent_mark: Optional[int] = None

    if rebuild:
        # Wipe the branch up front so the operation is atomic and visible in
        # the stream — fast-import readers see the intent before commits land.
        stream_parts.append(f"reset refs/heads/{TARGET_BRANCH}\n\n".encode("utf-8"))

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
            # Append-mode first commit. `from refs/heads/historial` while
            # also writing `commit refs/heads/historial` trips fast-import's
            # "can't create a branch from itself" guard. Dereferencing with
            # `^0` gives fast-import a commit reference (not a ref name) so
            # the guard doesn't fire — the parent ends up being the same
            # existing tip, which is what we want.
            stream_parts.append(enc(f"from refs/heads/{TARGET_BRANCH}^0\n"))
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

    for i, ctx in enumerate(sorted_events):
        m = next_mark()
        unix_ts = _date_to_unix(ctx.date, seq=i)

        deleted_set = set(ctx.deletes)
        files = {p: c for p, c in ctx.files.items() if p not in deleted_set}

        write_commit(
            subject=ctx.subject,
            body=ctx.body,
            unix_ts=unix_ts,
            files=files,
            m=m,
            parent_m=parent_mark,
            delete_files=ctx.deletes or None,
            symlinks=ctx.symlinks or None,
            from_branch=(i == 0 and append),
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
    parser.add_argument("--verbose", action="store_true", help="Enable DEBUG logging.")
    parser.add_argument(
        "--cache-dir",
        metavar="PATH",
        default=None,
        help="Override cache directory (default: {data-root}/cache)",
    )
    parser.add_argument(
        "--from",
        dest="from_date",
        metavar="DATE",
        default=None,
        help="Only emit commits for causing normas with date > DATE (exclusive, YYYY-MM-DD)",
    )
    parser.add_argument(
        "--to",
        dest="to_date",
        metavar="DATE",
        default=None,
        help="Only emit commits for causing normas with date <= DATE (inclusive, YYYY-MM-DD)",
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help=(
            "Regenerate the entire historial branch from the diffs cache.  "
            "Atomically wipes the existing branch (via in-stream `reset`) and "
            "replaces it with a deterministic, fully-derived commit graph.  "
            "Mutually exclusive with --append."
        ),
    )
    parser.add_argument(
        "--skip-final-chore",
        action="store_true",
        help=(
            "Don't emit the closing 'Fin del historial procesado' chore "
            "commit. Use in chunked builds where this script will be "
            "invoked multiple times in sequence — the marker would end up "
            "in the middle of history."
        ),
    )
    args = parser.parse_args()
    if args.rebuild and args.append:
        parser.error("--rebuild and --append are mutually exclusive")
    # --rebuild now accepts --from/--to: chunked builds use --rebuild --to D1
    # for chunk 1 (atomic in-stream reset), then --append --from D1 --to D2
    # for subsequent chunks.

    setup_logging(verbose=args.verbose)
    data_root = Path(args.data_root).resolve() if args.data_root else detect_data_root()
    log.info("DATA_ROOT = %s", data_root)

    # Load graph
    graph = _load_graph(data_root)
    log.info("Loaded graph: %d nodes", len(graph))

    # Collect events
    cache_dir = Path(args.cache_dir).resolve() if args.cache_dir else data_root / "cache"
    events = _collect_events(
        graph, data_root,
        cache_dir=cache_dir,
        from_date=args.from_date,
        to_date=args.to_date,
    )
    log.info("Collected %d version events", len(events))

    # Chore commits — only on builds that produce a complete history tip.
    # Skip in --append mode (we're extending an existing history) and when
    # the caller explicitly opts out via --skip-final-chore (chunked builds
    # where this script runs multiple times — marker would end up mid-history).
    if args.append or args.skip_final_chore:
        all_events = events
    else:
        seq = len(events) + 1
        last_date = max((e.date for e in events), default=datetime.date.today().isoformat())
        chore_final = _build_chore_final(seq, last_date)
        all_events = events + [chore_final]

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
        print(f"Dry run — {len(sorted_events)} commit(s) would be generated:\n")
        for i, ctx in enumerate(sorted_events):
            print(f"  [{i+1:4d}] {ctx.date}  {ctx.subject}")
        print(f"\nTotal: {len(sorted_events)} commit(s).")
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
    log.info("Generating git fast-import stream (mode=%s) ...",
             "rebuild" if args.rebuild else ("append" if append else "fresh"))
    stream = _make_fast_import_stream(all_events, append=append, rebuild=args.rebuild)
    log.info("Stream size: %d bytes", len(stream))

    if not stream:
        log.info("No events to import — nothing to do.")
        return

    # Pipe to git fast-import
    # If data_root is a worktree, git -C data_root still works
    cmd = ["git", "-C", str(data_root), "fast-import", "--force", "--quiet"]
    if not append and not args.rebuild:
        # Fresh-import mode: wipe existing historial branch first.
        # Rebuild mode already wipes via the in-stream `reset` (atomic, no race
        # with fast-import) so we don't need to pre-delete.
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
