"""One-shot backfill: lift tipo/numero from cached normas/{id}.json into graph nodes.

Graph nodes built before the parse_node fix have `tipo: null, numero: null`
because the original parse_node didn't read `metadatos.tipos_numeros[0]`.
This script walks the graph and patches each node from the cached norma
JSON. Idempotent — safe to re-run.

Usage:
    python scripts/backfill_tipo_numero.py \\
        --graph-dir cache/graph_shards \\
        --normas-dir cache/normas

Writes the updated graph back to the same shards directory.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from utils import load_graph, save_graph


def lift(normas_dir: Path, id_str: str) -> tuple[str | None, str | None]:
    p = normas_dir / f"{id_str}.json"
    if not p.exists():
        return None, None
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None, None
    tn = (d.get("metadatos", {}) or {}).get("tipos_numeros") or []
    if not tn:
        return None, None
    e = tn[0]
    return (e.get("abreviacion") or "").lower().strip() or None, e.get("numero") or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph-dir", default="cache/graph_shards")
    ap.add_argument("--normas-dir", default="cache/normas")
    ap.add_argument("--dry-run", action="store_true", help="Report counts only, don't write")
    args = ap.parse_args()

    graph_dir = Path(args.graph_dir).resolve()
    normas_dir = Path(args.normas_dir).resolve()
    print(f"graph: {graph_dir}")
    print(f"normas: {normas_dir}")

    if not normas_dir.is_dir():
        print(f"ERROR: normas dir not found: {normas_dir}", file=sys.stderr)
        sys.exit(2)

    graph = load_graph(str(graph_dir))
    print(f"loaded {len(graph)} graph nodes")

    patched = 0
    skipped_have = 0
    skipped_no_cache = 0
    for id_str, node in graph.items():
        if node.get("tipo") and node.get("numero"):
            skipped_have += 1
            continue
        tipo_abr, numero = lift(normas_dir, id_str)
        if not tipo_abr and not numero:
            skipped_no_cache += 1
            continue
        if tipo_abr and not node.get("tipo"):
            node["tipo"] = tipo_abr
        if numero and not node.get("numero"):
            node["numero"] = numero
        patched += 1

    print(f"patched: {patched}")
    print(f"already had both fields: {skipped_have}")
    print(f"no cached norma JSON (would need a refetch): {skipped_no_cache}")

    if args.dry_run:
        print("(dry-run — nothing written)")
        return

    # Write back to the same shards directory (save_graph expects the
    # logical path; the shards live in graph_shards/ alongside it).
    logical = graph_dir.parent / "graph.json"
    print(f"saving to {logical} (shards dir: {graph_dir})")
    save_graph(logical, graph)
    print("done.")


if __name__ == "__main__":
    main()
