"""
audit_graph.py — corpus-wide invariant sweep over the norma graph.

The probe suite asks whether the served API is right about one norma at a time.
This asks whether the underlying graph is internally coherent across all ~357k,
which is the question no amount of probing answers: a defect that affects eighty
normas will never show up in a hand-picked sample, and those eighty are exactly
the ones that produce a confident empty answer nobody reports.

Findings are classified, not merely counted. Three of the shapes here look like
corruption and are not — a version whose `hasta` falls one day before its
`desde` is LeyChile's idiom for text superseded on its own publication day, and
reporting 218 of those as errors would bury the ten that are something else.

    python scripts/audit_graph.py --graph-path ./graph.json
    python scripts/audit_graph.py --graph-path ./graph.json --json
    python scripts/audit_graph.py --graph-path ./graph.json --sample 5
    python scripts/audit_graph.py --graph-path ./graph.json --only vigencia/unreachable

Exit code is 0 whatever it finds: a measurement, not a gate.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import graph_exists, load_graph  # noqa: E402

# LeyChile writes 2222-02-02 when a version has no calendar date of its own —
# which, as the tipo_version breakdown shows, is not noise but a marker: almost
# every sentinel-dated vigencia is one whose entry into force or repeal is
# conditioned on an event rather than a date.
MAX_REAL_YEAR = 2100

#: LeyChile's own labels for versions whose entry into force or repeal is
#: deferred. The corpus has been dropping the distinction entirely: the
#: "por Fecha" ones are applied as if they were ordinary versions, and the
#: "por Evento" ones are filtered out with the sentinels and never mentioned.
DEFERRED_BY_DATE = {
    "Con Vigencia Diferida por Fecha",
    "Con Derogación Diferida por fecha",
}
DEFERRED_BY_EVENT = {
    "Con Vigencia Diferida por Evento",
    "Con Derogación Diferida por evento",
    "Con Vigencia Diferida por Evento y Derogación Diferida por evento",
}


def parse_date(value: object) -> date | None:
    """A real calendar date, or None for blank, malformed, and sentinel values."""
    if not isinstance(value, str) or len(value) != 10:
        return None
    try:
        d = date.fromisoformat(value)
    except ValueError:
        return None
    return None if d.year > MAX_REAL_YEAR else d


def is_sentinel(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value) >= 4
        and value[:4].isdigit()
        and int(value[:4]) > MAX_REAL_YEAR
    )


@dataclass
class Finding:
    kind: str
    id_norma: str
    detail: str


@dataclass
class Inventory:
    nodes: int = 0
    edges: int = 0
    findings: dict[str, list[Finding]] = field(default_factory=lambda: defaultdict(list))

    def add(self, kind: str, id_norma: str, detail: str) -> None:
        self.findings[kind].append(Finding(kind, id_norma, detail))

    def count(self, kind: str) -> int:
        return len(self.findings.get(kind, []))


def audit_vigencias(id_norma: str, node: dict, inv: Inventory) -> None:
    """Check one norma's version series for internal coherence.

    The series must tile time: sorted by `desde`, each version picking up the
    day after the previous one ends, exactly one left open at the end. A gap is
    a day the corpus believes the norma had no text; an overlap is a day with
    two answers and no way to tell which one you got.
    """
    vigencias = node.get("vigencias") or []
    intervals: list[tuple[date, date | None]] = []
    reachable = False

    for v in vigencias:
        raw_desde, raw_hasta = v.get("desde", ""), v.get("hasta", "")
        tipo = v.get("tipo_version_s") or ""

        # Record what LeyChile told us about deferred entry BEFORE discarding
        # the sentinel, because the sentinel is how it tells us.
        if tipo in DEFERRED_BY_DATE:
            inv.add("vigencia/deferred-by-date", id_norma, f"{tipo} · desde {raw_desde}")
        elif tipo in DEFERRED_BY_EVENT:
            inv.add("vigencia/deferred-by-event", id_norma, f"{tipo} · desde {raw_desde}")

        if not raw_desde:
            inv.add("vigencia/no-desde", id_norma, json.dumps(v, ensure_ascii=False))
            continue
        if is_sentinel(raw_desde):
            continue
        desde = parse_date(raw_desde)
        if desde is None:
            inv.add("vigencia/desde-malformed", id_norma, repr(raw_desde))
            continue

        hasta: date | None = None
        if raw_hasta and not is_sentinel(raw_hasta):
            hasta = parse_date(raw_hasta)
            if hasta is None:
                inv.add("vigencia/hasta-malformed", id_norma, repr(raw_hasta))
                continue

        if hasta is None:
            reachable = True
        elif hasta >= desde:
            reachable = True
        else:
            gap = (desde - hasta).days
            if gap == 1:
                # Not corruption: the version was superseded on the very day it
                # began, so it bound for zero days. 218 of 228 are this shape.
                inv.add("vigencia/zero-duration", id_norma, f"{raw_desde} → {raw_hasta}")
            else:
                inv.add(
                    "vigencia/negative-duration", id_norma,
                    f"{raw_desde} → {raw_hasta} ({gap} days backwards)",
                )
        intervals.append((desde, hasta))

    if vigencias and not intervals:
        inv.add("vigencia/none-real", id_norma, f"{len(vigencias)} vigencia(s), none dateable")
        return
    if intervals and not reachable:
        # Every version is zero-length, so there is no date at which this norma
        # has any text. get_article answers nothing, for every fecha, forever.
        inv.add(
            "vigencia/unreachable", id_norma,
            f"{len(intervals)} version(s), none covering any day",
        )

    intervals.sort(key=lambda iv: iv[0])
    open_ended = [iv for iv in intervals if iv[1] is None]
    if len(open_ended) > 1:
        inv.add(
            "vigencia/multiple-open", id_norma,
            "; ".join(f"{d.isoformat()} → vigente" for d, _ in open_ended),
        )
    if open_ended and intervals[-1][1] is not None:
        inv.add("vigencia/open-not-last", id_norma, f"{open_ended[0][0].isoformat()} is open but not last")

    for prev, cur in zip(intervals, intervals[1:]):
        prev_hasta = prev[1]
        if prev_hasta is None:
            continue
        want = prev_hasta + timedelta(days=1)
        if cur[0] == want:
            continue
        # A zero-duration version legitimately starts where its predecessor
        # also starts; that is the idiom, not a tear in the timeline.
        if cur[1] is not None and cur[1] < cur[0]:
            continue
        kind = "vigencia/gap" if cur[0] > want else "vigencia/overlap"
        inv.add(kind, id_norma, f"{prev_hasta.isoformat()} → {cur[0].isoformat()} (expected {want.isoformat()})")


def audit_node(id_norma: str, node: dict, known_ids: set[str], inv: Inventory) -> None:
    inv.nodes += 1
    audit_vigencias(id_norma, node, inv)

    if not (node.get("tipo") or ""):
        inv.add("norma/no-tipo", id_norma, "")
    if not str(node.get("numero") or ""):
        inv.add("norma/no-numero", id_norma, "")

    pub = node.get("fechaPublicacion") or ""
    if not pub:
        inv.add("norma/no-fecha-publicacion", id_norma, "")
    else:
        first = min(
            (d for d in (parse_date(v.get("desde")) for v in node.get("vigencias") or []) if d),
            default=None,
        )
        if parse_date(pub) and first and parse_date(pub) > first:  # type: ignore[operator]
            # Usually legitimate — a norma can be given retroactive effect — so
            # this is reported to be looked at, not fixed.
            inv.add("norma/retroactive-first-version", id_norma, f"publicada {pub}, rige desde {first}")

    for edge in node.get("modificadaPor_edges") or []:
        inv.edges += 1
        eid = str(edge.get("idNorma") or "")
        if not eid:
            inv.add("edge/no-id", id_norma, json.dumps(edge, ensure_ascii=False))
        elif eid not in known_ids:
            # The norma that modified this one is not in the graph, so it cannot
            # be named. This is what surfaces as "Otra [id 1000928]".
            inv.add("edge/unresolvable", id_norma, f"causa idNorma {eid} not in graph")
        if not parse_date(edge.get("fecha")):
            inv.add("edge/fecha-bad", id_norma, repr(edge.get("fecha")))


def audit(graph: dict) -> Inventory:
    nodes = graph.get("nodes", graph)
    known = {str(k) for k in nodes}
    inv = Inventory()
    for id_norma, node in nodes.items():
        if isinstance(node, dict):
            audit_node(str(id_norma), node, known, inv)
    return inv


#: Ordered worst-first, with a one-line reading of what each finding means.
SEVERITY: list[tuple[str, str]] = [
    ("vigencia/unreachable", "no date returns any text — the norma is invisible at every fecha"),
    ("vigencia/gap", "a day on which the corpus believes the norma had no text"),
    ("vigencia/overlap", "a day with two answers and no way to tell which you got"),
    ("vigencia/multiple-open", "two versions both claim to be current"),
    ("vigencia/negative-duration", "hasta precedes desde by more than the zero-duration idiom"),
    ("vigencia/none-real", "has vigencias, none of them dateable"),
    ("vigencia/no-desde", "a version with no start date"),
    ("vigencia/desde-malformed", "unparseable start date"),
    ("vigencia/hasta-malformed", "unparseable end date"),
    ("vigencia/open-not-last", "an open-ended version that is not the most recent"),
    ("edge/unresolvable", "modifying norma absent from the graph, so it cannot be named"),
    ("edge/no-id", "modification edge carrying no idNorma"),
    ("edge/fecha-bad", "modification edge with no usable date"),
    ("norma/no-tipo", "no tipo, so it cannot be addressed by (tipo, numero)"),
    ("norma/no-numero", "no numero, so it cannot be addressed by (tipo, numero)"),
    ("vigencia/deferred-by-date", "LeyChile flags deferred entry on a date — currently applied as an ordinary version"),
    ("vigencia/deferred-by-event", "LeyChile flags entry conditioned on an event — currently dropped with the sentinels"),
    ("norma/no-fecha-publicacion", "no publication date"),
    ("norma/retroactive-first-version", "first version predates publication (usually legitimate)"),
    ("vigencia/zero-duration", "superseded on its own first day (LeyChile idiom, not a defect)"),
]


def format_report(inv: Inventory, sample: int = 0) -> str:
    lines = [
        "Auditoría del grafo — invariantes en todo el corpus",
        "=" * 64,
        f"nodos: {inv.nodes}    aristas modificadaPor: {inv.edges}",
        "",
    ]
    clean = True
    for kind, meaning in SEVERITY:
        n = inv.count(kind)
        if n == 0:
            continue
        clean = False
        lines.append(f"{n:8d}  {kind}")
        lines.append(f"          {meaning}")
        for f in inv.findings[kind][:sample]:
            lines.append(f"            - idNorma {f.id_norma}: {f.detail}")
    if clean:
        lines.append("sin hallazgos")

    for kind in ("vigencia/gap", "vigencia/overlap"):
        if inv.count(kind) == 0:
            lines.append("")
            lines.append(f"OK: cero {kind.split('/')[1]}s en {inv.nodes} normas — la serie de versiones cubre el tiempo sin huecos.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Corpus-wide invariant sweep over the norma graph.")
    ap.add_argument("--graph-path", default="./graph.json")
    ap.add_argument("--json", action="store_true", help="emit counts as JSON")
    ap.add_argument("--sample", type=int, default=0, help="show N example idNormas per finding")
    ap.add_argument("--only", help="report just this finding kind, with every example")
    args = ap.parse_args(argv)

    graph_path = Path(args.graph_path)
    if not graph_exists(graph_path):
        print(f"graph not found at {graph_path} (nor its graph_shards/)", file=sys.stderr)
        return 1

    inv = audit(load_graph(graph_path))

    if args.only:
        found = inv.findings.get(args.only, [])
        print(f"{len(found)} × {args.only}")
        for f in found:
            print(f"  idNorma {f.id_norma}: {f.detail}")
    elif args.json:
        print(json.dumps(
            {
                "nodes": inv.nodes,
                "edges": inv.edges,
                "findings": {k: inv.count(k) for k, _ in SEVERITY if inv.count(k)},
            },
            ensure_ascii=False, indent=2,
        ))
    else:
        print(format_report(inv, args.sample))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
