# Postgres-only search — retiring Meilisearch

**Status:** design, pending baseline measurement
**Date:** 2026-09-07

## Why

Meilisearch costs more than it earns. Three facts drive this:

1. **It duplicates data Postgres already indexes.** `articulo.tsv` is a stored
   generated `tsvector` with a GIN index over 100% of the corpus. Meilisearch
   holds `index_tier = 'full'` only — 28,453 of 358,221 normas (~8%), about
   319,819 article documents. Postgres already indexes a strict superset.

2. **Its storage is wildly disproportionate.** The Meili volume is 4.76 GB to
   Postgres's 5.19 GB — nearly as much disk for a twelfth of the corpus,
   alongside a database that holds everything plus full version history.

3. **Its memory model is the wrong shape for this deployment.** Meilisearch
   memory-maps its LMDB index. RSS grows to cover the working set and the OS
   reclaims only under pressure, so inside a container with a hard memory
   limit it climbs, plateaus high, and never falls. Railway bills observed RSS,
   so the mapped working set is a continuous charge. This is not a leak and
   cannot be tuned away — it is what mmap-backed engines do.

The governing requirement, stated by the project owner: **bounded RAM, must
work cold from disk.** That is a sharper filter than cost, and it is the axis
this design selects on. An index stored in Postgres block storage is bounded by
`shared_buffers` — a number we set — with pages faulting in on demand and
evicted under LRU. That is what "works cold from disk" means mechanically.

### The outage that settled the argument

On 2026-09-07 Meilisearch did not return from a Railway region migration.
Search returned nothing at all — including bare law numbers, which
`searchByNumber` answers entirely from Postgres. `runSearch` awaited
`searchHot` unconditionally, so an unreachable Meili threw past the two tiers
that had already succeeded; `/api/search` caught it and returned `{hits: []}`
with status 200.

A dependency serving 8% of the corpus took down 100% of search, and did it
invisibly. Fixed separately in `fix/search-meili-fallback`, which is a
prerequisite to this work but stands on its own.

## Production baseline (2026-09-07)

Measured against the live database via `railway connect Postgres`. These
supersede the synthetic figures elsewhere in this document wherever they
disagree.

**Corpus:** 333,026 normas · 872,411 articulos · 1,011,713 spans.
Tier split: 28,730 `full` (Meilisearch) vs 304,296 `meta`.

**Storage** — the comparison that motivates the whole migration:

| object | size |
|---|---|
| `articulo` heap | 995 MB |
| `articulo` indexes | 445 MB |
| **`articulo_tsv_idx`** (full-corpus FTS) | **304 MB** |
| `norma_titulo_trgm_idx` | 74 MB |
| **Meilisearch volume** (8% of corpus) | **4.76 GB** |

Meilisearch uses **15× the disk** of the Postgres FTS index that covers
**3.4× more** of the corpus.

**Latency** — `EXPLAIN (ANALYZE)`, `statement_timeout` 240 s:

| query | today | rank-first rewrite |
|---|---|---|
| rare term (`geotermia`, 149 matches) | **21,458 ms** | **135 ms** |
| common term (`contrato`, 60,644 matches) | 118 ms | 4,538 ms |
| common term, no `ts_headline` | 2.5 ms | — |

The 21.5-second rare-term query is live today, and the plan confirms the
diagnosis exactly: `Index Scan using
articulo_id_norma_slug_content_sha256_key … Rows Removed by Filter: 524720`,
with `articulo_tsv_idx` unused. The rewrite is 158× faster; the common term is
38× slower under it. Both facts together are why the routing exists.

`ts_headline` costs ~116 ms of the dense path's 118 ms. It is evaluated over
candidate rows before deduplication, so moving it outside the `DISTINCT ON`
— computing snippets only for the rows actually returned — is an obvious
follow-up, not yet done.

### Corrections this baseline forces

