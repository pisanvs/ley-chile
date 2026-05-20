"""
Build the complete legislative relationship graph (DAG) from seed idNormas.

Performs a BFS over BCN SPARQL following modifiesTo / isModifiedBy /
recasts / isRecastedBy edges until no new laws are reachable.  Writes
graph.json to DATA_ROOT.  Idempotent: already-visited nodes are skipped.

Usage:
    LEYCHILE_DATA_ROOT=./historial python scripts/build_graph.py
    LEYCHILE_DATA_ROOT=./historial python scripts/build_graph.py --seeds 235507 29815 30733
    LEYCHILE_DATA_ROOT=./historial python scripts/build_graph.py --verify
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
import trace_graph as tg

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

BCN_SPARQL = "https://datos.bcn.cl/sparql"
SPARQL_BATCH = 50          # idNormas per VALUES clause
SPARQL_DELAY = 1.5         # seconds between SPARQL requests (BCN rate limit)
DEFAULT_SEEDS = [235507, 29815, 30733]   # ley 20000, ley 18403, ley 19366

_RELATIONS_QUERY = """\
PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
SELECT DISTINCT ?src ?rel ?code ?tnum ?ttipo ?tdate WHERE {{
  VALUES ?src {{ {ids} }}
  ?s bcn:leychileCode ?sc . FILTER(xsd:integer(?sc) = ?src)
  ?s ?rel ?target .
  FILTER(?rel = bcn:modifiesTo || ?rel = bcn:isModifiedBy
         || ?rel = bcn:recasts || ?rel = bcn:isRecastedBy)
  ?target bcn:leychileCode ?code .
  OPTIONAL {{ ?target bcn:hasNumber ?tnum }}
  OPTIONAL {{ ?target bcn:type ?tt . BIND(STR(?tt) AS ?ttipo) }}
  OPTIONAL {{ ?target bcn:publishDate ?tdate }}
}}
"""


# ---------------------------------------------------------------------------
# SPARQL helper
# ---------------------------------------------------------------------------

def _sparql(query: str, retries: int = 4) -> list[dict]:
    delay = 10.0
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.post(
                BCN_SPARQL,
                data={"query": query, "format": "application/json"},
                headers={"User-Agent": "ley-chile-build-graph/1.0"},
                timeout=90,
            )
            resp.raise_for_status()
            return resp.json()["results"]["bindings"]
        except Exception as exc:
            last_exc = exc
            log.warning("SPARQL attempt %d/%d failed: %s", attempt + 1, retries, exc)
            if attempt + 1 < retries:
                time.sleep(delay)
                delay = min(delay * 2, 120)
    raise RuntimeError(f"SPARQL failed after {retries} attempts: {last_exc}")


def fetch_relations_batch(id_normas: list[int]) -> dict[int, list[dict]]:
    """One SPARQL request for up to SPARQL_BATCH idNormas.  Returns {src: [rel_dicts]}."""
    out: dict[int, list[dict]] = {i: [] for i in id_normas}
    ids_str = " ".join(str(i) for i in id_normas)
    bindings = _sparql(_RELATIONS_QUERY.format(ids=ids_str))
    seen: set[tuple] = set()
    for row in bindings:
        try:
            src = int(row["src"]["value"])
            code = int(row["code"]["value"])
        except (KeyError, ValueError):
            continue
        rel = row.get("rel", {}).get("value", "").split("#")[-1]
        if not rel or src == code:
            continue
        key = (src, rel, code)
        if key in seen:
            continue
        seen.add(key)
        tipo_uri = row.get("ttipo", {}).get("value", "")
        fecha_raw = row.get("tdate", {}).get("value", "")
        out.setdefault(src, []).append({
            "rel": rel,
            "idNorma": code,
            "numero": row.get("tnum", {}).get("value", ""),
            "tipo": tipo_uri.split("#")[-1] if tipo_uri else "",
            "fecha": fecha_raw[:10] if fecha_raw else "",
        })
    return out


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------

_GRAPH_PATH = tg.DATA_ROOT / "graph.json"


def load_graph() -> dict[int, dict]:
    if not _GRAPH_PATH.exists():
        return {}
    try:
        return {int(k): v for k, v in json.loads(_GRAPH_PATH.read_text(encoding="utf-8")).items()}
    except Exception as exc:
        log.warning("Could not load graph.json: %s — starting fresh", exc)
        return {}


def save_graph(graph: dict[int, dict]) -> None:
    _GRAPH_PATH.write_text(
        json.dumps({str(k): graph[k] for k in sorted(graph)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def commit_graph(graph: dict[int, dict], msg: str) -> None:
    save_graph(graph)
    subprocess.run(["git", "-C", str(tg.DATA_ROOT), "add", "--", str(_GRAPH_PATH)], check=True)
    res = subprocess.run(
        ["git", "-C", str(tg.DATA_ROOT), "diff", "--cached", "--quiet"], capture_output=True
    )
    if res.returncode != 0:
        subprocess.run(["git", "-C", str(tg.DATA_ROOT), "commit", "-m", msg], check=True)


def _node(idn: int, numero: str = "", fecha: str = "") -> dict:
    return {
        "idNorma": idn,
        "numero": numero,
        "titulo": "",
        "clasificacion": "",
        "fechaPublicacion": fecha,
        "modifica": [],
        "modificadaPor": [],
    }


def merge_relations(graph: dict[int, dict], rel_map: dict[int, list[dict]]) -> bool:
    """Apply rel_map edges into graph.  Returns True if anything changed."""
    changed = False
    for src, rels in rel_map.items():
        src_node = graph.setdefault(src, _node(src))
        for r in rels:
            tgt = r["idNorma"]
            tgt_node = graph.setdefault(tgt, _node(tgt, r.get("numero", ""), r.get("fecha", "")))
            if r.get("numero") and not tgt_node.get("numero"):
                tgt_node["numero"] = r["numero"]
                changed = True
            if r.get("fecha") and not tgt_node.get("fechaPublicacion"):
                tgt_node["fechaPublicacion"] = r["fecha"]
                changed = True
            rel = r["rel"]
            if rel == "modifiesTo":
                tnum = r.get("numero", "")
                if tnum and tnum not in src_node["modifica"]:
                    src_node["modifica"].append(tnum)
                    changed = True
                if src not in tgt_node["modificadaPor"]:
                    tgt_node["modificadaPor"].append(src)
                    changed = True
            elif rel == "isModifiedBy":
                if tgt not in src_node["modificadaPor"]:
                    src_node["modificadaPor"].append(tgt)
                    changed = True
                src_num = src_node.get("numero", "")
                if src_num and src_num not in tgt_node["modifica"]:
                    tgt_node["modifica"].append(src_num)
                    changed = True
    return changed


# ---------------------------------------------------------------------------
# BFS
# ---------------------------------------------------------------------------

def build(seeds: list[int], verify: bool = False) -> dict[int, dict]:
    """BFS from seeds.  Returns the complete graph."""
    graph = load_graph()
    visited: set[int] = set(graph.keys()) if not verify else set()
    queue: set[int] = set(seeds) - visited

    if not queue and not verify:
        log.info("Graph already complete — %d nodes, nothing to discover.", len(graph))
        return graph

    log.info("Starting BFS from %d seeds (%d already in graph) ...", len(seeds), len(visited))
    total_new = 0
    batch_num = 0

    while queue:
        batch = sorted(queue)[:SPARQL_BATCH]
        queue -= set(batch)
        visited.update(batch)
        batch_num += 1
        log.info(
            "Batch %d: querying %d ids (visited=%d, queue=%d) ...",
            batch_num, len(batch), len(visited), len(queue),
        )

        rel_map = fetch_relations_batch(batch)
        changed = merge_relations(graph, rel_map)

        # Enqueue newly discovered idNormas
        new_ids = {idn for rels in rel_map.values() for r in rels if (idn := r["idNorma"]) not in visited}
        queue.update(new_ids)
        total_new += len(new_ids)
        if new_ids:
            log.info("  Discovered %d new idNormas (graph now %d nodes)", len(new_ids), len(graph))

        if changed:
            commit_graph(graph, f"chore(graph): BFS batch {batch_num} — {len(graph)} nodes")

        if queue:
            time.sleep(SPARQL_DELAY)

    log.info("BFS complete. Graph: %d nodes, %d new idNormas discovered.", len(graph), total_new)
    return graph


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seeds", type=int, nargs="+", default=DEFAULT_SEEDS,
        metavar="IDNORMA",
        help=f"Seed idNormas (default: {DEFAULT_SEEDS})",
    )
    parser.add_argument(
        "--verify", action="store_true",
        help="Re-run BFS from scratch, ignoring existing graph (verification mode).",
    )
    args = parser.parse_args()
    log.info("DATA_ROOT: %s", tg.DATA_ROOT)
    graph = build(args.seeds, verify=args.verify)
    log.info("Final graph: %d nodes", len(graph))


if __name__ == "__main__":
    main()
