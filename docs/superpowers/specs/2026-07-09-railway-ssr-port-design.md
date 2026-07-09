# Railway SSR port — design spec

**Date:** 2026-07-09
**Branch:** `feat/railway-ssr` (worktree at `.worktrees/railway-ssr`)
**Status:** Approved scope; pre-implementation
**Owner:** Max Morel

## 1 · Goal

Move ley-chile off GitHub Pages onto a deployed Railway server with server-side rendering and a real query layer, so that:

1. **Search works.** Today the client downloads a `titles.json` covering 357k normas and matches on títulos only. The corpus text itself is unsearchable. After this port, every article of every historical version is reachable by full-text query, including *as of a given date* — a capability LeyChile itself does not offer.
2. **Pages are indexable.** Every norma and every version is a server-rendered URL with correct canonicals, sitemaps, and `Legislation` JSON-LD.
3. **Dynamic features become possible.** Cross-law queries, arbitrary date-range views, and an API surface that does not require precomputing every answer into a static JSON shard.

## 2 · Non-goals

- **No change to the pipeline's output contract.** `build_catalog → fetch_normas → fetch_versions → build_history` continues to run in GitHub Actions and continues to write `historial`. One new export step is appended.
- **No user accounts.** Annotations remain in `localStorage`, exactly as today.
- **No user tracking.** The usage-based indexing policy (§7) stores per-norma counters only. No user identifiers, no analytics vendor, no beacon.
- **No migration of `historial` into a database as canonical.** Git stays canonical (§3).
- **No demotion/eviction in v1.** The index budget is enforced by refusing promotion, not by evicting. Eviction ships when the cap actually binds.

## 3 · Source of truth

`historial` remains the authoritative artifact. Postgres and Meilisearch are **derived read models** that can be dropped and rebuilt at any time.

This is only a real property if rebuilding is a command you can actually run, which constrains the ingestion design (§5): the rebuild input must be a versioned, re-downloadable artifact, not "re-run the pipeline against production."

Direction of travel is strictly one-way, and each store has exactly one writer:

```
git (historial) ──▶ snapshot artifacts ──▶ Postgres ──▶ Meilisearch
```

Nothing writes to Meilisearch except the indexer reading from Postgres. Indexing both stores in parallel from the pipeline would create two ingestion paths that drift, and the drift surfaces as *search returns a norma whose page 404s* — the worst available failure mode for a legal reference site.

The one writer outside this chain is the web tier, which appends to `norma_signal` (§7.3). It writes no corpus data, and dropping that table costs only the promotion history.

## 4 · Service topology

```
  BCN / LeyChile
        │
        ▼
  ┌─────────────────────────────────────┐
  │  GitHub Actions (existing pipeline) │
  │  build_catalog → fetch_normas       │
  │  → fetch_versions → build_history   │
  └───────────┬─────────────┬───────────┘
              │             │
    commits   │             │  NEW: export_snapshot.py
              ▼             ▼
     ┌────────────────┐   ┌──────────────────────┐
     │ historial      │   │ snapshot artifacts   │
     │ (canonical)    │   │ NDJSON.gz + manifest │
     └────────────────┘   └──────────┬───────────┘
                                     │ poll manifest
  ═══ RAILWAY ═══════════════════════▼══════════════════
     ┌──────────────┐  upsert   ┌──────────────┐
     │ loader (cron)├──────────▶│  Postgres    │
     │   Python     │           │  (volume)    │
     └──────┬───────┘           └──────┬───────┘
            │ index from PG            │ SQL
            ▼                          │
     ┌──────────────┐                  │
     │ Meilisearch  │◀─────────────────┤
     │  (volume)    │   hot-path search│
     └──────┬───────┘                  │
            │                          │
            └────────┬─────────────────┘
                     ▼
              ┌──────────────┐
              │ web: Next.js │  ◀── revalidate webhook from loader
              │  (SSR + ISR) │
              └──────────────┘
                     ▲
              ┌──────┴───────┐
              │  Cloudflare  │  (free tier, edge cache)
              └──────────────┘
```

Four Railway services: `web`, `postgres`, `meilisearch`, `loader` (cron).

