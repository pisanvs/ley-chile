"""
Build the complete legislative graph starting from a root norma.

Traces backward (what it substituted/derogated) and forward (what modified it),
then commits every law's full version history in chronological order.

Graph relationships are sourced from datos.bcn.cl JSON endpoints
(https://datos.bcn.cl/recurso/cl/ley/{numero}/datos.json), which are fast
and require no SPARQL. Laws too recent to appear in the BCN dataset are
listed in KNOWN_RECENT as a fallback.

Laws are classified as:
  - leyes/          substantive laws with their own subject matter
  - modificaciones/ laws whose primary purpose is amending other laws

Each version commit references the modifying law that caused the change.

Usage:
    python scripts/trace_graph.py --id 235507 --ley 20000

The script is idempotent: already-committed versions are skipped.
Builds/updates graph.json at the repo root.
"""

import argparse
import json
import logging
import re
import subprocess
import time
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent

import os as _os

def _detect_data_root() -> Path:
    """Auto-detect where law data lives: historial/ worktree, env var, or fallback to repo root."""
    env = _os.environ.get("LEYCHILE_DATA_ROOT")
    if env:
        return Path(env).resolve()
    hist = REPO_ROOT / "historial"
    if hist.is_dir() and (hist / ".git").exists():
        return hist
    return REPO_ROOT

DATA_ROOT = _detect_data_root()

NS = "http://www.leychile.cl/esquemas"
LEYCHILE_URL = "https://www.leychile.cl/Consulta/obtxml"
BCN_BASE = "https://datos.bcn.cl/recurso/cl"
UA = "ley-chile/0.1 (https://github.com/pisanvs/ley-chile; civic open data)"

# SPARQL dataset lags ~1-2 years. Hardcode recent modifiers not yet indexed.
# Format: id_norma → {"numero": str, "titulo": str, "fecha": str, "modifies": [id_norma, ...]}
KNOWN_RECENT: dict[int, dict] = {
    1192530: {
        "numero": "21575",
        "titulo": "MODIFICA DIVERSOS CUERPOS LEGALES CON EL OBJETO DE MEJORAR LA PERSECUCIÓN DEL NARCOTRÁFICO Y CRIMEN ORGANIZADO, REGULAR EL DESTINO DE LOS BIENES INCAUTADOS EN ESOS DELITOS Y FORTALECER LAS INSTITUCIONES DE REHABILITACIÓN Y REINSERCIÓN SOCIAL",
        "fecha": "2023-05-23",
        "modifies": [235507],  # modifies Ley 20000
    },
    1206373: {
        "numero": "21694",
        "titulo": "MODIFICA LOS CUERPOS LEGALES QUE INDICA PARA MEJORAR LA PERSECUCIÓN PENAL EN MATERIA DE REINCIDENCIA Y DELITOS DE MAYOR CONNOTACIÓN SOCIAL",
        "fecha": "2024-09-04",
        "modifies": [235507],  # modifies Ley 20000
    },
}

# Predecessor chain: laws derogated/substituted by the root law (backward traversal).
# Auto-traversal of modifiesTo would pull in too many unrelated laws, so we seed
# the chain explicitly. Add further predecessors here to extend backward coverage.
EXTRA_SEEDS: list[int] = [
    29815,   # Ley 18403 — original drug law (derogated by Ley 19366)
    30733,   # Ley 19366 — predecessor derogated by Ley 20000
]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

_last_request: dict[str, float] = {}


def _rate_limited_get(url: str, params: dict = {}, delay: float = 1.0) -> requests.Response:
    from urllib.parse import urlparse
    host = urlparse(url).netloc
    last = _last_request.get(host, 0.0)
    elapsed = time.monotonic() - last
    if elapsed < delay:
        time.sleep(delay - elapsed)
    resp = requests.get(url, params=params, headers={"User-Agent": UA}, timeout=30)
    _last_request[host] = time.monotonic()
    resp.raise_for_status()
    return resp


def fetch_norma_xml(id_norma: int, version_date: str | None = None) -> ET.Element:
    params: dict = {"opt": 7, "idNorma": id_norma}
    if version_date:
        params["idVersion"] = version_date
    resp = _rate_limited_get(LEYCHILE_URL, params)
    return ET.fromstring(resp.content)


