"""
Build the complete legislative graph starting from a root norma.

Traces backward (what it substituted/derogated) and forward (what modified it),
then commits every law's full version history in chronological order.

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
NS = "http://www.leychile.cl/esquemas"
LEYCHILE_URL = "https://www.leychile.cl/Consulta/obtxml"
SPARQL_URL = "https://datos.bcn.cl/sparql"
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

_last_request: float = 0.0


def _rate_limited_get(url: str, params: dict, delay: float = 1.0) -> requests.Response:
    global _last_request
    elapsed = time.monotonic() - _last_request
    if elapsed < delay:
        time.sleep(delay - elapsed)
    resp = requests.get(url, params=params, headers={"User-Agent": UA}, timeout=30)
    _last_request = time.monotonic()
    resp.raise_for_status()
    return resp


def fetch_norma_xml(id_norma: int, version_date: str | None = None) -> ET.Element:
    params: dict = {"opt": 7, "idNorma": id_norma}
    if version_date:
        params["idVersion"] = version_date
    resp = _rate_limited_get(LEYCHILE_URL, params)
    return ET.fromstring(resp.content)


def sparql_query(query: str, retries: int = 4) -> list[dict]:
    delay = 2.0
    for attempt in range(retries):
        try:
            resp = requests.get(
                SPARQL_URL,
                params={"query": query, "format": "json"},
                headers={"Accept": "application/sparql-results+json", "User-Agent": UA},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("results", {}).get("bindings", [])
        except Exception as exc:
            log.warning("SPARQL attempt %d/%d failed: %s", attempt + 1, retries, exc)
            time.sleep(delay)
            delay *= 2
    return []


def _v(binding: dict, key: str) -> str:
    return binding.get(key, {}).get("value", "")


# ---------------------------------------------------------------------------
# SPARQL graph queries
# ---------------------------------------------------------------------------

def get_bcn_uris(id_normas: list[int]) -> dict[int, str]:
    """Batch lookup: idNorma → BCN resource URI for a list of normas."""
    if not id_normas:
        return {}
    values = " ".join(str(i) for i in id_normas)
    rows = sparql_query(f"""
        PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
        SELECT ?code ?s WHERE {{
          ?s bcn:leychileCode ?code .
          FILTER(!CONTAINS(STR(?s), "/es@"))
          VALUES ?code {{ {values} }}
        }}""")
    result: dict[int, str] = {}
    for r in rows:
        code_str = _v(r, "code")
        uri = _v(r, "s")
        if code_str.isdigit() and "/ley/" in uri and "/proyecto" not in uri:
            result[int(code_str)] = uri
    return result


def get_modifiers_for_uri(bcn_uri: str) -> list[dict]:
    """Return all laws that modified the given norma URI."""
    rows = sparql_query(f"""
        PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
        SELECT DISTINCT ?s ?titulo ?fecha ?numero ?code WHERE {{
          {{
            ?s bcn:modifiesTo <{bcn_uri}> .
          }} UNION {{
            ?s bcn:modifiesTo ?ver .
            FILTER(STRSTARTS(STR(?ver), "{bcn_uri}/"))
          }}
          FILTER(!CONTAINS(STR(?s), "/es@"))
          OPTIONAL {{ ?s <http://purl.org/dc/elements/1.1/title> ?titulo }}
          OPTIONAL {{ ?s bcn:publishDate ?fecha }}
          OPTIONAL {{ ?s bcn:hasNumber ?numero }}
          OPTIONAL {{ ?s bcn:leychileCode ?code }}
        }} ORDER BY ?fecha""")
    seen: set[str] = set()
    result = []
    for r in rows:
        uri = _v(r, "s")
        if uri in seen:
            continue
        seen.add(uri)
        code_str = _v(r, "code")
        result.append({
            "uri": uri,
            "titulo": _v(r, "titulo"),
            "fecha": _v(r, "fecha"),
            "numero": _v(r, "numero"),
            "idNorma": int(code_str) if code_str.isdigit() else None,
        })
    return result


def get_modifiers_batch(bcn_uris: list[str]) -> dict[str, list[dict]]:
    """Run get_modifiers_for_uri for each URI. One query per URI."""
    return {uri: get_modifiers_for_uri(uri) for uri in bcn_uris}


def get_modifies_targets(bcn_uri: str) -> list[int]:
    """Return idNormas of all laws that the given norma modifies."""
    rows = sparql_query(f"""
        PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
        SELECT DISTINCT ?code WHERE {{
          <{bcn_uri}> bcn:modifiesTo ?target .
          FILTER(!CONTAINS(STR(?target), "/es@"))
          ?target bcn:leychileCode ?code .
        }}""")
    return [int(_v(r, "code")) for r in rows if _v(r, "code").isdigit()]


# ---------------------------------------------------------------------------
# XML parsing
# ---------------------------------------------------------------------------

def _tag(el: ET.Element) -> str:
    return el.tag.split("}")[-1] if "}" in el.tag else el.tag


def _child_text(el: ET.Element, local_tag: str) -> str:
    found = el.find(f"{{{NS}}}{local_tag}")
    return (found.text or "").strip() if found is not None else ""


def _clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    lines = [ln.strip() for ln in text.splitlines()]
    result, blanks = [], 0
    for ln in lines:
        if ln == "":
            blanks += 1
            if blanks <= 1:
                result.append("")
        else:
            blanks = 0
            result.append(ln)
    return "\n".join(result).strip()


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
    return sorted({el.attrib["fechaVersion"] for el in root.iter() if "fechaVersion" in el.attrib})


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
    return REPO_ROOT / folder / numero


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
    subprocess.run(["git", "-C", str(REPO_ROOT), "add", "--"] + existing, check=True)
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if result.returncode == 0:
        return False  # nothing staged
    subprocess.run(["git", "-C", str(REPO_ROOT), "commit", "-m", message], check=True)
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
        body_lines.append(f"Ver: {mod_dir.relative_to(REPO_ROOT)}/")

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
            ["git", "-C", str(REPO_ROOT), "add", "--", str(dest / "versiones.json")],
            check=True,
        )
        result = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "diff", "--cached", "--quiet"], capture_output=True
        )
        if result.returncode != 0:
            subprocess.run(
                ["git", "-C", str(REPO_ROOT), "commit", "-m",
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

    SPARQL is used only for the primary-chain laws (one query per primary law).
    --skip-sparql falls back to KNOWN_RECENT + EXTRA_SEEDS only.
    """
    primary_chain: set[int] = {root_id_norma} | set(EXTRA_SEEDS)
    all_ids: set[int] = set(primary_chain)
    modifiers_by_id: dict[int, list[dict]] = {idn: [] for idn in primary_chain}
    modifica_by_id: dict[int, list[int]] = {idn: [] for idn in primary_chain}

    if not skip_sparql:
        # Resolve BCN URIs for all primary-chain laws in one batched call
        log.info("SPARQL: resolving BCN URIs for %d primary-chain laws ...", len(primary_chain))
        uri_map = get_bcn_uris(list(primary_chain))
        log.info("  Resolved %d/%d URIs", len(uri_map), len(primary_chain))

        # One SPARQL query per primary-chain law to find its modifiers
        for id_norma, bcn_uri in uri_map.items():
            log.info("SPARQL: finding modifiers of idNorma=%d ...", id_norma)
            mods = get_modifiers_for_uri(bcn_uri)
            modifiers_by_id[id_norma] = mods
            for m in mods:
                if m["idNorma"]:
                    all_ids.add(m["idNorma"])
            log.info("  Found %d modifiers", len(mods))

            log.info("SPARQL: finding what idNorma=%d modifies ...", id_norma)
            targets = get_modifies_targets(bcn_uri)
            modifica_by_id[id_norma] = targets
            log.info("  Modifies %d laws", len(targets))

    # Apply KNOWN_RECENT on top of SPARQL results
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
    gpath = REPO_ROOT / "graph.json"
    gpath.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    subprocess.run(["git", "-C", str(REPO_ROOT), "add", "--", str(gpath)], check=True)
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if result.returncode != 0:
        subprocess.run(
            ["git", "-C", str(REPO_ROOT), "commit", "-m",
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
        help="Skip SPARQL discovery; use only KNOWN_RECENT + EXTRA_SEEDS (fast, offline)"
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