### 4.1 Failure behavior

| Component down | Effect |
|---|---|
| Meilisearch | `/buscar` degrades to the Postgres cold path (§7). Slower, exhaustive, live. |
| loader | Site serves stale-but-correct data indefinitely. It reads Postgres, not artifacts. |
| GitHub Actions | Nothing on Railway notices. |
| Postgres | Site is down. This is the only hard dependency of the web tier. |

## 5 · Ingestion

### 5.1 Export (GitHub Actions)

A new `scripts/export_snapshot.py` runs at the end of the existing workflow, where the `historial` worktree and `graph.json` are already on disk. It emits gzipped NDJSON shards plus a `manifest.json` carrying the watermark, published as a **GitHub Release** (free, versioned, re-downloadable; shard to stay under the 2 GB per-file limit).

- **Full snapshot** — on demand, and on schema change.
- **Delta artifact** — on every incremental run, scoped to the normas that run appended commits for. The pipeline already knows this set; no diffing required.

### 5.2 Load (Railway cron)

The loader is **Python**, so it reuses `scripts/schemas/` rather than re-deriving those types in TypeScript. It polls `manifest.json`, compares the published watermark against `load_state.watermark`, and applies deltas if behind.

Every write is an idempotent upsert keyed on `(id_norma, desde)`. A crashed load is retried, never repaired.

Phases, in order: **load → verify (§8.1) → index → retier (§7.3) → revalidate.**

### 5.3 Dates

`historial`'s committer dates are **unreliable**: GitHub rejects negative Unix timestamps, so pre-1970 events clamp to 1970-01-01, and same-day publications can shift by a day.

`export_snapshot.py` **must** reuse `real_date()` from `scripts/build_web_indexes.py`, which recovers the true date from the commit subject. Every date in Postgres derives from it. Reading committer dates would silently misdate two centuries of legislation.

### 5.4 Rejected alternatives

- **Actions pushes directly into Railway Postgres.** Fastest to stand up. Rejected: production credentials in CI secrets; a cancelled job leaves the DB half-updated with no clean recovery; "rebuild from scratch" becomes "re-run the pipeline against production."
- **Railway worker clones `historial` and replays commits.** Self-contained. Rejected: ingesting every historical version means walking ~408k commits, so shallow/blobless clones don't help — the blobs are the payload. Multi-GB pack onto a Railway volume, `git` in the runtime image, paid on every cold rebuild, to re-derive what CI already had in a directory. **Reconsider if Phase 0 (§9) finds `historial` alone is under ~1 GB.**
- **Ingest from `pipeline-cache` instead.** That branch holds every version as flat files (`cache/versions/{id}/{fecha}.json`), so a depth-1 clone yields the whole corpus with no commit-walking. Rejected as a foundation: `historial`'s `texto.md` is the *rendered* output of `render_texto.py`, and its commit SHAs back the permalinks. Ingesting from cache means re-running the renderer and hoping for byte-identical output — a silent-drift generator. Retained as an escape hatch if artifact generation proves slow.

## 6 · Data model

**Central idea:** store each distinct article body once, and store when it was in force. Do not store 408k full version texts.

A version's text is *reconstructed* by selecting the articles whose validity range contains the requested date. An artículo that survived five amendments unchanged is one row, not five. Given 1.14 versions per norma on average, and amendments touching a handful of articles, this collapses to "one copy of every article that ever existed" — and makes *what did Artículo 19 say in 1998* a range-containment query rather than a diff.

### 6.1 Schema

