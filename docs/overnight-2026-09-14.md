# Overnight reliability push — 2026-09-14

Branch `claude/artifact-session-kr1qga`, based on `deploy/railway`.
Goal: a corpus that is fully reliable and demonstrably better than BCN's leychile.cl.

Budget: 5 req/s against `leyes.pisanvs.cl`. No DB or Meilisearch credentials —
Railway returns `valuesRedacted: true` for this OAuth connection, so everything
is black-box probing plus offline analysis of `graph_shards/`.

## Queue

- [x] **A** — probe harness + baseline
- [ ] **B** — corpus-wide invariant sweep over `graph_shards`
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

### Next

**B** — corpus-wide invariant sweep over `graph_shards`. The boundary checks pass
on one norma; the question is whether they hold across 350k.
