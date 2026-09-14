# Overnight reliability push — 2026-09-14

Branch `claude/artifact-session-kr1qga`, based on `deploy/railway`.
Goal: a corpus that is fully reliable and demonstrably better than BCN's leychile.cl.

Budget: 5 req/s against `leyes.pisanvs.cl`. No DB or Meilisearch credentials —
Railway returns `valuesRedacted: true` for this OAuth connection, so everything
is black-box probing plus offline analysis of `graph_shards/`.

## Queue

- [x] **A** — probe harness + baseline
- [x] **B** — corpus-wide invariant sweep over `graph_shards`
- [x] **C** — version-completeness gap (measured; root cause characterised, fix proposed)
- [x] **D** — search ranking (root-caused and fixed; awaiting deploy to measure)
- [x] **E** — vigencia warnings into `diff_versions` / `get_law`; deferred-entry types; incomplete-history warning

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

---

## C — the completeness gap (measured)

`site/scripts/completeness.ts` compares served `list_versions` against the
`desde` dates in `graph_shards`, over a deterministic random sample.

    cd site && pnpm exec tsx scripts/completeness.ts --sample 300 --seed 1
    cd site && pnpm exec tsx scripts/completeness.ts --ids 235507,207436

**This is the largest finding of the night.** It is also the most dangerous
shape a defect can take here — wrong by omission. Every probe in the suite
passes on a norma missing half its history, because each individual answer is
well-formed. Only comparing the two sides finds it.

### Sample of 300 multi-version normas

| | |
|---|---|
| not served at all | 183 / 300 (61%) |
| served, history matches the graph exactly | 27 / 117 (23%) |
| served, **missing at least one version** | 90 / 117 (77%) |
| **version records the API never mentions** | **216 / 397 (54%)** |

Ley 20.000 is missing 3 of 8 (2005-11-14, 2013-12-27, 2015-10-22). The Código
del Trabajo is missing **64 of 129**. Ask for text on a date inside one of those
holes and you get a confident answer drawn from the wrong version, with no
signal whatsoever.

### It is not a frontier — it is exactly one axis

Served rate by version count (100 sampled per bucket):

| versions | population | served |
|---|---|---|
| 1 | 326,325 | 97% |
| **2–4** | **29,180** | **36%** |
| 5–19 | 1,613 | 90% |
| 20+ | 138 | 96% |

Not an era effect either — within the 2–4 bucket the served rate runs 25–48%
across every decade from pre-1990 to 2020+. Cutting by tipo gives the clean
statement (50 sampled per cell):

| tipo | 1 version | ≥2 versions |
|---|---|---|
| ley | 100% | 82% |
| dfl | 100% | 84% |
| dl | 100% | 68% |
| dto | 98% | 48% |
| res | 100% | **26%** |

**Single-version normas are essentially complete; multi-version normas are not,
and the shortfall tracks tipo priority.** `fetch_versions.py:450` orders
candidates by `fechaPublicacion` ascending and `_apply_version_budget` charges
each norma its vigencia count, so a budgeted backfill naturally finishes cheap
single-version normas first and leaves expensive multi-version ones — dominated
by `res` and `dto` — for last. That is consistent with everything measured.

**So this is mostly pipeline progress, not a code bug.** Two things make it a
reliability problem anyway:

1. **The progress metric hides it.** README reports *Historial 95%*, counted per
   norma — and 91% of the corpus is single-version, so the number is carried by
   the easy cases. Coverage of multi-version normas is roughly 40%, and those
   are the entire point of the project. The bar should be version-weighted, or
   report multi-version coverage separately. (The README figure is also stale:
   last run 2026-06-10, three months ago.)

2. **A truncated history is silent, and that is the real defect.** An absent
   norma at least answers `No se encontró`. A norma that is present with half
   its versions answers confidently and wrongly, and nothing in the API can tell
   the caller which they got.