```sql
CREATE TABLE norma (
  id_norma           integer PRIMARY KEY,
  tipo               text NOT NULL,      -- ley | dto | res | dl | dfl | cod …
  numero             text NOT NULL,
  titulo             text NOT NULL,
  organismo          text,
  clasificacion      text,               -- sustantiva | modificatoria
  derogado           boolean NOT NULL DEFAULT false,
  fecha_publicacion  date,
  law_dir            text NOT NULL,      -- 'leyes/20330' — path in historial, for git permalinks
  index_tier         text NOT NULL DEFAULT 'meta' CHECK (index_tier IN ('full','meta')),
  seeded             boolean NOT NULL DEFAULT false
);
CREATE INDEX ON norma (tipo, numero);
CREATE INDEX ON norma USING gin (titulo gin_trgm_ops);

CREATE TABLE version (
  id            bigserial PRIMARY KEY,
  id_norma      integer NOT NULL REFERENCES norma,
  desde         date NOT NULL,
  hasta         date,                    -- NULL = vigente
  commit_sha    text,                    -- historial commit that introduced it
  causa_id      integer,                 -- norma that caused this version
  subject       text,
  magnitude     integer,
  texto_sha256  text NOT NULL,           -- integrity check, see §8.1
  vigencia      daterange GENERATED ALWAYS AS (daterange(desde, hasta, '[]')) STORED,
  UNIQUE (id_norma, desde),
  EXCLUDE USING gist (id_norma WITH =, vigencia WITH &&)
);

CREATE TABLE articulo (
  id           bigserial PRIMARY KEY,
  id_norma     integer NOT NULL REFERENCES norma,
  slug         text NOT NULL,            -- 'art-5-bis'
  label        text NOT NULL,
  body         text NOT NULL,
  body_sha256  text NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('spanish', body)) STORED,
  UNIQUE (id_norma, slug, body_sha256)   -- the dedup key
);
CREATE INDEX articulo_tsv_idx ON articulo USING gin (tsv);

CREATE TABLE articulo_span (
  articulo_id  bigint NOT NULL REFERENCES articulo,
  desde        date NOT NULL,
  hasta        date,
  ord          integer NOT NULL,         -- position within that span's versions
  vigencia     daterange GENERATED ALWAYS AS (daterange(desde, hasta, '[]')) STORED,
  PRIMARY KEY (articulo_id, desde)
);
CREATE INDEX ON articulo_span USING gist (vigencia);

CREATE TABLE modificacion (
  causa_id   integer NOT NULL,
  target_id  integer NOT NULL,
  fecha      date NOT NULL,
  commit_sha text,
  PRIMARY KEY (causa_id, target_id, fecha)
);

-- Daily buckets, not a cumulative counter: the promotion rule (§7.3) is
-- "hits >= 3 in a trailing 90 days", which a single lifetime total cannot
-- express. Retier sums the window; rows older than 90 days are pruned.
CREATE TABLE norma_signal (
  id_norma integer NOT NULL REFERENCES norma,
  day      date NOT NULL,
  hits     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id_norma, day)
);
CREATE INDEX ON norma_signal (day);

CREATE TABLE load_state (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  watermark        date NOT NULL,
  snapshot_version text NOT NULL,
  last_delta_seq   integer NOT NULL
);
```

Three decisions worth defending:

- **`ord` lives on the span, not the article.** Amendments insert articles, so reading order is a property of a version, not of an article. Putting `ord` on `articulo` would silently corrupt the order of historical versions.
- **The exclusion constraint is load-time protection, not decoration.** Overlapping version ranges for one norma is exactly the bug a delta loader introduces, and exactly the bug that makes "text as of date D" ambiguous. Let the database refuse it.
- **`version.texto_sha256` closes the loop.** See §8.1.

### 6.2 Segmentation moves to Python

Article segmentation currently lives in TypeScript (`HEADING_RE`, `labelToSlug` in `web/src/lib/diff.ts`), but the exporter is Python. Duplicating the heuristic creates two implementations that will drift, and the symptom of drift is articles silently failing to align across versions.

**Segmentation moves to Python, at ingest, as the single source of truth.** Articles land pre-segmented with stable slugs; the frontend receives structured articles and stops re-parsing `texto.md`. This is an improvement independent of the port — the heuristic runs once over the corpus where it can be tested against all 408k versions, rather than on every page render.

`diff.ts` keeps its diffing role and loses its parsing role. `labelToSlug` must be ported **exactly**, guarded by the golden test in §8.2.

## 7 · Search

### 7.1 Two tiers, two engines

Every norma carries an `index_tier`:

- **`full`** — article bodies live in Meilisearch. Typo-tolerant, instant, search-as-you-type.
- **`meta`** — only título/número/organismo live in Meilisearch's `normas` index. Body text is not in Meili.

