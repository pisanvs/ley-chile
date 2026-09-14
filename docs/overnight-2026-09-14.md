# Overnight reliability push — 2026-09-14

Branch `claude/artifact-session-kr1qga`, based on `deploy/railway`.
Goal: a corpus that is fully reliable and demonstrably better than BCN's leychile.cl.

Budget: 5 req/s against `leyes.pisanvs.cl`. No DB or Meilisearch credentials —
Railway returns `valuesRedacted: true` for this OAuth connection, so everything
is black-box probing plus offline analysis of `graph_shards/`.

## Queue

- [x] **A** — probe harness + baseline
- [x] **B** — corpus-wide invariant sweep over `graph_shards`
- [ ] **C** — version-completeness gap (DB serves 5 versions of ley 20.000; the graph knows 8)
- [ ] **D** — search ranking
- [ ] **E** — vigencia warnings into `diff_versions` / `get_law`; close what B–D surface

---

## A — probe harness (done)

`site/scripts/probe.ts` + `probes.ts` (declarative) + `checks.ts` (composite) +
`mcpclient.ts` (dependency-free MCP client over Streamable HTTP).

    cd site && pnpm exec tsx scripts/probe.ts --rps 5
    cd site && pnpm exec tsx scripts/probe.ts --group search --verbose
    cd site && pnpm exec tsx scripts/probe.ts --update-baseline

**Baseline against production: 11/28.** Production does not yet have the fixes
from the three commits already on this branch, so most failures are "merged but
not deployed" rather than newly discovered. `scripts/probe-baseline.json` records
which is which; a later run prints `← REGRESSION` / `← fixed` against it.

| group | pass |
|---|---|
| ambiguity | 2/2 |
| boundaries | 4/4 |
| causas | 0/1 |
| dates | 2/8 |
| diffs | 0/4 |
| labels | 1/3 |
| search | 1/4 |
| vigencia | 1/2 |

### What the harness found that the hand-written teardown did not

**Search is worse than one anecdote.** The new `search/self-retrieval` check
pastes each norma's own official título back into `search_laws` and asks whether
it retrieves itself. That is the weakest possible retrieval bar.

**4 of 5 fail it** — ley 21.561, DFL 1 (Código del Trabajo), ley 19.300,
ley 20.584. Only ley 20.000 passes, and only by number. Separately,
`"20584 derechos y deberes de las personas en su atención de salud"` — the number
plus most of the title — returns **zero results**.

**Version boundaries are clean.** Both new structural checks pass on ley 20.000:
every listed boundary is a real textual discontinuity, and the ranges tile the
timeline with no gap and no overlap. Worth knowing before touching the pipeline.

### Three probes that passed for the wrong reason

Written down because each one is a way to build a suite that reassures instead of
testing, and all three got past me on the first pass:

1. `vigencia/phase-in-not-yet-binding` asserted `VIGENCIA GRADUAL|cuarenta y cinco`.
   "cuarenta y cinco" sits in the nota at the foot of the article whether or not
   the answer warns, so it passed against a server that says nothing. Now asserts
   only the marker.
2. `diff/no-mid-word-fragments` pointed at `2023-05-23 → 2024-09-04`. The
   documented fragments live in the 2005→2026 span. A probe aimed at the wrong
   range passes vacuously.
3. `diff/ops-are-quotable` used plain substring containment — and **a fragment cut
   off the front of a word is still a substring of the word it was cut from**.
   `"uministre a menores…"` occurs verbatim inside `"El que suministre a
   menores…"`. Containment reports it as perfectly quotable. Fixed by requiring
   word-boundary alignment at both ends; it now reports "appears only mid-word,
   so it is a slice and not a quotation". It also had two mechanical bugs — a
   lookahead using `$` under the `m` flag, which ended every block capture at the
   first line break and collected zero operations, and a dependence on
   server-side label normalisation that is not deployed yet.

The check now fails closed: if it compares nothing, it says so rather than
reporting a pass.

---

## B — corpus-wide invariant sweep (done)

`scripts/audit_graph.py`, 27 tests in `tests/test_audit_graph.py`.

    python scripts/audit_graph.py --graph-path ./graph.json --sample 2
    python scripts/audit_graph.py --graph-path ./graph.json --only vigencia/unreachable

**357,266 nodes · 12,010 modificadaPor edges.**

### The headline is good news

**Zero gaps and zero overlaps, corpus-wide.** The version series tiles the
timeline for every norma in the corpus. The structural property the whole
as-of-date model rests on holds at 357k, not just on the one norma the probe
suite checks. Nothing in the pipeline needs touching for this.

### Defects, worst first

| count | finding | what it means |
|---|---|---|
| **75** | `vigencia/unreachable` | Every version is zero-length, so **no date returns any text**. `get_article` answers nothing for every `fecha`, forever — and phrases it as if the *article* were missing. e.g. dto 388 (idNorma 12944): one version, `1989-03-06 → 1989-03-05`. |
| **1742** | `edge/unresolvable` | 14.5% of modification edges point at a norma absent from the graph, so it cannot be named. This is what surfaces as `Otra [id 1000928]`. |
| 10 | `vigencia/negative-duration` | `hasta` precedes `desde` by more than the one-day idiom (up to 525 days). |
| 9 | `vigencia/none-real` | Has vigencias, none of them dateable. |
| 1 | `vigencia/multiple-open` | Two versions both claim to be current (idNorma 1014585). |
| 89 | `vigencia/open-not-last` | An open-ended version that is not the most recent — the benign half of the zero-duration idiom. |
| 78 | `edge/fecha-bad` | Modification edge dated with the sentinel. |
| 3746 | `norma/no-fecha-publicacion` | No publication date. |
| 332 | `norma/retroactive-first-version` | First version predates publication. Usually lawful; reported to be looked at, not fixed. |
| 218 | `vigencia/zero-duration` | **Not a defect.** LeyChile's idiom for text superseded on its own publication day. Classified separately so it does not bury the 10 above it. |

### The find that matters most: LeyChile already types deferred vigencia

| count | `tipo_version_s` |
|---|---|
| 77 | `Con Vigencia Diferida por Fecha` |
| 68 | `Con Vigencia Diferida por Evento` |
| 20 | `Con Derogación Diferida por fecha` |
| 20 | `Con Derogación Diferida por evento` |
| 2 | `Con Vigencia Diferida por Evento y Derogación Diferida por evento` |

**187 vigencias carry an explicit deferred-entry type, and the corpus discards
the distinction entirely.** The `por Fecha` ones (97) are applied as ordinary
versions with no mention that entry is deferred. The `por Evento` ones (90) are
sentinel-dated — and the pipeline filters sentinels *before* reading the type,
so they vanish without trace. The sentinel is not noise: it is precisely how
LeyChile says "conditioned on an event".

`lib/vigencia.ts` reconstructs this from prose notas. That work stands — the
notas carry the *schedule*, which the type does not — but the type is a
structured signal for exactly the population the parser has to guess at, and it
is free. Ley 18.045 (Mercado de Valores, idNorma 29472) has a
`Con Vigencia Diferida por Evento` version and the corpus says nothing about it.

Folded into **E**.

### Next

**C** — the completeness gap: the DB serves 5 versions of ley 20.000 where the
graph knows 8. Sample via the live MCP, quantify, root-cause.
