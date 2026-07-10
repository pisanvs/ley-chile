"""Phase 0 gate: does article segmentation work on the real corpus?

Stop condition (spec §8.3): a high __doc__ fallback rate among `res`/`dto` is
acceptable — those are administrative and search fine at document granularity.
A high fallback rate among `ley` means article-level dedup is unfounded and the
data model must change before anything is built on it.

Usage (against a REAL clone, not the local stale worktree):

    git clone --single-branch -b historial \\
        https://github.com/pisanvs/ley-chile /tmp/historial-real
    git -C /tmp/historial-real count-objects -vH        # Phase 0 measurement #1
    python scripts/measure_phase0.py --historial /tmp/historial-real --sample 2000
"""
from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from segment import segment

LEY_DOC_RATE_STOP = 0.10  # >10% of leyes unsegmentable => stop and fix the heuristic


@dataclass(frozen=True)
class Coverage:
    tipo: str
    total: int
    md: int
    inline: int
    doc: int


def classify(text: str) -> str:
    """Which segmentation path did this text take?"""
    segs = segment(text)
    if len(segs) == 1 and segs[0].slug == "doc":
        return "doc"
    return "md" if "####" in text else "inline"


def doc_rate(c: Coverage) -> float:
    return 0.0 if c.total == 0 else c.doc / c.total


def _iter_textos(historial: Path, sample: int, seed: int = 0):
    paths = list(historial.rglob("texto.md"))
    rng = random.Random(seed)
    if sample and sample < len(paths):
        paths = rng.sample(paths, sample)
    for p in paths:
        meta = p.parent / "metadata.json"
        tipo = "unknown"
        if meta.exists():
            try:
                parsed = json.loads(meta.read_text(encoding="utf-8", errors="replace"))
                if isinstance(parsed, dict):
                    tipo = parsed.get("tipo", "unknown")
            except json.JSONDecodeError:
                pass
        yield tipo, p.read_text(encoding="utf-8", errors="replace")


def measure(historial: Path, sample: int) -> list[Coverage]:
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"md": 0, "inline": 0, "doc": 0})
    for tipo, text in _iter_textos(historial, sample):
        counts[tipo][classify(text)] += 1
    return [
        Coverage(tipo=t, total=sum(c.values()), md=c["md"], inline=c["inline"], doc=c["doc"])
        for t, c in sorted(counts.items())
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--historial", type=Path, required=True)
    ap.add_argument("--sample", type=int, default=2000)
    args = ap.parse_args()

    rows = measure(args.historial, args.sample)
    print(f"{'tipo':<10} {'total':>7} {'md':>7} {'inline':>7} {'doc':>7} {'doc%':>7}")
    for c in rows:
        print(f"{c.tipo:<10} {c.total:>7} {c.md:>7} {c.inline:>7} {c.doc:>7} {doc_rate(c):>6.1%}")

    leyes = next((c for c in rows if c.tipo == "ley"), None)
    if leyes is None:
        print("\nNO EVIDENCE: no normas with tipo='ley' were classified. "
              "The gate measured nothing; refusing to pass.")
        return 1
    if doc_rate(leyes) > LEY_DOC_RATE_STOP:
        print(f"\nSTOP: {doc_rate(leyes):.1%} of leyes fall back to __doc__ "
              f"(threshold {LEY_DOC_RATE_STOP:.0%}). Article dedup is unfounded. "
              f"Fix the heuristic before proceeding.")
        return 1
    print("\nGATE PASSED: article-level dedup is viable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
