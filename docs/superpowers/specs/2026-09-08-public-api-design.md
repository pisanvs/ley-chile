# Public REST API — design

**Status:** approved design, pending implementation
**Date:** 2026-09-08

## What this is

A public, read-only HTTP JSON API over the Chilean legal corpus, covering the
same ground as the MCP server at `/api/mcp`, authenticated with API keys that
the operator provisions by hand, with per-key usage recorded for observability.

## Why it is not a wrapper around MCP

The MCP server returns **prose formatted for language models** — capped article
bodies, human-readable citation lines, ambiguity notes. A REST client wants
**structured JSON**. Wrapping one in the other would force every REST consumer
to parse text that was shaped for an LLM's context window.

`site/app/api/[transport]/route.ts` is already only a presentation layer: it
imports `getNormaById`, `getArticlesAsOf`, `getVersions`, `getModifies`,
`getModifiedBy`, `getOrganismosByIds` from `@/lib/norma` and `runSearch`,
`searchArticles` from `@/lib/search`, then formats. The REST API is a second
presentation layer over those same functions.

```
                 @/lib/norma  ·  @/lib/search
                        │              │
        ┌───────────────┴──────┬───────┴────────────┐
        │                      │                    │
   MCP  (prose)          REST /v1 (JSON)        site pages
```

Behaviour that must not diverge — the 12 KB article-body cap, the `idNorma`
ambiguity handling, the as-of date semantics — belongs in the lib, so all three
surfaces inherit it rather than reimplementing it.

## Endpoints

All under `/v1`, all `GET`, all requiring a key.

| endpoint | returns |
|---|---|
| `/v1/search?q=&asOf=&limit=` | normas matching free text |
| `/v1/search?tipo=&numero=` | normas matching a citation, all candidates |
| `/v1/normas/{idNorma}` | metadata + article index, no bodies |
| `/v1/normas/{idNorma}/articulos?fecha=&q=` | article index at a fecha; `q` searches **within** the norma and adds snippets |
| `/v1/normas/{idNorma}/articulos/{slug}?fecha=` | one article body |
| `/v1/normas/{idNorma}/versiones` | version history |
| `/v1/normas/{idNorma}/diff?from=&to=` | structured diff between two versions |
| `/v1/normas/{idNorma}/modificaciones` | what modified this norma, and what it modified |
| `/v1/normas/{idNorma}/raw?fecha=` | canonical upstream leychile.cl link |

### Why `idNorma` is the addressing primitive

`(tipo, numero)` is **not unique**. There are several `DFL 1`, one per
organismo, and the reader code already carries a hard-won comment: `/ley/20780`
once resolved to a decreto whose `id_norma` happened to be 20780. Putting an
ambiguous key in a public URL path would bake that bug into the contract.

Citation-style access is served by `/v1/search?tipo=ley&numero=20780`, which
returns every candidate with its `idNorma` and `organismo` so the caller can
disambiguate deliberately rather than accidentally.

### Coverage against the MCP tools

| MCP tool | REST equivalent |
|---|---|
| `search_laws` | `GET /v1/search` |
| `search_articles` | `GET /v1/normas/{idNorma}/articulos?q=` |
| `get_law` | `GET /v1/normas/{idNorma}` |
| `get_article` | `GET /v1/normas/{idNorma}/articulos/{slug}` |
| `list_versions` | `GET /v1/normas/{idNorma}/versiones` |
| `diff_versions` | `GET /v1/normas/{idNorma}/diff` |
| `get_modifications` | `GET /v1/normas/{idNorma}/modificaciones` |
| `get_raw_link` | `GET /v1/normas/{idNorma}/raw` |

`search_articles` becomes a query parameter rather than its own path because it
is a filter over the same collection the bare endpoint returns — with `q` the
response carries `snippet` per article, without it the full index.

### Field naming

Spanish domain terms are kept: `titulo`, `numero`, `tipo`, `articulos`,
`vigencia`, `organismo`. `norma`, `dfl` and `dto` have no honest English
equivalents, and a half-translated schema is worse than an untranslated one.
Structural fields that are not domain terms stay conventional (`limit`,
`total`, `error`).

## Authentication

```
Authorization: Bearer lc_live_<24 random bytes, base64url>
```

```sql
CREATE TABLE api_key (
  id         bigserial PRIMARY KEY,
  key_hash   text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
```

- **Only the SHA-256 of the key is stored.** The plaintext is returned once at
  issue time and is unrecoverable afterwards. A database leak does not yield
  usable keys.
- `key_prefix` (e.g. `lc_live_a1b2c3d4`) exists solely so a human can tell keys
  apart in a listing. It is not sufficient to authenticate.