def fetch_norma_xml_by_ley(numero: str) -> ET.Element:
    """Fetch norma XML by ley number (LeyChile resolves idNorma from number)."""
    resp = _rate_limited_get(LEYCHILE_URL, {"opt": 7, "idLey": numero})
    return ET.fromstring(resp.content)


def _bcn_json(tipo: str, numero: str | int, retries: int = 4) -> dict | None:
    """
    Fetch the datos.bcn.cl RDF/JSON document for a norma.

    URL pattern: https://datos.bcn.cl/recurso/cl/{tipo}/{numero}/datos.json
    Returns a dict with RDF predicates ('isModifiedBy', 'modifiesTo', etc.)
    from the first entry in the response (any version entry works, they all
    carry the full relationship graph).
    """
    url = f"{BCN_BASE}/{tipo}/{numero}/datos.json"
    retry_delay = 2.0
    for attempt in range(retries):
        try:
            resp = _rate_limited_get(url, delay=0.3)
            resp.raise_for_status()
            data = resp.json()
            # Response is {uri: {...predicates...}}; all entries share the same relationships.
            if data:
                return next(iter(data.values()))
            return None
        except Exception as exc:
            log.warning("BCN JSON attempt %d/%d for %s/%s: %s", attempt + 1, retries, tipo, numero, exc)
            time.sleep(retry_delay)
            retry_delay *= 2
    return None


def _bcn_objs(node: dict, predicate_local: str) -> list[dict]:
    """Return the list of RDF objects for a short predicate name in a BCN JSON node."""
    prefix = "http://datos.bcn.cl/ontologies/bcn-norms#"
    return node.get(prefix + predicate_local, [])


def _bcn_literal(node: dict, predicate_local: str) -> str:
    objs = _bcn_objs(node, predicate_local)
    return str(objs[0]["value"]) if objs else ""


def _uri_to_ley_numero(uri: str) -> str | None:
    """Extract the ley number from a BCN URI like .../cl/ley/.../20000 or .../20000/es@..."""
    # strip version suffix
    base = uri.split("/es@")[0]
    parts = base.rstrip("/").split("/")
    # expect parts[-1] to be the law number, parts[-3] to be "ley"
    try:
        idx = parts.index("ley")
        return parts[idx + 3]  # .../ley/{organismo}/{fecha}/{numero}
    except (ValueError, IndexError):
        return None


# ---------------------------------------------------------------------------
# BCN JSON graph queries
# ---------------------------------------------------------------------------

def get_bcn_info(tipo: str, numero: str | int) -> dict | None:
    """
    Return a dict with idNorma, isModifiedBy, and modifiesTo for a norma,
    sourced from the datos.bcn.cl JSON endpoint.
    """
    node = _bcn_json(tipo, numero)
    if node is None:
        return None

    id_norma_raw = _bcn_literal(node, "leychileCode")
    id_norma = int(id_norma_raw) if str(id_norma_raw).isdigit() else None

    def _extract_refs(pred: str) -> list[dict]:
        result = []
        for obj in _bcn_objs(node, pred):
            uri = obj.get("value", "")
            ley_num = _uri_to_ley_numero(uri)
            result.append({"uri": uri, "numero": ley_num})
        return result

    fecha = _bcn_literal(node, "publishDate")

    return {
        "idNorma": id_norma,
        "fecha": fecha,
        "isModifiedBy": _extract_refs("isModifiedBy"),
        "modifiesTo": _extract_refs("modifiesTo"),
    }


# ---------------------------------------------------------------------------
# XML parsing
# ---------------------------------------------------------------------------

def _tag(el: ET.Element) -> str:
    return el.tag.split("}")[-1] if "}" in el.tag else el.tag


def _child_text(el: ET.Element, local_tag: str) -> str:
    found = el.find(f"{{{NS}}}{local_tag}")
    return (found.text or "").strip() if found is not None else ""


def _clean(text: str) -> str:
    """Normalize whitespace. Collapses all internal whitespace to single spaces —
    line breaks inside XML text nodes are OCR/formatting artifacts, not structure."""
    return re.sub(r"\s+", " ", text).strip()


def _ef_to_md(ef: ET.Element) -> str:
    tipo = ef.attrib.get("tipoParte", "")
    derogado = ef.attrib.get("derogado", "") == "derogado"
    text = _clean(_child_text(ef, "Texto"))
    header_prefix = {"Título": "##", "Párrafo": "###"}.get(tipo)
    children_ef = ef.find(f"{{{NS}}}EstructurasFuncionales")
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