1. **`shared_buffers` is 128 MB**, not something comfortable. The claim
   elsewhere in this spec that `norma_search` (~254 MB projected) "stays
   resident in `shared_buffers`" is **wrong**. It does not fit, and neither
   does `articulo_tsv_idx` at 304 MB. `effective_cache_size` is 4 GB, so the
   OS page cache is doing the work, and cold-vs-warm matters a great deal —
   the trigram probe measured 1,437 ms cold and 445 ms warm for the same
   query. Raising `shared_buffers` is likely the cheapest single improvement
   available and should be evaluated independently of this migration.
2. **The trigram fallback is ~101 ms, not ~35 ms.** Synthetic data understated
   it badly. `<%` (word_similarity) is nonetheless 4.4× better than `%`:
   2,080 candidate rows against 19,669, of which `%` discards 17,972 on
   recheck. The two-stage design still holds, but the fallback is a tenth of a
   second, not a rounding error.
3. **There is no tsvector index on `norma.titulo` today**, so the lexeme stage
   currently plans a parallel sequential scan (159 ms). This is precisely the
   gap `norma_search` fills, and it means stage 1's synthetic ~4 ms should be
   re-measured once the table exists rather than assumed.
4. **Accent handling confirmed on real data**: `to_tsvector('spanish',
   'artículo')` and `…('articulo')` both yield `'articul'` and match. The
   cancelled `articulo.tsv` regeneration stays cancelled.

## Applied to production (2026-09-08)

`sql/003`–`005` applied via `railway connect Postgres`. Build costs:

| object | rows | build | size |
|---|---|---|---|
| `norma_search` | 333,026 | 30 s | 202 MB |
| `articulo_lexeme_freq` | 716,710 lexemes | 42 s | 61 MB |

`dense_cutoff` resolved to 1,868 (`2·√872411`). Routing on real data:
`geotermia` 149 → sparse, `expropiacion` 761 → sparse, `trabajo` 56,666 →
dense, `contrato` 60,644 → dense.

Server-side `EXPLAIN (ANALYZE)` execution time, warm:

| operation | before | after |
|---|---|---|
| typeahead `partidos politicos` | — | **3.0 ms** |
| typeahead `codigo del trabajo` | — | **2.8 ms** |
| typeahead, typo fallback | — | 86.4 ms |
| deep `geotermia` (149 matches) | **21,458 ms** | **114.5 ms** |
| deep `expropiacion` (761 matches) | — | 55.8 ms |
| deep `contrato` (60,644 matches) | 118 ms | 8.2 ms |

Typeahead lands at ~3 ms against a 20 ms target — the stage-1 index does what
the synthetic benchmark predicted, and the earlier 159 ms parallel seq scan on
`norma.titulo` is gone. The rare-term deep search is 187× faster.

Result quality is sound: `codigo del trabajo` returns DFL 1 (the actual code)
first; `partidos politicos` returns leyes 20915, 20542, 18905, 19527.

Note on measurement: wall-clock through the `railway connect` SSH tunnel adds
~195 ms to every statement — a bare `SELECT dense_cutoff` measures 188 ms. All
figures above are server-side execution time and exclude it.

These objects are additive and currently **unused by the deployed site**, which
still runs the pre-migration code. Nothing user-visible changed by applying
them.

## The decomposition

The reason "instant as you type" looks hard is that the current design answers
the wrong question per keystroke. Someone typing in ⌘K wants to find *a law* —
by title, common name, or number. They do not want a full-text sweep of every
article body in Chilean law. These are two different queries over two
different shapes of data, and splitting them is what makes the latency budget
achievable without Meilisearch.

### Surface 1 — typeahead (per keystroke)

A new `norma_search` table: one row per norma, 358,221 rows.

- Weighted `tsvector` over `titulo` (A), `nombres_uso_comun` (A), `materias` (B).
  `nombres_uso_comun` is weighted with the title because it is how people
  actually refer to a law ("ley de partidos", "Código de Comercio").
- `pg_trgm` GIN index over a normalized title+names text for typo tolerance.
  `pg_trgm` is already installed; `norma_titulo_trgm_idx` already exists.