**`meta` does not mean unsearchable.** Postgres carries a `tsvector` GIN index over the *entire* article corpus (§6.1), hot and cold alike — ~1–2 GB of disk, no standing RAM.

So: **Meilisearch is the fast, forgiving hot path over the ~8% of the corpus anyone searches; Postgres FTS is the exhaustive, slower cold path over everything.**

### 7.2 Query flow

1. Query Meilisearch over the `full` tier. Render immediately.
2. If it returns fewer than `K` hits (or the user asks for *buscar en todo el corpus*), run Postgres FTS over `index_tier = 'meta'` and stream the results in as a **separately labeled section**.
3. Any norma surfaced by the cold path increments `norma_signal` by 3.

The `WHERE index_tier = 'meta'` predicate keeps the two result sets disjoint.

**The failure mode this is designed against:** a naive usage-based policy is self-fulfilling. A phrase appearing only in an unindexed `res` is never found → that norma never gets traffic → it is never promoted → the phrase stays unfindable, and the signal you measure is the one you suppressed. The cold path is what breaks the loop.

### 7.3 The policy

**Seed** (`seeded = true`, never demoted): `tipo ∈ (ley, dl, dfl, cod)` plus any `dto` appearing in `modificacion`. Roughly 30k normas, ~8% of the corpus.

**Signals**, incremented server-side into the current day's bucket:
- `+1` when a user clicks a search result
- `+3` when a norma is surfaced by the cold path

**Not measured: page views.** Cloudflare caches those at the edge, so the origin never sees most of them and the signal would be silently biased toward uncached pages. Browsing to a law from a link means someone followed a link, not that anyone searched its text. Search-derived signals are inherently uncacheable, origin-visible, and measure precisely the thing the index exists to serve.

**Retiering** runs as a phase of the loader cron, daily:
- Promote `meta` normas whose `norma_signal` buckets sum to `≥ 3` over the trailing 90 days.
- Prune `norma_signal` rows older than 90 days.
- Enforce `INDEX_BUDGET_BYTES`. In v1, exceeding the budget **refuses further promotion** and logs. Eviction of the coldest non-seeded normas ships in v2, when the cap actually binds.
- Tier changes translate to Meilisearch document adds and deletes by `id_norma`.

### 7.4 Meilisearch configuration

Two indexes.

`articulos` — documents keyed `{id_norma}:{slug}:{body_sha[:8]}`, carrying `body`, `label`, `titulo`, and `desde_ts` / `hasta_ts` as integer timestamps (`hasta_ts = 253402300799` for open-ended).

- `searchableAttributes: ["titulo", "label", "body"]` — order sets ranking priority
- `filterableAttributes: ["id_norma", "tipo", "organismo", "anio_pub", "derogado", "desde_ts", "hasta_ts"]`
- as-of query: `desde_ts <= T AND hasta_ts >= T`, defaulting `T = now`
- a numeric `rank_tipo` plus a custom ranking rule, so a `ley` outranks a `res` at equal textual relevance

**Do not set `distinctAttribute` at the index level.** Index-level `distinct` applies to every query, which would silently break *show me all matching artículos inside this law*. Pass `distinct: "id_norma"` as a **per-search parameter** for corpus-wide search; omit it for in-law search.

`normas` — 357k tiny metadata docs (id, tipo, número, título, organismo, año) backing the Cmd-K palette. All normas appear here regardless of tier, so **no norma is ever unfindable by name or number.**

### 7.5 Accepted costs

- **Two rankers means two ranking behaviors.** The seam between hot and cold results is visible. The UI presents a labeled second section, not a silently merged list — a merged list would imply a coherence that does not exist.
- **Promotion has latency.** A norma promoted today is not typo-tolerant until tomorrow's cron. The first few people searching an obscure resolución get the slow path. This is the price of not indexing everything.

## 8 · Correctness

### 8.1 The validation gate

One acceptance criterion, binary: **reconstruct all 408,182 versions from `articulo` + `articulo_span`, hash each, and compare against the `texto.md` committed to `historial`. 100% match, or no cutover.**