def xml_to_markdown(root: ET.Element) -> str:
    ident = root.find(f"{{{NS}}}Identificador")
    meta = root.find(f"{{{NS}}}Metadatos")
    encabezado = root.find(f"{{{NS}}}Encabezado")
    efs_root = root.find(f"{{{NS}}}EstructurasFuncionales")
    promulgacion = root.find(f"{{{NS}}}Promulgacion")

    tipo, numero = "", ""
    if ident is not None:
        for tn in ident.findall(f".//{{{NS}}}TipoNumero"):
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

    return "\n".join(lines) + "\n"


def extract_metadata(root: ET.Element) -> dict:
    ident = root.find(f"{{{NS}}}Identificador")
    meta = root.find(f"{{{NS}}}Metadatos")
    tipo, numero = "", ""
    if ident is not None:
        for tn in ident.findall(f".//{{{NS}}}TipoNumero"):
            tipo = _child_text(tn, "Tipo")
            numero = _child_text(tn, "Numero")
            break
    organismos = [
        org.text.strip()
        for org in (ident.findall(f".//{{{NS}}}Organismo") if ident is not None else [])
        if org.text
    ]
    return {
        "idNorma": int(root.attrib.get("normaId", 0)),
        "tipo": tipo,
        "numero": numero,
        "titulo": _child_text(meta, "TituloNorma") if meta is not None else "",
        "organismos": organismos,
        "fechaPublicacion": ident.attrib.get("fechaPublicacion", "") if ident is not None else "",
        "fechaPromulgacion": ident.attrib.get("fechaPromulgacion", "") if ident is not None else "",
        "fechaVersion": root.attrib.get("fechaVersion", ""),
        "derogado": root.attrib.get("derogado", "no derogado"),
    }


def extract_version_dates(root: ET.Element) -> list[str]:
    dates = set()
    for el in root.iter():
        d = el.attrib.get("fechaVersion", "")
        if d and d[:4].isdigit() and int(d[:4]) <= 2100:  # filter sentinel dates like 2222-02-02
            dates.add(d)
    return sorted(dates)


# ---------------------------------------------------------------------------
# Law classification
# ---------------------------------------------------------------------------

_MODIF_PREFIXES = (
    "MODIFICA ",
    "INTRODUCE MODIFICACIONES",
    "NORMAS ADECUATORIAS",
    "DEROGA ",
    "MODIFÍCASE",
)


def classify(titulo: str) -> str:
    """Return 'modificatoria' or 'sustantiva'."""
    t = (titulo or "").upper().strip()
    return "modificatoria" if any(t.startswith(p) for p in _MODIF_PREFIXES) else "sustantiva"


def law_dir(numero: str, clasificacion: str) -> Path:
    folder = "modificaciones" if clasificacion == "modificatoria" else "leyes"
    return DATA_ROOT / folder / numero


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def committed_version_dates(dest: Path) -> set[str]:
    vf = dest / "versiones.json"
    if not vf.exists():
        return set()
    return {v["fecha"] for v in json.loads(vf.read_text()) if v.get("committed")}


