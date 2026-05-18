"""
Rebuild the git history with:
- Commit dates set to actual historical event dates
- Parliamentary session data in commit message bodies
- Author: "Ley Chile" <leychile@pisanvs.cl>
- Chronological ordering

Uses git fast-import for efficiency — O(N) in number of commits.
Handles insertion of new laws into the middle of existing history.

Usage:
    python scripts/rebuild_history.py          # full rebuild from law data
    python scripts/rebuild_history.py --dry-run  # show event list without committing
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent

AUTHOR_NAME = "Ley Chile"
AUTHOR_EMAIL = "leychile@pisanvs.cl"

# Commits that touch only these paths are "non-law" base commits to preserve.
BASE_COMMIT_PATH_PREFIXES = (
    "scripts/",
    "README.md",
    ".github/",
    "requirements.txt",
    ".gitignore",
)

# Subjects that definitively identify base non-law commits
BASE_COMMIT_SUBJECTS = {
    "feat: initial scaffold — README, data access utils, and daily sync",
    "docs: traducir README al español",
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Event:
    """Represents one git commit to be created in the rebuilt history."""
    date: str                        # ISO date YYYY-MM-DD
    tipo: str                        # feat | update | derog | chore
    scope: str                       # ley | modificacion | meta | scripts
    ley_numero: str                  # "20000" etc.
    version_date: str                # YYYY-MM-DD version date
    law_dir: str                     # relative path like "leyes/20000"
    message_subject: str
    message_body: str
    files: dict[str, bytes]          # relative path → file content (bytes)
    # Sort tiebreaker: lower = earlier
    _seq: int = field(default=0, compare=False)

    def sort_key(self) -> tuple:
        return (self.date, self._seq)


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def _git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(REPO_ROOT)] + list(args),
        capture_output=True,
        check=check,
    )


def _git_show_file(commit_hash: str, rel_path: str) -> Optional[bytes]:
    """Read file content at a specific commit. Returns None if not found."""
    result = _git("show", f"{commit_hash}:{rel_path}", check=False)
    if result.returncode != 0:
        return None
    return result.stdout


def _git_log_file(rel_path: str) -> list[tuple[str, str]]:
    """
    Return list of (hash, subject) for all commits that touched rel_path,
    in reverse chronological order (newest first).
    """
    result = _git(
        "log", "--all", "--follow", "--format=%H\t%s", "--", rel_path,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        return []
    entries = []
    for line in result.stdout.decode("utf-8", errors="replace").strip().splitlines():
        if "\t" in line:
            h, s = line.split("\t", 1)
            entries.append((h.strip(), s.strip()))
    return entries


def _get_current_branch() -> str:
    result = _git("branch", "--show-current")
    return result.stdout.decode().strip()


def _get_all_commits_on_branch() -> list[dict]:
    """
    Return all commits on HEAD in order oldest→newest with files changed.
    Each entry: {hash, subject, date_iso, files: [rel_path, ...]}
    """
    result = _git(
        "log", "--reverse", "--format=%H\t%s\t%aI",
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        return []

    commits = []
    for line in result.stdout.decode("utf-8", errors="replace").strip().splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        h, s, d = parts[0].strip(), parts[1].strip(), parts[2].strip()
        commits.append({"hash": h, "subject": s, "date_iso": d, "files": []})

    # Get file lists for each commit
    for c in commits:
        r = _git("diff-tree", "--no-commit-id", "-r", "--name-only", c["hash"], check=False)
        if r.returncode == 0:
            c["files"] = [
                f for f in r.stdout.decode("utf-8", errors="replace").strip().splitlines()
                if f
            ]
    return commits


def _is_base_commit(commit: dict) -> bool:
    """Return True if this commit only touches non-law scaffolding files."""
    subject = commit.get("subject", "")
    if subject in BASE_COMMIT_SUBJECTS:
        return True
    files = commit.get("files", [])
    if not files:
        return False
    for f in files:
        is_base = any(f.startswith(p) for p in BASE_COMMIT_PATH_PREFIXES)
        if not is_base:
            return False
    return True


# ---------------------------------------------------------------------------
# LeyChile API helpers (used as fallback when git history lookup fails)
# ---------------------------------------------------------------------------

_LEYCHILE_URL = "https://www.leychile.cl/Consulta/obtxml"
_NS = "http://www.leychile.cl/esquemas"
_last_leychile: float = 0.0


def _leychile_xml_to_md(id_norma: int, version_date: str) -> Optional[bytes]:
    """
    Fetch law text from LeyChile for a specific version and convert to markdown bytes.
    Rate-limited to 1 req/s. Returns None on any failure.
    """
    global _last_leychile
    import re
    from xml.etree import ElementTree as ET

    elapsed = time.monotonic() - _last_leychile
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    try:
        resp = requests.get(
            _LEYCHILE_URL,
            params={"opt": 7, "idNorma": id_norma, "idVersion": version_date},
            headers={"User-Agent": "ley-chile/0.1 (rebuild-history)"},
            timeout=30,
        )
        _last_leychile = time.monotonic()
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception as exc:
        log.warning("LeyChile fetch failed idNorma=%s@%s: %s", id_norma, version_date, exc)
        return None

    def _tag(el: ET.Element) -> str:
        return el.tag.split("}")[-1] if "}" in el.tag else el.tag

    def _child_text(el: ET.Element, local_tag: str) -> str:
        found = el.find(f"{{{_NS}}}{local_tag}")
        return (found.text or "").strip() if found is not None else ""

    def _clean(text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()

    def _ef_to_md(ef: ET.Element) -> str:
        tipo = ef.attrib.get("tipoParte", "")
        derogado = ef.attrib.get("derogado", "") == "derogado"
        text = _clean(_child_text(ef, "Texto"))
        header_prefix = {"Título": "##", "Párrafo": "###"}.get(tipo)
        children_ef = ef.find(f"{{{_NS}}}EstructurasFuncionales")
        children_md = ""
        if children_ef is not None:
            children_md = "\n\n".join(
                _ef_to_md(c) for c in children_ef if _tag(c) == "EstructuraFuncional"
            )
        if tipo == "Artículo":
            body = f"~~{text}~~" if derogado else text
            return body + ("\n\n" + children_md if children_md else "")
        if header_prefix and text:
            first_line = text.splitlines()[0] if text else ""
            heading = f"{header_prefix} {'~~' + _clean(first_line) + '~~' if derogado else _clean(first_line)}"
            return heading + ("\n\n" + children_md if children_md else "")
        parts = ([text] if text else []) + ([children_md] if children_md else [])
        return "\n\n".join(parts)

    ident = root.find(f"{{{_NS}}}Identificador")
    meta = root.find(f"{{{_NS}}}Metadatos")
    encabezado = root.find(f"{{{_NS}}}Encabezado")
    efs_root = root.find(f"{{{_NS}}}EstructurasFuncionales")
    promulgacion = root.find(f"{{{_NS}}}Promulgacion")

    tipo, numero = "", ""
    if ident is not None:
        for tn in ident.findall(f".//{{{_NS}}}TipoNumero"):
            tipo = _child_text(tn, "Tipo")
            numero = _child_text(tn, "Numero")
            break

    titulo = _child_text(meta, "TituloNorma") if meta is not None else ""
    fecha_pub = ident.attrib.get("fechaPublicacion", "") if ident is not None else ""
    fecha_version = root.attrib.get("fechaVersion", "")

    lines = []
    if tipo and numero:
        lines.append(f"# {tipo} N° {numero}")
    if titulo:
        lines.append(f"\n{titulo}")
    if fecha_pub:
        lines.append(f"\n**Publicada:** {fecha_pub}")
    if fecha_version and fecha_version != fecha_pub:
        lines.append(f"**Versión:** {fecha_version}")
    lines.append("")

    if encabezado is not None:
        enc_text = _clean(_child_text(encabezado, "Texto"))
        if enc_text:
            lines.append(enc_text)
            lines.append("")

    if efs_root is not None:
        body_parts = [
            _ef_to_md(ef)
            for ef in efs_root
            if _tag(ef) == "EstructuraFuncional"
        ]
        lines.append("\n\n".join(body_parts))
        lines.append("")

    if promulgacion is not None:
        prom_text = _clean(_child_text(promulgacion, "Texto"))
        if prom_text:
            lines += ["---", "", prom_text]

    md = "\n".join(lines) + "\n"
    return md.encode("utf-8")


# ---------------------------------------------------------------------------
# tramitacion / session info helpers
# ---------------------------------------------------------------------------

def _load_tramitacion(law_dir_path: Path) -> Optional[dict]:
    """Load tramitacion.json from law directory if present."""
    t_path = law_dir_path / "tramitacion.json"
    if not t_path.exists():
        return None
    try:
        return json.loads(t_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.debug("Failed to load tramitacion.json from %s: %s", law_dir_path, exc)
        return None


def _find_closest_tramite(tramitacion: list[dict], target_date: str) -> Optional[dict]:
    """
    Find the tramitación step whose date is closest to (and not after)
    the target_date. Falls back to the last step if none match.
    """
    if not tramitacion:
        return None

    best = None
    best_date = ""
    for step in tramitacion:
        step_date = step.get("fecha", "")
        if not step_date:
            continue
        if step_date <= target_date:
            if step_date > best_date:
                best_date = step_date
                best = step
    return best or tramitacion[-1]


def _find_approval_tramite(tramitacion: list[dict]) -> Optional[dict]:
    """Find the final approval / promulgation step."""
    keywords = ("promulg", "aprobado", "aprobación", "sancion", "sanción",
                "despachado", "tercer trámite")
    for step in reversed(tramitacion):
        desc = (step.get("descripcion", "") + " " + step.get("etapa", "")).lower()
        if any(k in desc for k in keywords):
            return step
    # Fall back to last step
    return tramitacion[-1] if tramitacion else None


def _find_closest_vote(votaciones: list[dict], target_date: str) -> Optional[dict]:
    """Find vote closest to target_date."""
    if not votaciones:
        return None
    best = None
    best_date = ""
    for v in votaciones:
        vdate = v.get("fecha", "")
        if not vdate:
            continue
        if vdate <= target_date:
            if vdate > best_date:
                best_date = vdate
                best = v
    return best or votaciones[0]


def _build_session_body(
    tram_data: Optional[dict],
    version_date: str,
    is_feat: bool = False,
) -> str:
    """
    Build the parliamentary session info block for a commit message body.

    Returns multi-line string like:
        Boletín: 3182-07
        Trámite: Tercer trámite constitucional — Senado
        Sesión: 47ª Ordinaria, C.Diputados, 2004-01-19
        Votación: 67 a favor · 12 en contra · 3 abstenciones
    Or empty string if no data.
    """
    if tram_data is None:
        return ""

    lines = []

    boletin = tram_data.get("boletin")
    if boletin:
        lines.append(f"Boletín: {boletin}")

    tramitacion = tram_data.get("tramitacion", [])
    if tramitacion:
        if is_feat:
            step = _find_approval_tramite(tramitacion)
        else:
            step = _find_closest_tramite(tramitacion, version_date)

        if step:
            etapa = step.get("etapa", "")
            camara = step.get("camara", "")
            sesion = step.get("sesion", "")
            fecha = step.get("fecha", "")
            desc = step.get("descripcion", "")

            if etapa or desc:
                trámite_label = desc if desc else etapa
                if camara:
                    trámite_label = f"{trámite_label} — {camara}"
                lines.append(f"Trámite: {trámite_label}")

            if sesion or fecha:
                sesion_parts = []
                if sesion:
                    sesion_parts.append(f"Sesión {sesion}")
                if camara:
                    sesion_parts.append(camara)
                if fecha:
                    sesion_parts.append(fecha)
                lines.append(", ".join(sesion_parts))

    votaciones = tram_data.get("votaciones_camara", [])
    if votaciones:
        vote = _find_closest_vote(votaciones, version_date)
        if vote:
            afirm = vote.get("afirmativos", 0)
            neg = vote.get("negativos", 0)
            abst = vote.get("abstenciones", 0)
            resultado = vote.get("resultado", "")
            tramite_v = vote.get("tramite", "")
            v_parts = [f"{afirm} a favor", f"{neg} en contra", f"{abst} abstenciones"]
            vote_line = "Votación: " + " · ".join(v_parts)
            if resultado:
                vote_line += f" ({resultado})"
            if tramite_v:
                vote_line += f" — {tramite_v}"
            lines.append(vote_line)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Event building
# ---------------------------------------------------------------------------

def _read_file_at_commit(commit_hash: str, rel_path: str) -> Optional[bytes]:
    return _git_show_file(commit_hash, rel_path)


def _find_commit_for_version(
    file_log: list[tuple[str, str]],
    version_date: str,
    subject_hints: tuple[str, ...] = (),
) -> Optional[str]:
    """
    Given the git log for a file, find the commit hash that corresponds to
    a specific version date. Uses subject line hints first, then falls back
    to chronological matching.
    """
    # Try subject hint match
    for h, s in file_log:
        for hint in subject_hints:
            if hint in s:
                return h

    # Try date in subject
    for h, s in file_log:
        if version_date in s:
            return h

    return None


def _build_events_for_law(
    law_dir: Path,
    scope: str,
    seq_counter: list[int],
) -> list[Event]:
    """
    Build Event objects for all versions of a single law.

    Args:
        law_dir: absolute path to leyes/XXXXX or modificaciones/XXXXX
        scope: "ley" or "modificacion"
        seq_counter: mutable [int] used for global sequence ordering
    """
    events: list[Event] = []

    # Read metadata
    meta_path = law_dir / "metadata.json"
    if not meta_path.exists():
        log.warning("No metadata.json in %s, skipping", law_dir)
        return events

    try:
        metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Failed to read metadata.json in %s: %s", law_dir, exc)
        return events

    numero = metadata.get("numero", law_dir.name)
    fecha_pub = metadata.get("fechaPublicacion", "")
    derogado = metadata.get("derogado", "no derogado")
    titulo = metadata.get("titulo", "")
    id_norma = metadata.get("idNorma", "")

    # Read versiones
    ver_path = law_dir / "versiones.json"
    try:
        versiones = json.loads(ver_path.read_text(encoding="utf-8")) if ver_path.exists() else []
    except Exception:
        versiones = []

    # Load tramitacion if available
    tram_data = _load_tramitacion(law_dir)

    rel_dir = law_dir.relative_to(REPO_ROOT)

    # Get git log for the files in this law directory
    texto_log = _git_log_file(str(rel_dir / "texto.md"))
    meta_log = _git_log_file(str(rel_dir / "metadata.json"))
    ver_log = _git_log_file(str(rel_dir / "versiones.json"))

    # Build a map: version_date → commit hash for texto.md
    # We match by date mentioned in the subject line
    ver_hash_map: dict[str, str] = {}
    for version in versiones:
        vdate = version.get("fecha", "")
        if not vdate:
            continue
        h = _find_commit_for_version(texto_log, vdate)
        if h:
            ver_hash_map[vdate] = h

    # Also map using the full texto log (oldest first for feat)
    if versiones and texto_log:
        # The oldest commit for texto.md is the feat commit
        oldest_hash = texto_log[-1][0]  # texto_log is newest-first
        first_ver = versiones[0].get("fecha", "") if versiones else ""
        if first_ver and first_ver not in ver_hash_map:
            ver_hash_map[first_ver] = oldest_hash

    # Helper to get current file bytes from disk
    def _current_bytes(filename: str) -> bytes:
        p = law_dir / filename
        if p.exists():
            return p.read_bytes()
        return b""

    def _historical_bytes(filename: str, version_date: str, fallback: bool = True) -> bytes:
        """Try to get file content at specific version.

        Falls back to LeyChile API for texto.md, then to current bytes.
        """
        h = ver_hash_map.get(version_date)
        if h:
            content = _git_show_file(h, str(rel_dir / filename))
            if content is not None:
                return content
        if fallback and filename == "texto.md" and id_norma:
            fetched = _leychile_xml_to_md(int(id_norma), version_date)
            if fetched is not None:
                log.info("  LeyChile fallback: fetched texto.md for idNorma=%s@%s", id_norma, version_date)
                return fetched
        if fallback:
            return _current_bytes(filename)
        return b""

    # tramitacion.json bytes (same for all versions — read once)
    tram_bytes: Optional[bytes] = None
    tram_path = law_dir / "tramitacion.json"
    if tram_path.exists():
        tram_bytes = tram_path.read_bytes()

    def _make_files(version_date: str, include_tram: bool = True) -> dict[str, bytes]:
        f: dict[str, bytes] = {}
        f[str(rel_dir / "texto.md")] = _historical_bytes("texto.md", version_date)
        f[str(rel_dir / "metadata.json")] = _historical_bytes("metadata.json", version_date)
        f[str(rel_dir / "versiones.json")] = _historical_bytes("versiones.json", version_date)
        if include_tram and tram_bytes is not None:
            f[str(rel_dir / "tramitacion.json")] = tram_bytes
        return f

    # Process each version
    for i, version in enumerate(versiones):
        vdate = version.get("fecha", "")
        if not vdate:
            continue

        committed = version.get("committed", False)
        modificada_por = version.get("modificadaPor")
        is_first = i == 0
        is_last = i == len(versiones) - 1

        # For the feat event, use fechaPublicacion from metadata (not the first version date,
        # which may be later than actual publication if LeyChile only tracked versions from a
        # certain point — e.g. Ley 18403 published 1985 but first tracked version is 1995).
        event_date = vdate
        if is_first and fecha_pub and fecha_pub < vdate:
            event_date = fecha_pub

        # Determine event tipo and commit message
        if is_last and derogado == "derogado" and not is_first:
            # Last version of a derogated law → derog commit
            tipo = "derog"
            subject = f"derog({scope}): Ley {numero} derogada"
            message_body = titulo
        elif is_first:
            tipo = "feat"
            subject = f"feat({scope}): Ley {numero} publicada"
            body_lines = []
            if titulo:
                body_lines.append(titulo)
                body_lines.append("")
            if id_norma:
                body_lines.append(f"BCN idNorma={id_norma}")
            if fecha_pub:
                body_lines.append(f"Publicación: {fecha_pub}")
            session_block = _build_session_body(tram_data, vdate, is_feat=True)
            if session_block:
                body_lines.append("")
                body_lines.append(session_block)
            message_body = "\n".join(body_lines).strip()

        elif modificada_por:
            tipo = "update"
            mod_numero = modificada_por.get("numero", "")
            mod_titulo = modificada_por.get("titulo", "")
            subject = f"update({scope}): Ley {numero} modificada por Ley {mod_numero} — versión {vdate}"
            body_lines = []
            if mod_titulo:
                body_lines.append(f"Modificada por: {mod_titulo}")
                body_lines.append("")
            if id_norma:
                body_lines.append(f"BCN idNorma={id_norma}")
            session_block = _build_session_body(tram_data, vdate, is_feat=False)
            if session_block:
                body_lines.append("")
                body_lines.append(session_block)
            message_body = "\n".join(body_lines).strip()

        else:
            tipo = "update"
            subject = f"update({scope}): Ley {numero} modificada — versión {vdate}"
            body_lines = []
            if titulo:
                body_lines.append(titulo)
                body_lines.append("")
            if id_norma:
                body_lines.append(f"BCN idNorma={id_norma}")
            session_block = _build_session_body(tram_data, vdate, is_feat=False)
            if session_block:
                body_lines.append("")
                body_lines.append(session_block)
            message_body = "\n".join(body_lines).strip()

        seq_counter[0] += 1
        events.append(Event(
            date=event_date,
            tipo=tipo,
            scope=scope,
            ley_numero=numero,
            version_date=vdate,
            law_dir=str(rel_dir),
            message_subject=subject,
            message_body=message_body,
            files=_make_files(vdate),
            _seq=seq_counter[0],
        ))

    # For single-version derogated laws (published and immediately derogated),
    # add a separate derog event after the feat.
    if derogado == "derogado" and len(versiones) == 1:
        last_ver = versiones[-1]
        derog_date = last_ver.get("fecha", "")
        if derog_date:
            seq_counter[0] += 1
            events.append(Event(
                date=derog_date,
                tipo="derog",
                scope=scope,
                ley_numero=numero,
                version_date=derog_date,
                law_dir=str(rel_dir),
                message_subject=f"derog({scope}): Ley {numero} derogada",
                message_body=titulo,
                files=_make_files(derog_date),
                _seq=seq_counter[0],
            ))

    return events


def _build_chore_events(
    law_events: list[Event],
    seq_counter: list[int],
) -> list[Event]:
    """
    Build chore(meta) events for graph.json updates and versiones enrichment.
    These are placed just after the last law event they touch.

    We read the existing git history to find chore commits and reconstruct them.
    """
    events: list[Event] = []

    all_commits = _get_all_commits_on_branch()
    chore_commits = [c for c in all_commits if c["subject"].startswith("chore(meta)")]

    # For each chore commit, find the latest law_event date among touched files
    # and schedule the chore 1 second after.
    for c in chore_commits:
        subject = c["subject"]
        files_changed = c["files"]

        # Collect file contents at this commit
        file_bytes: dict[str, bytes] = {}
        for f in files_changed:
            content = _git_show_file(c["hash"], f)
            if content is not None:
                file_bytes[f] = content

        if not file_bytes:
            continue

        # Find the event date to anchor this chore to
        # Look for law events whose law_dir matches any touched file
        anchor_date = ""
        for ev in law_events:
            for f in files_changed:
                if f.startswith(ev.law_dir + "/") or f == ev.law_dir:
                    if ev.date > anchor_date:
                        anchor_date = ev.date

        if not anchor_date:
            # Fall back to commit date
            anchor_date = c["date_iso"][:10] if c["date_iso"] else "2000-01-01"

        seq_counter[0] += 1
        events.append(Event(
            date=anchor_date,
            tipo="chore",
            scope="meta",
            ley_numero="",
            version_date=anchor_date,
            law_dir="",
            message_subject=subject,
            message_body="",
            files=file_bytes,
            _seq=seq_counter[0],
        ))

    return events


def _build_scripts_events(seq_counter: list[int]) -> list[Event]:
    """
    Build events for non-law 'scripts' commits (feat(scripts), refactor, etc.)
    These go at the very beginning (before any law commits) or after base commits.
    They preserve original ordering and timestamps.
    """
    events: list[Event] = []
    all_commits = _get_all_commits_on_branch()

    # Non-base, non-law commits that aren't chore(meta)
    for c in all_commits:
        subject = c["subject"]
        if _is_base_commit(c):
            continue
        # Skip law/modification commits
        if any(subject.startswith(p) for p in (
            "feat(ley)", "feat(modificacion)", "update(ley)", "update(modificacion)",
            "derog(ley)", "derog(modificacion)", "chore(meta)",
        )):
            continue

        # This is a scripts/tooling commit — place it at a very early date
        # so it stays before law commits, but preserve relative order.
        files_changed = c["files"]
        file_bytes: dict[str, bytes] = {}
        for f in files_changed:
            content = _git_show_file(c["hash"], f)
            if content is not None:
                file_bytes[f] = content

        if not file_bytes:
            continue

        # Use original commit date (these are tooling, not historical law dates)
        commit_date = c["date_iso"][:10] if c["date_iso"] else "2026-01-01"

        seq_counter[0] += 1
        events.append(Event(
            date=commit_date,
            tipo="scripts",
            scope="scripts",
            ley_numero="",
            version_date=commit_date,
            law_dir="",
            message_subject=subject,
            message_body="",
            files=file_bytes,
            _seq=seq_counter[0],
        ))

    return events


def _collect_all_law_events(seq_counter: list[int]) -> list[Event]:
    """Walk leyes/ and modificaciones/ to build all law events."""
    events: list[Event] = []

    for subdir, scope in [("leyes", "ley"), ("modificaciones", "modificacion")]:
        base = REPO_ROOT / subdir
        if not base.is_dir():
            continue
        for law_dir in sorted(base.iterdir()):
            if not law_dir.is_dir():
                continue
            log.info("Processing %s/%s ...", subdir, law_dir.name)
            law_events = _build_events_for_law(law_dir, scope, seq_counter)
            events.extend(law_events)

    return events


# ---------------------------------------------------------------------------
# git fast-import stream generation
# ---------------------------------------------------------------------------

def _date_to_unix(date_str: str, seq: int = 0) -> int:
    """
    Convert YYYY-MM-DD to Unix timestamp (noon UTC on that day).
    Uses seq to break ties within the same day.
    """
    try:
        d = datetime.date.fromisoformat(date_str)
        dt = datetime.datetime(d.year, d.month, d.day, 12, 0, 0,
                               tzinfo=datetime.timezone.utc)
        return int(dt.timestamp()) + seq
    except Exception:
        return 0


def _make_fast_import_stream(
    base_commits: list[dict],
    law_events: list[Event],
    target_branch: str,
) -> bytes:
    """
    Generate a git fast-import stream.

    Layout:
    1. Base commits (scaffold, docs) — kept as-is with original content/dates
    2. Law events (feat/update/derog/chore/scripts) — sorted by date

    Returns bytes to pipe to `git fast-import`.
    """
    stream_parts: list[bytes] = []
    mark = 0

    def next_mark() -> int:
        nonlocal mark
        mark += 1
        return mark

    parent_mark: Optional[int] = None

    def encode(s: str) -> bytes:
        return s.encode("utf-8")

    def write_commit(
        subject: str,
        body: str,
        author_name: str,
        author_email: str,
        unix_ts: int,
        files: dict[str, bytes],
        m: int,
        parent_m: Optional[int],
        delete_files: Optional[list[str]] = None,
    ) -> None:
        msg = subject
        if body and body.strip():
            msg = subject + "\n\n" + body.strip() + "\n"
        msg_bytes = msg.encode("utf-8")

        ts_str = f"{unix_ts} +0000"
        author_line = f"author {author_name} <{author_email}> {ts_str}"
        committer_line = f"committer {author_name} <{author_email}> {ts_str}"

        commit_header = (
            f"commit refs/heads/{target_branch}\n"
            f"mark :{m}\n"
            f"{author_line}\n"
            f"{committer_line}\n"
            f"data {len(msg_bytes)}\n"
        )
        stream_parts.append(encode(commit_header))
        stream_parts.append(msg_bytes)
        stream_parts.append(b"\n")

        if parent_m is not None:
            stream_parts.append(encode(f"from :{parent_m}\n"))

        for rel_path, content in files.items():
            file_header = f"M 100644 inline {rel_path}\ndata {len(content)}\n"
            stream_parts.append(encode(file_header))
            stream_parts.append(content)
            stream_parts.append(b"\n")

        if delete_files:
            for rel_path in delete_files:
                stream_parts.append(encode(f"D {rel_path}\n"))

        stream_parts.append(b"\n")

    # --- Phase 1: base commits ---
    for c in base_commits:
        m = next_mark()
        unix_ts = int(
            datetime.datetime.fromisoformat(
                c["date_iso"].replace("Z", "+00:00")
            ).timestamp()
        ) if c.get("date_iso") else 0

        files_bytes: dict[str, bytes] = {}
        for f in c["files"]:
            content = _git_show_file(c["hash"], f)
            if content is not None:
                files_bytes[f] = content

        write_commit(
            subject=c["subject"],
            body="",
            author_name=AUTHOR_NAME,
            author_email=AUTHOR_EMAIL,
            unix_ts=unix_ts,
            files=files_bytes,
            m=m,
            parent_m=parent_mark,
        )
        parent_mark = m

    # --- Phase 2: law events sorted chronologically ---
    sorted_events = sorted(law_events, key=lambda e: e.sort_key())

    for i, ev in enumerate(sorted_events):
        m = next_mark()
        unix_ts = _date_to_unix(ev.date, seq=i)

        write_commit(
            subject=ev.message_subject,
            body=ev.message_body,
            author_name=AUTHOR_NAME,
            author_email=AUTHOR_EMAIL,
            unix_ts=unix_ts,
            files=ev.files,
            m=m,
            parent_m=parent_mark,
        )
        parent_mark = m

    # Final reset to point the branch at the last mark
    stream_parts.append(encode(f"reset refs/heads/{target_branch}\nfrom :{mark}\n\n"))

    return b"".join(stream_parts)


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def build_event_list(dry_run: bool = False) -> list[Event]:
    """Build and return the full sorted event list."""
    seq_counter = [0]

    log.info("Collecting law events from leyes/ and modificaciones/ ...")
    law_events = _collect_all_law_events(seq_counter)
    log.info("Found %d law version events", len(law_events))

    log.info("Collecting chore(meta) events ...")
    chore_events = _build_chore_events(law_events, seq_counter)
    log.info("Found %d chore events", len(chore_events))

    log.info("Collecting scripts/tooling events ...")
    scripts_events = _build_scripts_events(seq_counter)
    log.info("Found %d scripts events", len(scripts_events))

    all_events = law_events + chore_events + scripts_events
    all_events.sort(key=lambda e: e.sort_key())

    if dry_run:
        print(f"\n{'Date':<12} {'Type':<8} {'Scope':<14} {'Subject'}")
        print("-" * 80)
        for ev in all_events:
            print(f"{ev.date:<12} {ev.tipo:<8} {ev.scope:<14} {ev.message_subject[:50]}")
        print(f"\nTotal: {len(all_events)} events")

    return all_events


def rebuild(dry_run: bool = False) -> None:
    target_branch = _get_current_branch()
    if not target_branch:
        log.error("Cannot determine current branch. Are you in a git repo?")
        sys.exit(1)

    log.info("Target branch: %s", target_branch)

    # Collect base (non-law) commits to preserve at bottom of history
    all_commits = _get_all_commits_on_branch()
    base_commits = [c for c in all_commits if _is_base_commit(c)]
    log.info("Found %d base commits to preserve", len(base_commits))

    # Build all events
    all_events = build_event_list(dry_run=dry_run)

    if dry_run:
        return

    log.info("Generating git fast-import stream ...")
    stream = _make_fast_import_stream(base_commits, all_events, target_branch)
    log.info("Stream size: %d bytes", len(stream))

    # Pipe to git fast-import
    log.info("Running git fast-import ...")
    proc = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "fast-import", "--force", "--quiet"],
        input=stream,
        capture_output=True,
    )
    if proc.returncode != 0:
        log.error("git fast-import failed:\n%s", proc.stderr.decode("utf-8", errors="replace"))
        sys.exit(1)

    log.info("git fast-import succeeded.")

    # Reset working tree to match new HEAD
    log.info("Resetting working tree ...")
    reset_proc = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "reset", "--hard", f"refs/heads/{target_branch}"],
        capture_output=True,
    )
    if reset_proc.returncode != 0:
        log.warning(
            "git reset --hard failed: %s",
            reset_proc.stderr.decode("utf-8", errors="replace"),
        )
    else:
        log.info("Working tree reset to rebuilt history.")

    # Show summary
    result = _git("log", "--oneline", "-20", check=False)
    if result.returncode == 0:
        log.info("Last 20 commits:\n%s", result.stdout.decode("utf-8", errors="replace"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild git history with historical dates and parliamentary session data."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print event list without modifying git history",
    )
    args = parser.parse_args()
    rebuild(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