This is why `version.texto_sha256` exists. It converts *did our dedup scheme silently lose text from a 1943 decreto* from a question discovered in production into a number computed before launch. The loader runs the same check per-batch on every incremental load, and fails loudly.

### 8.2 Tests

Follows the existing convention — `tests/` covers pure functions, no network, no git:

- segmentation, `label_to_slug`, span merging (dedup + contiguous-range coalescing), delta selection from the manifest
- a **golden test** running the Python and TypeScript `labelToSlug` over a fixture corpus, asserting byte-identical output. This is the single point where drift would be invisible and expensive.
- loader integration against an ephemeral Postgres: assert the exclusion constraint rejects overlapping versions; assert reconstruction verification fails loudly on a corrupted article
- frontend keeps its Vitest suite; `diff.ts` loses parsing, keeps diffing, keeps its tests

### 8.3 Segmentation fallback

`HEADING_RE` was written for laws. It will meet 173k decretos, 147k resoluciones, and pre-1930 `dl-1924` text with irregular formatting.

The mitigation is already latent in `diff.ts`: the `__doc__` label for unsegmentable text. **A norma whose segmentation does not produce clean artículos stores one article with slug `doc` containing the whole body.** Reconstruction still hash-verifies, search still works at document granularity, and only article-level addressing is lost. The failure mode is graceful degradation, not corruption.

Phase 0 measures the fallback rate. High among `res`/`dto` is acceptable. **High among `ley` is a stop-and-fix.**

## 9 · Web tier

### 9.1 URLs

`/[tipo]/[numero]` for current text; `/[tipo]/[numero]/[fecha]` for text as of a date.

Existing GitHub Pages URLs are already `/ley/20330` and `/ley/20330/2009-04-15`. Since `ley` *is* a `tipo`, those paths survive the port unchanged — no redirect table for the only URLs anyone has linked. The shape generalizes for free to `/dto/100`, `/dl/3500`, `/cod/1`. Collisions (same número, different `idNorma`) take the `-{idNorma}` suffix `law_dir()` already uses.

Reserve `buscar`, `api`, `sitemap`, `_next` against the `tipo` namespace.

Plus `/buscar?q=&asOf=&tipo=&organismo=` and `/llms.txt`.

**Rejected:** mirroring the git path exactly (`/leyes/20330`, `/dfl/hacienda/1`). Conceptually lovely — website path ≡ repo path — but `law_dir` has variable depth, so appending a date segment forces a catch-all route with hand-rolled parsing. `law_dir` stays a column for building git permalinks.

### 9.2 Caching

Every page is `use cache` with `cacheTag('norma:{id}')` and `cacheLife('max')`. When the loader finishes, it POSTs the changed `idNorma`s to `/api/revalidate`, which calls **`revalidateTag`** — stale-while-revalidate, the correct semantic here. (`updateTag` is for read-your-writes after a mutation in the same request; this is not that.)

This works because the data is overwhelmingly immutable: a 1997 law's text as of 1997 will never change, and ~97% of normas have exactly one version and are never invalidated.

**Railway caveat:** Next's `use cache` defaults to in-memory storage. On Railway that is process memory — it dies on redeploy and is not shared across replicas. **Run a single web replica** and accept a cold cache after deploys; a cold render is one indexed Postgres range query. If p99 suffers or replicas become necessary, the fix is a custom `cacheHandler` backed by Redis (a fifth service). Measure before paying for it.

**Cloudflare free tier sits in front.** Pages are immutable; a full Googlebot crawl of 408k pages should never touch Railway.

### 9.3 SEO

Sitemaps via `generateSitemaps()`, 50k URLs per file, `id` awaited as a Promise (Next 16), driven off Postgres.

The important call is **what not to index.** Naively there are ~765k URLs (357k canonical + 408k dated). For a single-version norma, `/ley/X` and `/ley/X/1997-03-04` are byte-identical — textbook duplicate content across ~350k URLs.

- **multi-version norma** → each dated URL is self-canonical and indexed. These are the genuinely unique pages, and the reason the site exists.
- **single-version norma** → the dated URL carries `<link rel="canonical">` pointing at the undated one.