def git_add_commit(paths: list[Path], message: str) -> bool:
    existing = [str(p) for p in paths if p.exists()]
    if not existing:
        return False
    subprocess.run(["git", "-C", str(DATA_ROOT), "add", "--"] + existing, check=True)
    result = subprocess.run(
        ["git", "-C", str(DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if result.returncode == 0:
        return False  # nothing staged
    subprocess.run(["git", "-C", str(DATA_ROOT), "commit", "-m", message], check=True)
    return True


def build_commit_message(
    metadata: dict,
    version_date: str,
    is_first: bool,
    clasificacion: str,
    modifier: dict | None = None,
) -> str:
    tipo = metadata.get("tipo", "Ley")
    numero = metadata.get("numero", "")
    titulo = metadata.get("titulo", "")
    id_norma = metadata.get("idNorma", "")
    fecha_pub = metadata.get("fechaPublicacion", "")
    derogado = metadata.get("derogado", "") == "derogado"

    scope = "modificacion" if clasificacion == "modificatoria" else "ley"

    if is_first:
        commit_type = "feat"
        verb = "publicada"
    elif derogado:
        commit_type = "derog"
        verb = "derogada"
    else:
        commit_type = "update"
        if modifier:
            verb = f"modificada por Ley {modifier['numero']} — versión {version_date}"
        else:
            verb = f"modificada — versión {version_date}"

    subject = f"{commit_type}({scope}): {tipo} {numero} {verb}"

    body_lines = []
    if titulo:
        body_lines += [titulo, ""]
    body_lines.append(f"BCN idNorma={id_norma}")
    if fecha_pub and is_first:
        body_lines.append(f"Publicación: {fecha_pub}")
    if modifier:
        mod_titulo = modifier.get("titulo", "")[:70]
        mod_dir = law_dir(modifier["numero"], classify(modifier.get("titulo", "")))
        body_lines.append(f"Modificadora: Ley {modifier['numero']} — {mod_titulo}")
        body_lines.append(f"Ver: {mod_dir.relative_to(DATA_ROOT)}/")

    body = "\n".join(body_lines)
    return f"{subject}\n\n{body}\n"


# ---------------------------------------------------------------------------
# Core trace logic
# ---------------------------------------------------------------------------

def load_versions_file(dest: Path) -> list[dict]:
    vf = dest / "versiones.json"
    return json.loads(vf.read_text()) if vf.exists() else []


def save_versions_file(dest: Path, versions: list[dict]) -> None:
    (dest / "versiones.json").write_text(
        json.dumps(versions, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def trace_one_law(
    id_norma: int,
    modifier_map: dict[str, dict],  # fecha → modifier info (numero, titulo, idNorma)
) -> None:
    """Fetch all versions of a law and commit each one."""
    log.info("Tracing idNorma=%d ...", id_norma)
    root = fetch_norma_xml(id_norma)
    metadata = extract_metadata(root)
    version_dates = extract_version_dates(root)
    numero = metadata["numero"]
    titulo = metadata.get("titulo", "")
    clasificacion = classify(titulo)
    dest = law_dir(numero, clasificacion)
    dest.mkdir(parents=True, exist_ok=True)

    already_done = committed_version_dates(dest)
    known_versions = load_versions_file(dest)

    for i, vdate in enumerate(version_dates):
        modifier = modifier_map.get(vdate)

        if vdate in already_done:
            # Retroactively enrich versiones.json with modifier info if missing
            for v in known_versions:
                if v["fecha"] == vdate and modifier and "modificadaPor" not in v:
                    v["modificadaPor"] = modifier
                    log.info("Enriched versiones.json for %s @ %s", numero, vdate)
            continue

        log.info("  Version %s (%d/%d) ...", vdate, i + 1, len(version_dates))
        try:
            vroot = fetch_norma_xml(id_norma, vdate)
        except Exception as exc:
            log.error("  Failed to fetch %s@%s: %s", numero, vdate, exc)
            continue

        vmeta = extract_metadata(vroot)
        markdown = xml_to_markdown(vroot)

        (dest / "texto.md").write_text(markdown, encoding="utf-8")
        (dest / "metadata.json").write_text(
            json.dumps(vmeta, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        entry: dict = {"fecha": vdate, "committed": True}
        if modifier:
            entry["modificadaPor"] = modifier
        known_versions = [v for v in known_versions if v["fecha"] != vdate]
        known_versions.append(entry)
        known_versions.sort(key=lambda v: v["fecha"])
        save_versions_file(dest, known_versions)

        msg = build_commit_message(
            vmeta, vdate, is_first=(i == 0), clasificacion=clasificacion, modifier=modifier
        )
        committed = git_add_commit(
            [dest / "texto.md", dest / "metadata.json", dest / "versiones.json"],
            msg,
        )
        if committed:
            log.info("  Committed %s @ %s", numero, vdate)

    # Save enriched versions file even if nothing new was committed
    if known_versions:
        save_versions_file(dest, known_versions)
        subprocess.run(
            ["git", "-C", str(DATA_ROOT), "add", "--", str(dest / "versiones.json")],
            check=True,
        )
        result = subprocess.run(
            ["git", "-C", str(DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
        )
        if result.returncode != 0:
            subprocess.run(
                ["git", "-C", str(DATA_ROOT), "commit", "-m",
                 f"chore(meta): enriquecer versiones.json de Ley {numero} con modificadoras"],
                check=True,
            )


# ---------------------------------------------------------------------------
# Graph discovery and orchestration
# ---------------------------------------------------------------------------

def fetch_metadata_batch(id_normas: list[int]) -> dict[int, dict]:
    """Fetch LeyChile metadata for a list of idNormas. Returns {idNorma: metadata}."""
    result = {}
    for id_norma in id_normas:
        try:
            root = fetch_norma_xml(id_norma)
            result[id_norma] = extract_metadata(root)
        except Exception as exc:
            log.error("Could not fetch metadata for idNorma=%d: %s", id_norma, exc)
    return result


def build_graph(root_id_norma: int, skip_sparql: bool = False) -> dict:
    """
    Return a graph dict: {id_norma: {numero, titulo, clasificacion, modifica, modificadaPor}}.

    Inclusion criteria: a law belongs in the graph if and only if it directly
    modifies one of the PRIMARY chain laws (root + EXTRA_SEEDS).

    Uses datos.bcn.cl JSON endpoints (one request per primary-chain law).
    --skip-sparql skips BCN JSON discovery and falls back to KNOWN_RECENT + EXTRA_SEEDS only.
    """
    primary_chain: set[int] = {root_id_norma} | set(EXTRA_SEEDS)
    all_ids: set[int] = set(primary_chain)
    modifiers_by_id: dict[int, list[dict]] = {idn: [] for idn in primary_chain}
    modifica_by_id: dict[int, list[int]] = {idn: [] for idn in primary_chain}

    # Map idNorma → ley numero for primary chain (needed to build BCN URLs)
    # Fetch quickly from LeyChile XML
    primary_numeros: dict[int, str] = {}
    for idn in primary_chain:
        try:
            root = fetch_norma_xml(idn)
            meta = extract_metadata(root)
            primary_numeros[idn] = meta["numero"]
        except Exception as exc:
            log.warning("Could not fetch numero for idNorma=%d: %s", idn, exc)

    if not skip_sparql:
        for id_norma, numero in primary_numeros.items():
            log.info("BCN JSON: fetching relationships for Ley %s ...", numero)
            info = get_bcn_info("ley", numero)
            if info is None:
                log.warning("  No BCN JSON data for Ley %s", numero)
                continue

            for ref in info.get("isModifiedBy", []):
                ref_num = ref.get("numero")
                if not ref_num:
                    continue
                # Resolve idNorma via BCN JSON (avoids extra LeyChile call)
                ref_info = get_bcn_info("ley", ref_num)
                if ref_info and ref_info.get("idNorma"):
                    rid = ref_info["idNorma"]
                    modifiers_by_id[id_norma].append({
                        "idNorma": rid,
                        "numero": ref_num,
                        "fecha": ref_info.get("fecha", ""),
                    })
                    all_ids.add(rid)
                else:
                    log.warning("  Could not resolve modifier Ley %s via BCN JSON", ref_num)

            # Store modifiesTo ley numbers directly from BCN JSON (no extra requests).
            # idNormas are not needed here — the field is informational only.
            modifica_by_id[id_norma] = [
                ref["numero"]
                for ref in info.get("modifiesTo", [])
                if ref.get("numero") and ref["numero"].isdigit()
            ]

            log.info(
                "  isModifiedBy=%d, modifiesTo=%d",
                len(modifiers_by_id[id_norma]), len(modifica_by_id[id_norma]),
            )

    # Apply KNOWN_RECENT on top of JSON results
    for hid, hdata in KNOWN_RECENT.items():
        for target_id in hdata.get("modifies", []):
            if target_id in primary_chain:
                if not any(m.get("idNorma") == hid for m in modifiers_by_id[target_id]):
                    modifiers_by_id[target_id].append({
                        "idNorma": hid,
                        "numero": hdata["numero"],
                        "titulo": hdata["titulo"],
                        "fecha": hdata["fecha"],
                    })
                all_ids.add(hid)

    # Fetch LeyChile metadata for all discovered nodes
    log.info("LeyChile: fetching metadata for %d laws ...", len(all_ids))
    metadata_map = fetch_metadata_batch(list(all_ids))

    # Filter out non-Ley normas (DFLs, Decretos, etc.)
    # Primary chain is trusted as-is; discovered nodes must have tipo == "Ley".
    ley_ids = {
        idn for idn in all_ids
        if metadata_map.get(idn, {}).get("tipo", "") == "Ley"
    }
    all_ids = ley_ids | primary_chain
    modifiers_by_id = {
        idn: [m for m in mods if m.get("idNorma") in all_ids]
        for idn, mods in modifiers_by_id.items()
        if idn in all_ids
    }

    # Assemble graph
    graph: dict[int, dict] = {}
    for id_norma in all_ids:
        meta = metadata_map.get(id_norma, {})
        titulo = meta.get("titulo", "")
        numero = meta.get("numero", "")
        modificada_por = [
            m["idNorma"] for m in modifiers_by_id.get(id_norma, []) if m.get("idNorma")
        ]
        node = {
            "idNorma": id_norma,
            "numero": numero,
            "titulo": titulo,
            "clasificacion": classify(titulo),
            "fechaPublicacion": meta.get("fechaPublicacion", ""),
            "modifica": modifica_by_id.get(id_norma, []),
            "modificadaPor": modificada_por,
        }
        graph[id_norma] = node
        log.info(
            "  %s Ley %s | modifica=%d | modificadaPor=%s",
            node["clasificacion"], numero, len(node["modifica"]),
            [metadata_map.get(m, {}).get("numero", str(m)) for m in modificada_por],
        )

    return graph


def commit_order(graph: dict) -> list[int]:
    """Return idNormas sorted by fechaPublicacion (earliest first)."""
    def sort_key(id_norma: int) -> str:
        return graph.get(id_norma, {}).get("fechaPublicacion", "9999")
    return sorted(graph.keys(), key=sort_key)


def build_modifier_map(graph: dict, id_norma: int) -> dict[str, dict]:
    """
    For a given norma, return {fechaVersion → modifier_info} so that
    each version date can be attributed to the law that caused it.
    """
    node = graph.get(id_norma, {})
    numero = node.get("numero", "")

    # Fetch version dates from LeyChile
    try:
        root = fetch_norma_xml(id_norma)
        version_dates = extract_version_dates(root)
    except Exception:
        return {}

    # Build date → modifier map from the graph's modificadaPor list
    modifier_map: dict[str, dict] = {}
    for mod_id in node.get("modificadaPor", []):
        mod_node = graph.get(mod_id, {})
        if not mod_node:
            continue
        pub_date = mod_node.get("fechaPublicacion", "")
        if pub_date and pub_date in version_dates:
            modifier_map[pub_date] = {
                "numero": mod_node.get("numero", ""),
                "idNorma": mod_id,
                "titulo": mod_node.get("titulo", "")[:100],
            }

    return modifier_map


def write_graph_json(graph: dict) -> None:
    gpath = DATA_ROOT / "graph.json"
    gpath.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    subprocess.run(["git", "-C", str(DATA_ROOT), "add", "--", str(gpath)], check=True)
    result = subprocess.run(
        ["git", "-C", str(DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if result.returncode != 0:
        subprocess.run(
            ["git", "-C", str(DATA_ROOT), "commit", "-m",
             "chore(meta): actualizar graph.json con grafo legislativo completo"],
            check=True,
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Trace the complete legislative graph for a Chilean norma."
    )
    parser.add_argument(
        "--id", type=int, required=True, dest="id_norma", metavar="ID_NORMA",
        help="BCN idNorma of the root law (e.g. 235507 for Ley 20.000)"
    )
    parser.add_argument(
        "--ley", required=True, metavar="NUMERO",
        help="Ley number for logging (e.g. 20000)"
    )
    parser.add_argument(
        "--skip-sparql", action="store_true",
        help="Skip BCN JSON discovery; use only KNOWN_RECENT + EXTRA_SEEDS (fast, offline)"
    )
    args = parser.parse_args()

    log.info("=== Building legislative graph for idNorma=%d ===", args.id_norma)
    graph = build_graph(args.id_norma, skip_sparql=args.skip_sparql)
    log.info("Graph has %d nodes", len(graph))

    order = commit_order(graph)
    log.info("Commit order: %s", [graph[i]["numero"] for i in order])

    for id_norma in order:
        node = graph[id_norma]
        modifier_map = build_modifier_map(graph, id_norma)
        log.info(
            "--- Tracing Ley %s (idNorma=%d, %s) ---",
            node["numero"], id_norma, node["clasificacion"],
        )
        try:
            trace_one_law(id_norma, modifier_map)
        except Exception as exc:
            log.error("Failed to trace idNorma=%d: %s", id_norma, exc)

    write_graph_json(graph)
    log.info("=== Done. ===")


if __name__ == "__main__":
    main()