### Proposed fix for (2), no rebuild required

`graph_shards/` ships in this repo and deploys with the site. Emit a compact
`idNorma → expected version count` index at build time, and have `list_versions`
and `get_article` compare it against what the read model actually holds — then
say so when the history is short. BCN would never tell you its own record is
incomplete; being able to is squarely in 10x territory. Carried into **E**.

---

## D — search (fixed)

### Root cause: títulos were never searched

`runSearchDetailed` in `full` mode consulted exactly three tiers:
`searchByNumber` (exact `numero`), `searchHot` (Meilisearch over the `articulos`
index) and `searchDeep` (Postgres FTS via `search_articulos_deep`). **Both
full-text tiers search article BODIES.**

The norma-level index that holds títulos and common names —
`search_normas_typeahead`, with its own `tsv` and a `prominence` ranking — already
existed, was already indexed, and was wired *only* to the ⌘K palette. In `full`
mode it was never called.

So the teardown's reading was right and understated: titles do not carry too
little weight, they carry **none**, because the words are never compared against
a title at all. `search_laws` (the MCP tool) goes through `full` mode. Pasting a
law's official título searched only article bodies, and a título's words appear
in thousands of unrelated articles.

### The fix

`full` mode now runs the norma-level tier alongside the hot tier and composes
precision-first: **exact number → título → hot body → deep body**, deduped by
norma so one appears once at its best rank.

