"""
reconcile_modifications.py — reconcile the modification graph with the version series.

Every version of a norma should be explained by the publication of some other
norma that modified it. The two facts live in different places and were never
compared: `modificadaPor_edges` (who modified this, and when) comes from BCN's
relation graph, while `vigencias` (when the text changed) comes from LeyChile's
own version list. Asked about ley 20.000, the corpus reported seven modifying
norms and a shorter version series, and nobody could say why.

This answers that with a number instead of a shrug, because it is the first
question a reviewer asks. Two directions, and they fail differently:

  causa date → boundary   Does each modifying norma's publication date land on a
                          version boundary? A causa with no boundary either
                          predates the corpus's first version, postdates its
                          last, or changed nothing textual (a modification to a
                          heading, a cross-reference, or a provision LeyChile
                          folds into a neighbouring version).

  boundary → causa date   Is each version boundary explained by a known causa?
                          An unattributed boundary means LeyChile cut a new
                          version the relation graph does not account for —
                          rectificaciones and consolidations do this, and so
                          does an edge BCN simply never published.

Run against the shipped graph:

    python scripts/reconcile_modifications.py --graph-path ./graph.json
    python scripts/reconcile_modifications.py --graph-path ./graph.json --json
    python scripts/reconcile_modifications.py --graph-path ./graph.json --top 20

Exit code is 0 whatever the numbers say: this is a measurement, not a gate.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from utils import graph_exists, load_graph  # noqa: E402

# LeyChile uses 2222-02-02 for open-ended "current" versions. A sentinel is not
# a date and must never be counted as a boundary.
MAX_REAL_YEAR = 2100


def is_real_date(value: object) -> bool:
    """True for a YYYY-MM-DD string that is not a LeyChile sentinel."""
    if not isinstance(value, str) or len(value) < 4:
        return False
    try:
        return int(value[:4]) <= MAX_REAL_YEAR
    except ValueError:
        return False


@dataclass(frozen=True)
class Reconciliation:
    """One norma's causa dates and version boundaries, matched up.

    `boundaries` deliberately excludes the first vigencia: the original text is
    caused by the norma's own publication, not by a modification, so counting it
    would report a phantom unattributed boundary for every norma in the corpus.
    """

    id_norma: str
    tipo: str
    numero: str
    #: Causa publication dates that land exactly on a version boundary.
    matched: list[str] = field(default_factory=list)
    #: Causa dates at or before the first vigencia — the modification is older
    #: than the text the corpus holds, so there is nothing for it to have
    #: changed here.
    before_first: list[str] = field(default_factory=list)
    #: Causa dates after the last vigencia — the modifying norma is published
    #: but its effect has not been consolidated into a version yet.
    after_last: list[str] = field(default_factory=list)
    #: Causa dates inside the covered range that still match no boundary. The
    #: interesting bucket: a modification that produced no new text.
    inside_unmatched: list[str] = field(default_factory=list)
    #: Version boundaries no known causa explains.
    unattributed: list[str] = field(default_factory=list)

    @property
    def causa_dates(self) -> int:
        return (
            len(self.matched) + len(self.before_first)
            + len(self.after_last) + len(self.inside_unmatched)
        )

    @property
    def boundaries(self) -> int:
        return len(self.matched) + len(self.unattributed)

    @property
    def reconciles(self) -> bool:
        """Every causa explained and every boundary attributed."""
        return self.causa_dates == len(self.matched) and not self.unattributed


def reconcile_norma(id_norma: str, node: dict) -> Reconciliation | None:
    """Match one norma's causa dates against its version boundaries.

    Returns None when the node carries nothing to reconcile — no modifiers, or
    no real vigencias (SPARQL placeholder nodes LeyChile never serves).
    """
    edges = node.get("modificadaPor_edges") or []
    desdes = sorted(
        {v["desde"] for v in (node.get("vigencias") or []) if is_real_date(v.get("desde"))}
    )
    if not edges or not desdes:
        return None

    first, last = desdes[0], desdes[-1]
    boundaries = set(desdes[1:])
    causa_dates = sorted({e["fecha"] for e in edges if is_real_date(e.get("fecha"))})

    r = Reconciliation(
        id_norma=id_norma,
        tipo=str(node.get("tipo") or ""),
        numero=str(node.get("numero") or ""),
    )
    for d in causa_dates:
        if d in boundaries:
            r.matched.append(d)
        elif d <= first:
            r.before_first.append(d)
        elif d > last:
            r.after_last.append(d)
        else:
            r.inside_unmatched.append(d)
    seen = set(causa_dates)
    r.unattributed.extend(sorted(b for b in boundaries if b not in seen))
    return r


@dataclass
class Summary:
    normas: int = 0
    reconciling: int = 0
    matched: int = 0
    before_first: int = 0
    after_last: int = 0
    inside_unmatched: int = 0
    unattributed: int = 0

    @property
    def causa_dates(self) -> int:
        return self.matched + self.before_first + self.after_last + self.inside_unmatched

    @property
    def boundaries(self) -> int:
        return self.matched + self.unattributed

    def add(self, r: Reconciliation) -> None:
        self.normas += 1
        self.reconciling += 1 if r.reconciles else 0
        self.matched += len(r.matched)
        self.before_first += len(r.before_first)
        self.after_last += len(r.after_last)
        self.inside_unmatched += len(r.inside_unmatched)
        self.unattributed += len(r.unattributed)

    def as_dict(self) -> dict:
        return {
            "normas": self.normas,
            "reconciling": self.reconciling,
            "causa_dates": {
                "total": self.causa_dates,
                "matched": self.matched,
                "before_first_version": self.before_first,
                "after_last_version": self.after_last,
                "inside_but_no_boundary": self.inside_unmatched,
            },
            "boundaries": {
                "total": self.boundaries,
                "attributed": self.matched,
                "unattributed": self.unattributed,
            },
        }


def summarize(reconciliations) -> Summary:
    s = Summary()
    for r in reconciliations:
        s.add(r)
    return s


def _pct(n: int, total: int) -> str:
    return f"{100 * n / total:5.1f}%" if total else "    — "


def format_report(s: Summary, outliers: list[Reconciliation]) -> str:
    lines = [
        "Reconciliación grafo de modificaciones ↔ serie de versiones",
        "=" * 62,
        f"normas con al menos un modificador y una vigencia real: {s.normas}",
        f"  reconcilian por completo: {s.reconciling} ({_pct(s.reconciling, s.normas).strip()})",
        "",
        f"Fechas de causa ({s.causa_dates}) — ¿cae cada modificación en un corte de versión?",
        f"  calzan con un corte            {s.matched:8d}  {_pct(s.matched, s.causa_dates)}",
        f"  anteriores a la 1ª versión     {s.before_first:8d}  {_pct(s.before_first, s.causa_dates)}",
        f"  posteriores a la última        {s.after_last:8d}  {_pct(s.after_last, s.causa_dates)}",
        f"  dentro del rango, sin corte    {s.inside_unmatched:8d}  {_pct(s.inside_unmatched, s.causa_dates)}",
        "",
        f"Cortes de versión ({s.boundaries}) — ¿explica una causa conocida cada versión?",
        f"  atribuidos a una causa         {s.matched:8d}  {_pct(s.matched, s.boundaries)}",
        f"  sin causa conocida             {s.unattributed:8d}  {_pct(s.unattributed, s.boundaries)}",
    ]
    if outliers:
        lines += [
            "",
            "Mayores discrepancias (cortes sin causa conocida):",
            f"  {'idNorma':>10}  {'norma':<16} {'causas':>7} {'cortes':>7} {'sin causa':>10}",
        ]
        for r in outliers:
            key = f"{r.tipo} {r.numero}"[:16]
            lines.append(
                f"  {r.id_norma:>10}  {key:<16} {r.causa_dates:7d} "
                f"{r.boundaries:7d} {len(r.unattributed):10d}"
            )
    return "\n".join(lines)


def iter_reconciliations(graph: dict):
    nodes = graph.get("nodes", graph)
    for id_norma, node in nodes.items():
        if not isinstance(node, dict):
            continue
        r = reconcile_norma(str(id_norma), node)
        if r is not None:
            yield r


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1].strip())
    ap.add_argument("--graph-path", default="./graph.json",
                    help="graph.json (sharded into graph_shards/ next to it)")
    ap.add_argument("--json", action="store_true", help="emit the summary as JSON")
    ap.add_argument("--top", type=int, default=10,
                    help="how many worst-offender normas to list (0 to skip)")
    args = ap.parse_args(argv)

    graph_path = Path(args.graph_path)
    if not graph_exists(graph_path):
        print(f"graph not found at {graph_path} (nor its graph_shards/)", file=sys.stderr)
        return 1

    reconciliations = list(iter_reconciliations(load_graph(graph_path)))
    summary = summarize(reconciliations)
    outliers = sorted(reconciliations, key=lambda r: -len(r.unattributed))[: args.top]

    if args.json:
        print(json.dumps(
            {
                "summary": summary.as_dict(),
                "outliers": [
                    {
                        "idNorma": r.id_norma, "tipo": r.tipo, "numero": r.numero,
                        "causa_dates": r.causa_dates, "boundaries": r.boundaries,
                        "unattributed": len(r.unattributed),
                    }
                    for r in outliers
                ],
            },
            ensure_ascii=False, indent=2,
        ))
    else:
        print(format_report(summary, outliers))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