- A precomputed `prominence` score for ranking.

No joins. No `asOf` filter — a norma's identity does not change with the
as-of date, only its text does, and typeahead does not show text. This is a
single-table lookup over a small, hot, fully-cached index.

**Target: under 20 ms.** For scale, the current ⌘K round-trips to Meilisearch
over the network on a 160 ms debounce.

### Measured — `sql/005_norma_typeahead.sql`

100k normas, `norma_search` at 71 MB including indexes (≈237 MB extrapolated to
production's 333k). Rebuild 4.2 s (≈14 s extrapolated). Best of 3.

**Superseded in part by the production baseline above:** 237 MB does *not* fit
in this instance's 128 MB `shared_buffers`, and the trigram fallback measures
~101 ms on the real corpus rather than the ~35 ms below.

| query | latency | path |
|---|---|---|
| `trabajador` | **4.5 ms** | stage 1 |
| `ambiente agua` | **3.9 ms** | stage 1 |
| `sindicat` | **4.4 ms** | stage 1 (stemmed) |
| `sindicato negociacion` | 27.3 ms | stage 1 thin → fallback |
| `trabajdor` (typo) | 39.8 ms | fallback |
| unknown word | 3.5 ms | no match |

The design is two-staged because scoring `word_similarity()` over every lexeme
match is what costs: a single title word matches thousands of normas, and each
pays for a trigram comparison it did not need. Combining both signals in one
query measured 35–65 ms; splitting them puts the common case — a correctly
spelled query — at ~4 ms, comfortably better than the Meilisearch round trip
it replaces.

Two calibration notes:

- `similarity()` is the wrong operator here. It compares the query against the
  *whole* title, so a short query against an 8-word title scores near zero and
  typo tolerance silently never fires. `word_similarity()` compares against the
  best-matching extent and is what the fallback uses.
- Postgres's default `word_similarity_threshold` of 0.6 barely admits a
  one-letter typo (`word_similarity('trabajdor', '… trabajador …')` = 0.615).
  The function sets 0.5 function-locally, so it cannot leak to other queries on
  the connection.

**Caveat:** these are synthetic titles built from a 150-word vocabulary, which
makes any single word match ~5% of all normas — pessimistic for the lexeme
stage and unrepresentative for trigrams. The shape of the result is sound; the
absolute numbers still want confirmation against the real corpus.

### Surface 2 — deep search (on submit)

`/buscar`, Enter from ⌘K, and the MCP `search_laws` tool. This is today's
`searchCold` with the `index_tier = 'meta'` predicate removed, so it becomes
exhaustive rather than complementary. Budget ~100–300 ms.

`/api/search` takes a `mode` parameter; `CmdK` sends `typeahead`, `/buscar`
sends `full`.

## The deep path: a query-shape bug, not an engine limit

An earlier draft predicted a "common-term cliff" — that `ts_rank_cd` and
`ts_headline` would make frequent words like `trabajo` the slow case.
**Measurement inverted this.** Benchmarked on a synthetic corpus of 100k
normas / 260k articulos / 260k spans (~0.3× production), Postgres 16:

| term | candidates | current `searchCold` shape | rank-first rewrite |
|---|---|---|---|
| `geotermia` (rare) | 32 | **640 ms** | **5.7 ms** |
| `contrato` | 43,333 | **2.6 ms** | 349 ms |
| `trabajo` | 221,002 | **2.6 ms** | 503 ms |

The rare term is the catastrophe, and the cause is that **`articulo_tsv_idx` is
never used** by the current query. `DISTINCT ON (n.id_norma) … ORDER BY
n.id_norma` forces an id_norma-ordered plan, so the planner walks the
`(id_norma, slug, content_sha256)` btree to avoid a sort and relies on
`LIMIT 20` to stop early:

```
Index Scan using articulo_id_norma_slug_content_sha256_key on articulo a
  Filter: (tsv @@ '''geotermi'''::tsquery)
  Rows Removed by Filter: 259968
  Buffers: shared hit=1190976 read=112020
```

When matches are dense the limit is satisfied within the first few thousand
rows and the query is genuinely fast. When matches are sparse it can never
accumulate 20 distinct normas, so it scans the entire table. The GIN index sits
unused throughout. This is live in production today.

`ts_headline` is a modest constant (2.6 ms → 0.6 ms when removed at 221k
candidates), not the dominant cost. Precomputed snippets are not needed.

### Consequence for the fork

The two shapes are complementary — each is fast exactly where the other is
slow — so the fix is to **choose the shape by selectivity**, and it needs no
extension:

- dense term → current `DISTINCT ON` shape (2.6 ms)
- sparse term → rank-first subquery, which uses `articulo_tsv_idx` (5.7 ms)

Selectivity is known cheaply from a lexeme-frequency table built at load time
(`ts_stat` over `articulo.tsv`), so the choice costs a single indexed lookup
rather than a count.

This demotes the extension question from "required" to "only if we want true
global BM25 relevance on dense terms". The rank-first shape at 503 ms / 260k
articulos extrapolates to roughly 1.7 s at production's 872k, which is why it
must not be used for dense terms — but the hybrid never asks it to.

**Revised decision rule:** ship the hybrid on native GIN. Revisit RUM or
`pg_search` only if relevance quality on dense terms proves unacceptable in
practice — a judgement that needs real queries, not a benchmark.

### Measured result

`search_articulos_deep()` in `sql/004_search_deep.sql`, same corpus, best of 3:

| term | est. matches | shape | hybrid | was |
|---|---|---|---|---|
| `trabajo` | 221,002 | dense | **4.9 ms** | 2.5 ms |
| `contrato` | 43,333 | dense | **5.3 ms** | 2.6 ms |
| `zeolita` | 5,200 | dense | **12.9 ms** | 10.7 ms |
| `bentonita` | 1,300 | dense | **36.6 ms** | 32.6 ms |
| `tectonica` | 260 | sparse | **29.3 ms** | 175.9 ms |
| `geotermia` | 32 | sparse | **8.4 ms** | 663.8 ms |
| unknown word | 0 | sparse | **5.6 ms** | — |

Worst case falls from 664 ms to 37 ms, and the pathological rare-term case is
79× faster. The peak now sits at the crossover, where both shapes are cheap,
which is the right place for it.

### Known relevance limit of the dense shape

The dense shape's speed comes from stopping the id_norma walk once `lim`
distinct normas are found, which makes the *choice* of normas arbitrary with
respect to relevance — lowest `id_norma` wins. Sorting the chosen rows by rank
orders what is returned but cannot recover what was never considered. This is
also exactly what production does today, so the hybrid does not regress it.

Fixing it properly means ranking every match, which at dense selectivity is the
500 ms shape. **This is the one quality gap that would justify RUM or
`pg_search`** — and the only remaining reason to revisit the fork.

All candidate engines satisfy the bounded-RAM requirement; Meilisearch is the
only option that does not. That constraint no longer discriminates between
them, because native GIN now suffices.

## Accent handling — much narrower than it first appeared

An earlier draft of this spec claimed the Postgres paths could not match
`articulo` against `artículo`, and scheduled a full regeneration of
`articulo.tsv` as the most expensive step of the migration. **That was wrong**,
and measurement on Postgres 16 says so:

| pair | stock `spanish` | `spanish_unaccent` |
|---|---|---|
| `artículo` / `articulo` | ✅ | ✅ |
| `público` / `publico` | ✅ | ✅ |
| `sesión` / `sesion` | ✅ | ✅ |
| `Valparaíso` / `Valparaiso` | ✅ | ✅ |
| `año` / `ano` | ❌ | ✅ |
| `niño` / `nino` | ❌ | ✅ |
| `Ñuñoa` / `Nunoa` | ❌ | ✅ |

The Snowball Spanish stemmer already removes acute vowel accents as part of
normalization, so every á/é/í/ó/ú pair folds under the stock configuration.
The only genuine gap is **ñ → n**, which the stemmer does not fold.

Consequences:

- The expensive step is **cancelled**. Regenerating `articulo.tsv` across the
  full corpus buys ñ-folding and nothing else, which does not justify rewriting
  a stored generated column over ~872k rows. It is deferred indefinitely and is
  not a prerequisite for anything.
- `norma_search` uses `spanish_unaccent` anyway, because the table is new and
  the configuration costs nothing to adopt at build time. Typeahead therefore
  gets ñ-folding for free; deep search keeps stock `spanish` behaviour.
- Should ñ-folding on article bodies ever be wanted, it is an independent,
  optional change rather than part of this migration.

## Ranking signal — reuse, not deletion

`analytics.norma_signal` currently drives tier *promotion* in `retier.py`. With
tiers gone it becomes the typeahead *prominence* signal. Same data, better job:
as a promotion trigger it was self-fulfilling (an unindexed phrase is never
found, so its norma never earns promotion), whereas as a ranking input it
simply orders results that were all findable anyway.

`TIPO_RANK` — currently duplicated in `site/lib/search.ts` and
`scripts/loader/index_meili.py` — collapses into `norma_search.prominence`.

## What deleting Meilisearch removes

- `scripts/loader/index_meili.py`, `scripts/loader/reindex.py`
- `scripts/loader/retier.py` and its budget machinery
- `INDEX_BUDGET_BYTES`, `norma.index_tier`, `norma.seeded`
- `MEILI_URL` / `MEILI_MASTER_KEY` / `MEILI_SEARCH_KEY` across `web`, `loader`
- the `meilisearch` npm and Python dependencies
- the Railway service and its 4.76 GB volume
- the entire hot/cold drift failure class the loader docstrings defend against
  ("search returns a norma whose page 404s")

`analytics.event`'s `cold_surface` kind loses its meaning and is retired with
`retier.py`.

## Rollout

Meilisearch is already documented as a "derived, droppable read model" — it can
be rebuilt from Postgres at any time and is never authoritative. That makes
this reversible at every step.

1. **Land the outage fix.** Search survives without Meili. *(done, pending commit)*
2. **Measure.** `search_baseline.sql` → decide the fork.
3. **Build `norma_search`** + migration + typeahead query path, behind `mode`.
4. **Cut ⌘K over to `mode=typeahead`.** Meili still serves deep search.
5. **Widen the deep path** to the whole corpus per the fork decision.
6. **Stop indexing.** Drop `index_meili`/`reindex`/`retier` from `loader.main`.
7. **Delete the service, the volume, the env vars, the dependencies.**

Steps 1–4 are independently valuable and independently revertible. The Meili
service is not deleted until step 7, so any step can be rolled back by
redeploying the previous build.

## Testing

- **Typeahead ranking** — table-driven cases over a seeded fixture corpus:
  a bare number finds the law, a common name finds it, a misspelling finds it,
  and a `ley` outranks a `res` at equal textual relevance.
- **Deep search** — the widened query returns results for a norma in the former
  `meta` tier, which Meilisearch never held.
- **Accent equivalence** — `año`/`ano` and `Ñuñoa`/`Nunoa` match on the
  typeahead path, pinning the one fold that is not already free. Vowel-accent
  pairs are covered by the stemmer and need no test of ours.
- **Latency** — assert the typeahead query plan uses the expected index rather
  than asserting wall-clock, which is not stable in CI. Wall-clock stays in
  `search_baseline.sql`, run against production data.
- **Resilience** — `search.resilience.test.ts` already guards the inverse: a
  Postgres failure must throw rather than report an empty corpus.

## Out of scope

- Semantic/vector search.
- Cross-norma relevance tuning beyond `prominence` and `TIPO_RANK`.
- Changing the `articulo`/`articulo_span` model. `norma_search` is derived and
  rebuildable, like every other read model here.