That leaves ~408k indexable URLs, ~9 sitemap files, every indexed page substantively unique. `version` already tells us which bucket a norma is in: a `COUNT(*) > 1`, not a heuristic.

Each page emits schema.org **`Legislation`** JSON-LD (`legislationIdentifier`, `legislationDate`, `legislationLegalForce`, `legislationChanges`), which maps cleanly onto the model including the modification edges.

### 9.4 Rendering

Server-render the article list from Postgres — one range-containment query against `articulo_span`. Stream the shell, then articles. `RedlineReader`, `ChronologyPanel`, `VersionScrubber` stay client components hydrated with server-fetched data, so Cmd-K and the diff view keep working as they do now.

Framework is **Next.js App Router**. TanStack Start does real SSR and was the initial recommendation on continuity grounds, but there are only four route files (`__root`, `index`, `ley.$numero.index`, `ley.$numero.$fecha`) — the work lives in 18 components and 15 framework-agnostic lib modules that port either way. Continuity buys nothing; Next's metadata/sitemap/ISR maturity matters for a 357k-page SEO-critical site.

## 10 · Cost

Railway bills actual usage: **RAM $10/GB-month, vCPU $20/vCPU-month, volume $0.15/GB-month, egress $0.05/GB.** Hobby is $5/month including $5 of usage credit.

**RAM is the bill, not disk** — 67× the per-GB price. Volume is close to free.

| Service | RAM | vCPU | Volume | Est. /mo |
|---|---|---|---|---|
| Meilisearch (~30k normas, `full` tier) | ~0.5 GB → $5 | ~$2 | 3 GB → $0.45 | **~$8** |
| web (Next.js, 1 replica) | 0.7 GB → $7 | ~$3 | — | ~$10 |
| Postgres (incl. tsvector GIN) | 0.5 GB → $5 | ~$2 | 8 GB → $1.20 | ~$8 |
| loader (cron, exits) | — | — | — | ~$0.50 |
| egress (Cloudflare-shielded) | | | | ~$0 |
| **Total** (Hobby $5, $5 credit) | | | | **≈ $27** |

Postgres TOAST-compresses `text` automatically (~4× on legal prose), so ~5 GB of raw text becomes ~1.3 GB stored. Do not architect around Postgres storage cost; it is noise.

The soft number is Meilisearch RAM. It memory-maps LMDB, so resident set grows with working set. `INDEX_BUDGET_BYTES` is the control.

**Rejected: Railway Serverless / app-sleeping.** Per Railway's docs the first request to a slept service "may return a 502 Bad Gateway." A 502 served to Googlebot on a cold page is precisely the outcome this port exists to escape. It is also ineffective for Meilisearch, since outbound traffic from connection poolers prevents sleeping.

## 11 · Rollout

**Phase 0 — measurement. Gates everything.**

1. `git clone --single-branch -b historial && git count-objects -vH`. If `historial` alone is under ~1 GB, reconsider §5.4's rejected worker-clone ingestion.
2. Segmentation coverage over a stratified sample across `tipo` and century. What fraction segments cleanly into artículos? (§8.3 stop condition.)
3. Meilisearch index size from a 5% stratified sample of the seed tier, extrapolated. Sizes the volume and validates the §10 RAM guess.

**Then:**

1. `export_snapshot.py` + Python segmentation port + golden test
2. Postgres schema + idempotent loader + reconstruction verification
3. Meilisearch indexer reading from Postgres + retier job
4. Next.js app: routes, SSR, cache tags, sitemap, JSON-LD
5. Cutover

**Cutover is parallel, not a switch.** Railway runs alongside GitHub Pages until the §8.1 validation gate passes; Pages then serves a redirect. Nothing about the pipeline or `historial` changes, so rollback is *stop pointing DNS at Railway*.

## 12 · Open questions

- `K` (the hot-path result threshold that triggers the cold path) — pick empirically once real queries exist.
- `INDEX_BUDGET_BYTES` initial value — set from the Phase 0 sample extrapolation.
- Whether `res` results should be **ranked down or filtered out by default** in the Cmd-K palette. They remain present in the `normas` index either way — §7.4's guarantee that no norma is unfindable by name or number is not negotiable. This is a ranking default, not an indexing decision.