- Verification is one indexed probe on `key_hash` — constant work, no scan, and
  no string-comparison timing channel, because an attacker cannot produce the
  hash without already holding the key.
- A key is valid when it exists and `revoked_at IS NULL`. Revocation is
  `UPDATE api_key SET revoked_at = now() WHERE key_prefix = …`, effective on the
  next request.

### Provisioning

```sql
SELECT issue_api_key('Acme Corp');
```

Returns the plaintext key exactly once. Implemented with `pgcrypto`
(`gen_random_bytes`), so it needs no local checkout, no environment, and works
over `railway connect Postgres` — which matters, because this project currently
has no public Postgres proxy.

## Usage tracking

```sql
CREATE TABLE api_usage (
  id          bigserial PRIMARY KEY,
  key_id      bigint NOT NULL REFERENCES api_key(id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL DEFAULT now(),
  endpoint    text NOT NULL,
  status      int NOT NULL,
  duration_ms int NOT NULL
);
CREATE INDEX api_usage_key_ts_idx ON api_usage (key_id, ts DESC);
CREATE INDEX api_usage_ts_idx     ON api_usage (ts);
```

**`endpoint` stores the route template, never the concrete path** —
`/v1/normas/{idNorma}/articulos/{slug}`, not `/v1/normas/29994/articulos/a3`.

This is the load-bearing privacy decision, not an implementation detail.
Recording concrete paths would build a per-person record of which laws someone
read, which is the same category of data as the query text that was
deliberately excluded. The template answers "who is calling what, how often, how
fast, and is it erroring" and answers nothing about what anyone looked up.

Recorded: key, endpoint template, status, duration, timestamp.
Not recorded: query strings, path parameters, IP, user-agent, response bodies.

The write is fire-and-forget — dispatched without `await`, errors swallowed and
logged — so it adds no latency to the response. The site runs a **single
persistent Node replica** (per `CLAUDE.md`), so the insert completes normally;
this would not be safe on a serverless runtime that freezes after the response.
The trade-off is that a crash can lose a few records. That is acceptable for
observability and would **not** be acceptable if this metered billing.

### Retention

Pruned at 90 days, mirroring what `retier.py` already does for
`analytics.event`. A `prune_api_usage(days => 90)` function ships with the
schema; scheduling it is the loader's job.

## Errors

```json
{ "error": { "code": "invalid_api_key", "message": "…" } }
```

| status | when |
|---|---|
| 400 | malformed `idNorma`, `fecha`, or missing required parameter |
| 401 | missing, malformed, unknown, or revoked key |
| 404 | no such norma, article, or version |
| 503 | database unavailable |

The 503 is deliberate and carries a lesson from the 2026-09-07 outage: a
dependency failure must never be dressed as an empty successful result. An empty
`results` array means "nothing matched"; it never means "the system is broken".

## Caching

`Cache-Control: private, max-age=300` plus an `ETag` on norma, article and
version reads, which are immutable at a fixed `fecha`.

`private`, not `public`: these responses sit behind an `Authorization` header
and must never be stored by a shared cache. Search results are not cached — they
depend on `asOf` and on ranking data that changes as the corpus is reloaded.

## Testing

- **Auth**: missing header, malformed header, wrong scheme, unknown key,
  revoked key, valid key. A revoked key must fail *after* previously succeeding.
- **Usage**: a row is written with the route template rather than the concrete
  path — asserted explicitly, since that is the privacy guarantee; a failing
  insert must not fail the request.
- **Endpoints**: contract tests over a mocked `pool`, following the pattern in
  `site/lib/search.resilience.test.ts`.
- **Errors**: a database failure surfaces 503, never 200 with an empty list.

## Deliberately out of scope

- Rate limiting and quotas. Not needed until there is traffic to calibrate
  against, and `api_usage` makes both straightforward to add later.
- Key self-service, dashboards, billing.
- Any write operation. The corpus is derived from `historial`; the API is
  read-only by construction.
- OpenAPI generation. Worth adding if consumers ask; not before.

## Privacy posture — an explicit change

`sql/001_schema.sql` records that `analytics.event` collects **no user
dimension**. `api_key` and `api_usage` introduce one for API consumers: calls
are attributable to an issued key, and therefore to whoever holds it.

This is a deliberate and normal trade for an authenticated API, and it is
scoped as narrowly as the requirement allows — no IP, no user-agent, no query
text, no concrete paths, 90-day retention. It is recorded here rather than left
implicit, and the terms shown to key holders should say what is logged and for
how long.