- `titleTierCap(limit)` = half the page, floor, never below 3. A known-item query
  is answered almost entirely by this tier; a broad topical query ("medio
  ambiente") matches hundreds of títulos and would fill every slot, pushing out
  the article hits that answer what was asked. Half guarantees the former without
  surrendering the latter.
- New `titulo` tier, distinct from `typeahead`: same query, different label,
  because `/buscar` and the analytics must be able to tell "found by title" from
  "shown while typing".
- `app/buscar/page.tsx` partitions results by tier into named sections and
  renders only the tiers it knows — so a new tier would have been **silently
  dropped from the page** no matter how well it ranked. Added a
  "Coincidencias en el título" section.
- `needsColdPath` still keys on the hot tier alone: the deep tier answers a
  different question, and a page full of títulos is not a reason to stop looking.

9 tests in `lib/search.titles.test.ts`, including the known-item case, the
cap under a topical flood, dedupe across tiers, and behaviour with Meilisearch
down (the title tier is pure Postgres and has no reason to care).

### Baselines, measured against production BEFORE the fix

`site/scripts/searcheval.ts` — known-item retrieval, the one task with an
unarguable right answer. Four query shapes per norma.

    cd site && pnpm exec tsx scripts/searcheval.ts --sample 40
    cd site && pnpm exec tsx scripts/searcheval.ts --notable

**Random sample, 40 served normas:**

| shape | recall@1 | recall@10 | MRR |
|---|---|---|---|
| numero | 8% | 15% | 0.098 |
| titulo | 55% | 75% | 0.624 |
| words | 33% | 45% | 0.378 |
| tipo+num | 10% | 20% | 0.133 |
| **overall** | **26%** | **39%** | **0.308** |

**Well-known laws (11 of 15 are served at all):**

| shape | recall@1 | recall@10 | MRR |
|---|---|---|---|
| words | 0% | 18% | 0.068 |
| tipo+num | 91% | 91% | 0.909 |
| **overall** | **49%** | **65%** | **0.541** |

The two tables disagree on `titulo`, and the disagreement is the point. A
uniform sample of 357k is dominated by one-paragraph decretos whose título is
also most of their body ("NOMBRA MINISTROS TITULARES DEL…"), so body-only search
finds them by accident. The normas that fail are the long, heavily-reformed ones
whose título appears nowhere in their own articulado — the ones with readers.
Complete misses on their **own full official título**: ley 19.300, ley 21.561,
ley 20.584, ley 19.496, ley 20.393.

### Honest limit

This container has no Postgres and no Meilisearch, so the fix is verified by unit
test and by reading the query path — **not** by an end-to-end recall measurement.
The eval harness is written and the "before" numbers are recorded above; re-run
both commands after deploy and the improvement is either there or it is not.

---

## E — making the corpus say what it does not know (done)

Three threads from B, C and D converge on one idea: the read model could not
tell you when its own answer was partial. Now it can.

### The corpus index

`site/scripts/build-corpus-index.ts` → `site/lib/corpus-index.json` (339 KB,
committed). The Docker build context is `site/` and `graph_shards/` lives at the
repo root, so the knowledge is compiled in rather than read at runtime —
generated, reviewable, and diffable in a pull request.

Carries only what is worth carrying: **30,931** normas with more than one
version (the only ones whose history can be short) and the **160** LeyChile
marks as having deferred entry into force.

### Two new warnings, on every tool that answers from a version series

**`⚠ HISTORIAL INCOMPLETO`** — served version count is below the catalogue's.
For ley 20.000 that reads *"se sirven 5 versiones, pero el catálogo registra 8 —
faltan 3"*, and names the consequence rather than the arithmetic: a query with a
`fecha` inside a missing stretch returns an older version's text **sin avisar**.

Deliberately silent when the served history is *longer* than the index knows —
that means the pipeline has moved on since the snapshot, which is the normal
direction of travel and must not raise an alarm.

**`⚠ VIGENCIA DIFERIDA`** — LeyChile's own deferred-entry types, recovered from
the sentinel dates the pipeline was discarding. For ley 18.045 it reports an
event-conditioned version and says plainly that it cannot be dated.

Wired into `list_versions`, `get_law`, `get_article` and `diff_versions`, ahead
of any text. `diff_versions` also now carries the `lib/vigencia.ts` phase-in
warnings, since a diff between two dates overstates what was in force if the
text at either end had not yet begun to bind.

12 tests in `lib/corpus.test.ts`, asserted against the real committed index
(ley 20.000 → 8 versions, Código del Trabajo → 129, ley 18.045 → an `evento`
marker), plus two new probes so the contract is in the suite.

### Why this is the 10x claim, concretely

BCN's leychile.cl will not tell you its record of a law is incomplete, because
it has no second source to compare itself against. This corpus does: the graph
and the read model are built separately, so the disagreement between them is
observable — and now reported. *"I am missing three of this law's eight
versions"* is a thing only this system can say.

---

## Where the night landed

| | |
|---|---|
| commits | 7 on `claude/artifact-session-kr1qga` |
| frontend tests | 318 pass, 1 skipped |
| Python tests | 423 pass (24 pre-existing `psycopg` import failures) |
| probe baseline | 11/28 against production, which carries none of this yet |

**Everything is on the branch and nothing is deployed.** The probe suite, the
completeness measurement and the search eval all read production, so their
numbers are *before* pictures. Re-run all three after a deploy:

    cd site && pnpm exec tsx scripts/probe.ts --rps 5
    cd site && pnpm exec tsx scripts/completeness.ts --sample 300 --seed 1
    cd site && pnpm exec tsx scripts/searcheval.ts --notable

### The one thing worth a human decision

The completeness gap (**C**) is not a code fix. Multi-version normas are ~40%
served and `res`/`dto` are worst hit; the pipeline needs to finish, and the
README progress bar should be version-weighted so it stops reporting 95% while
the histories people actually read are half-missing. That is a pipeline run and
a metric change, and both are yours to call.

---

# Problem list — awaiting authorization to fix

Deploy is blocked (see below), so this is the find-and-list pass. Nothing here
is fixed. Each item says what it is, how it was established, and what fixing it
would involve.

## Deploy blocker

`leyes.pisanvs.cl` is Railway-served (`server: railway-hikari`), but **no service
in the connected Railway account holds that domain**. The account is `pisanvs`
(maxmorel@pisanvs.cl) with one workspace and three projects. `ley-chile/web`
tracks branch `main`, has no custom domain, 404s on its own railway.app domain,
and every deployment is `FAILED` or `REMOVED` — the last three failed on
2026-07-13 against `0ef0c58`, nothing since 2026-07-23. `ley-chile/loader` last
failed 2026-07-14. There is no deploy workflow in `.github/workflows/`.

The belmar org is not visible to this connection: `list-workspaces` returns one
personal workspace and the API has no org switch. **Authorize the Railway
integration for that org and I can find the service, confirm its branch, and
deploy.**

## P0 — the core promise is broken on the most-read normas

**Articles are served for dates on which they did not exist.**

`get_article dfl 1 · idNorma 207436 · "articulo 22 bis" · fecha 2005-01-01`
returns 40-hour-law text. Artículo 22 bis was created by **ley 21.561 in 2023**.

Article counts for the Código del Trabajo across time: **742 → 742 → 651 → 723 →
727**. A consolidated code does not shed 91 articles and regain them.

Across the ten most-reformed normas in the corpus, **six show the signature** —
an article present at the earliest served date, absent later, present again:

| norma | known / served versions | articles resurrected | counts across time |
|---|---|---|---|
| DL 830 · Código Tributario | 91 / 45 | **42** | 248 → 206 → … → 248 |
| DL 824 · Impuesto a la Renta | 122 / 10 | **30** | 136 → 106 → … → 136 |
| COD PENAL | 164 / 122 | **27** | 282 → 300 → … → 282 |
| DFL 1 · Código del Trabajo | 129 / 65 | **27** | 204 → 227 → … → 216 |
| DFL 725 · Código Sanitario | 94 / 33 | 11 | 195 → 184 → … → 195 |
| DL 825 · IVA | 82 / 9 | 7 | 94 → 86 → … → 93 |

The resurrected labels are overwhelmingly `bis` / `ter` / `quater` — articles
that exist *only* as later insertions and therefore cannot be in an original
text. Normas with near-complete service show nothing (cir Bancos 2409, 920/948
served, zero).

This is worse than the completeness gap in **C**: that one omits history, this
one fabricates it. And it lands on the Penal, Labour, Tax and Sanitary codes —
the normas with actual readers.

Established black-box only. `getArticlesAsOf` selects on `articulo_span.vigencia
@> fecha`, so the spans are the obvious suspect — an article whose introducing
version was never fetched plausibly inherits a range reaching back to the
earliest version present. **I have not confirmed that**; it needs the DB or the
loader, neither of which this session can reach.

Detection is pinned: `version/no-anachronistic-articles` in `site/scripts/checks.ts`.

## P1 — carried over, still open

| # | problem | evidence |
|---|---|---|
| 1 | 75 normas where no date returns any text; `get_article` phrases it as a missing *article* | `audit_graph.py --only vigencia/unreachable` |
| 2 | 1,742 of 12,010 modification edges (14.5%) point at normas absent from the graph | `audit_graph.py --only edge/unresolvable` |
| 3 | Multi-version coverage ~40%; `res` at 26%. README reports 95%, counted per norma, carried by the 91% that are single-version | `completeness.ts --sample 300` |
| 4 | 10 normas with `hasta` before `desde` by more than the one-day idiom (up to 525 days) | `audit_graph.py --only vigencia/negative-duration` |
| 5 | idNorma 1014585 has two versions both claiming to be current | `audit_graph.py --only vigencia/multiple-open` |
| 6 | 3,746 normas with no publication date | `audit_graph.py --only norma/no-fecha-publicacion` |

## P2 — noted, low impact

- 89 `vigencia/open-not-last` — the benign half of the zero-duration idiom.
- 78 modification edges dated with the sentinel.
- 332 normas whose first version predates publication (usually lawful retroactivity).
