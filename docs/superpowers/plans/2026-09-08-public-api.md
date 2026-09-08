# Public REST API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, API-key-authenticated JSON API at `/v1` covering the same ground as the MCP server, with per-key usage recorded for observability.

**Architecture:** Next.js route handlers under `site/app/api/v1/` call the existing `@/lib/norma` and `@/lib/search` functions directly — the same data layer the MCP server uses, with JSON rather than prose as the presentation. A single `withApiKey()` wrapper handles authentication, timing, the error envelope, and usage recording, so no route handler repeats that logic.

**Tech Stack:** Next.js 16 route handlers, TypeScript 5.x, `pg`, Postgres 16 with `pgcrypto`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-public-api-design.md`

## Global Constraints

- All endpoints are `GET` and read-only. No writes, ever.
- `site/` pins `typescript` to **5.x**. Never `pnpm add -D typescript` unpinned — it floats to the 7.0 `tsgo` preview and breaks Next 16's build checker.
- Run `pnpm` from inside `site/` (its `package.json` declares `packageManager: pnpm@9.15.0`).
- Verify with `cd site && pnpm vitest run && pnpm tsc --noEmit`.
- Commits are GPG-signed but this shell has no TTY; use `--no-gpg-sign`.
- `api_usage.endpoint` stores the **route template**, never a concrete path. This is a privacy guarantee, not a convention.
- A database failure returns **503**, never 200 with an empty list.
- Field names use the domain's Spanish (`titulo`, `numero`, `articulos`, `vigencia`).
- `idNorma` addresses every norma. `(tipo, numero)` is not unique.
- Local Postgres for SQL verification: `docker start leychile-verify` (port 55432, already loaded).

---

### Task 1: Schema, key issuance, and usage pruning

**Files:**
- Create: `sql/006_api.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `api_key(id, key_hash, key_prefix, label, created_at, revoked_at)` and `api_usage(id, key_id, ts, endpoint, status, duration_ms)`; functions `issue_api_key(text) -> text`, `revoke_api_key(text) -> boolean`, `prune_api_usage(int) -> bigint`.

- [ ] **Step 1: Write the migration**

Create `sql/006_api.sql`:

```sql
-- Public REST API: keys and usage.
--
-- Keys are stored as SHA-256 digests. The plaintext is returned once by
-- issue_api_key and is unrecoverable afterwards, so a database leak yields no
-- usable credentials.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS api_key (
  id         bigserial PRIMARY KEY,
  key_hash   text NOT NULL UNIQUE,
  -- Display only, so a human can tell keys apart in a listing. Never
  -- sufficient to authenticate with.
  key_prefix text NOT NULL,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS api_usage (
  id          bigserial PRIMARY KEY,
  key_id      bigint NOT NULL REFERENCES api_key (id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL DEFAULT now(),
  -- The route TEMPLATE ('/v1/normas/{idNorma}'), never the concrete path.
  -- Storing '/v1/normas/29994' would build a per-caller record of which laws
  -- someone read — the same category of data as the query text this design
  -- deliberately does not keep.
  endpoint    text NOT NULL,
  status      int NOT NULL,
  duration_ms int NOT NULL
);

CREATE INDEX IF NOT EXISTS api_usage_key_ts_idx ON api_usage (key_id, ts DESC);
CREATE INDEX IF NOT EXISTS api_usage_ts_idx     ON api_usage (ts);

-- Returns the plaintext key ONCE. There is no way to recover it later.
CREATE OR REPLACE FUNCTION issue_api_key(p_label text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  raw   text;
  token text;
BEGIN
  IF p_label IS NULL OR btrim(p_label) = '' THEN
    RAISE EXCEPTION 'label is required';
  END IF;
  -- 24 bytes of CSPRNG, base64url. translate() strips the base64 characters
  -- that are unsafe in a URL or an Authorization header.
  raw   := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  token := 'lc_live_' || raw;
  INSERT INTO api_key (key_hash, key_prefix, label)
  VALUES (encode(digest(token, 'sha256'), 'hex'), left(token, 16), btrim(p_label));
  RETURN token;
END
$$;

CREATE OR REPLACE FUNCTION revoke_api_key(p_prefix text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE api_key SET revoked_at = now()
   WHERE key_prefix = p_prefix AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END
$$;

-- Mirrors the 90-day prune retier.py already applies to analytics.event.
CREATE OR REPLACE FUNCTION prune_api_usage(p_days int DEFAULT 90)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM api_usage WHERE ts < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
```

- [ ] **Step 2: Apply it to the local Postgres and verify**

```bash
docker start leychile-verify
cd /home/pisanvs/code/ley-chile/.worktrees/public-api
docker cp sql/006_api.sql leychile-verify:/tmp/006.sql
docker exec leychile-verify psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/006.sql
```

Expected: `CREATE EXTENSION`, `CREATE TABLE` ×2, `CREATE INDEX` ×2, `CREATE FUNCTION` ×3, no errors.

- [ ] **Step 3: Verify issuance, hashing, revocation and pruning behave**

```bash
docker exec -i leychile-verify psql -U postgres <<'SQL'
SELECT issue_api_key('Acme Corp') AS plaintext_shown_once \gset
SELECT :'plaintext_shown_once' LIKE 'lc_live_%' AS has_prefix,
       length(:'plaintext_shown_once') AS len;
-- the plaintext must NOT be recoverable from the table
SELECT count(*) AS leaked FROM api_key
 WHERE key_hash = :'plaintext_shown_once' OR key_prefix = :'plaintext_shown_once';
-- the stored hash must match sha256 of the plaintext
SELECT key_hash = encode(digest(:'plaintext_shown_once','sha256'),'hex') AS hash_matches,
       key_prefix, label FROM api_key;
SELECT revoke_api_key((SELECT key_prefix FROM api_key)) AS revoked_first_time;
SELECT revoke_api_key((SELECT key_prefix FROM api_key)) AS revoked_again_is_false;
SELECT prune_api_usage(90) AS pruned_rows;
SQL
```

Expected: `has_prefix = t`, `len = 40`, `leaked = 0`, `hash_matches = t`, `revoked_first_time = t`, `revoked_again_is_false = f`, `pruned_rows = 0`.

- [ ] **Step 4: Commit**

```bash
git add sql/006_api.sql
git commit --no-gpg-sign -m "feat(api): api_key and api_usage schema with key issuance

Keys are stored as SHA-256 digests; issue_api_key returns the plaintext
once and it is unrecoverable afterwards, so a database leak yields no
usable credentials. api_usage.endpoint holds the route template rather
than the concrete path, so the log cannot become a record of which laws
a given caller read. prune_api_usage mirrors the 90-day retention
retier.py already applies to analytics.event."
```

---

### Task 2: Key verification

**Files:**
- Create: `site/lib/apikey.ts`
- Test: `site/lib/apikey.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `api_key` table from Task 1.
- Produces: `verifyApiKey(token: string): Promise<ApiKeyRecord | null>` and `interface ApiKeyRecord { id: number; label: string }`.

- [ ] **Step 1: Write the failing test**

Create `site/lib/apikey.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('./db', () => ({ pool: { query } }))

beforeEach(() => {
  vi.resetModules()
  query.mockReset()
})

const ROW = { id: 7, label: 'Acme Corp' }

describe('verifyApiKey', () => {
  it('accepts a live key and returns its identity', async () => {
    query.mockResolvedValue({ rows: [ROW] })
    const { verifyApiKey } = await import('./apikey')
    expect(await verifyApiKey('lc_live_abc')).toEqual(ROW)
  })

  it('looks the key up by SHA-256 digest, never by the plaintext', async () => {
    // The plaintext must not appear in any query parameter — a query log or an
    // error trace would otherwise leak usable credentials.
    query.mockResolvedValue({ rows: [ROW] })
    const { verifyApiKey } = await import('./apikey')
    await verifyApiKey('lc_live_abc')
    const params = query.mock.calls[0][1] as string[]
    expect(params).toHaveLength(1)
    expect(params[0]).not.toContain('lc_live_abc')
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects an unknown key', async () => {
    query.mockResolvedValue({ rows: [] })
    const { verifyApiKey } = await import('./apikey')
    expect(await verifyApiKey('lc_live_nope')).toBeNull()
  })

  it('rejects an empty token without touching the database', async () => {
    const { verifyApiKey } = await import('./apikey')
    expect(await verifyApiKey('')).toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('filters revoked keys in SQL rather than in the caller', async () => {
    query.mockResolvedValue({ rows: [] })
    const { verifyApiKey } = await import('./apikey')
    await verifyApiKey('lc_live_abc')
    expect(String(query.mock.calls[0][0])).toMatch(/revoked_at IS NULL/)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd site && pnpm vitest run lib/apikey.test.ts`
Expected: FAIL — `Cannot find module './apikey'`.

- [ ] **Step 3: Write the implementation**

Create `site/lib/apikey.ts`:

```ts
import { createHash } from 'node:crypto'
import { pool } from './db'

export interface ApiKeyRecord {
  id: number
  label: string
}

/** Verify a bearer token against `api_key`.
 *
 *  Only the SHA-256 digest is ever sent to the database, so the plaintext
 *  cannot leak through a query log or an error trace. The digest is the unique
 *  key, making this one indexed probe with no scan — and no string-comparison
 *  timing channel, since an attacker cannot produce the digest without already
 *  holding the token.
 *
 *  Revocation is filtered in SQL: a caller that forgets to check a flag is a
 *  security bug, so there is no flag to forget. */
export async function verifyApiKey(token: string): Promise<ApiKeyRecord | null> {
  if (!token) return null
  const hash = createHash('sha256').update(token).digest('hex')
  const { rows } = await pool.query(
    `SELECT id, label FROM api_key WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hash],
  )
  return rows.length ? { id: rows[0].id as number, label: rows[0].label as string } : null
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run lib/apikey.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add site/lib/apikey.ts site/lib/apikey.test.ts
git commit --no-gpg-sign -m "feat(api): verify bearer tokens against api_key

Only the SHA-256 digest reaches the database, so the plaintext cannot
leak through a query log or an error trace, and the lookup is one
indexed probe. Revocation is filtered in SQL rather than returned for
the caller to check — a flag a caller can forget is a security bug."
```

---

### Task 3: Usage recording

**Files:**
- Create: `site/lib/apiusage.ts`
- Test: `site/lib/apiusage.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `api_usage` table from Task 1.
- Produces: `recordUsage(keyId: number, endpoint: string, status: number, durationMs: number): Promise<void>` — never rejects.

- [ ] **Step 1: Write the failing test**

Create `site/lib/apiusage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('./db', () => ({ pool: { query } }))

beforeEach(() => {
  vi.resetModules()
  query.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordUsage', () => {
  it('writes one row with the key, endpoint, status and duration', async () => {
    query.mockResolvedValue({ rows: [] })
    const { recordUsage } = await import('./apiusage')
    await recordUsage(7, '/v1/normas/{idNorma}', 200, 42)
    expect(query.mock.calls[0][1]).toEqual([7, '/v1/normas/{idNorma}', 200, 42])
  })

  it('never rejects when the insert fails', async () => {
    // Usage recording is observability. It must not be able to fail a request
    // that already produced a correct response.
    query.mockRejectedValue(new Error('deadlock detected'))
    const { recordUsage } = await import('./apiusage')
    await expect(recordUsage(7, '/v1/search', 200, 5)).resolves.toBeUndefined()
  })

  it('refuses a concrete path, which would defeat the privacy guarantee', async () => {
    // The template is the whole point: '/v1/normas/29994' is a record of which
    // law someone read. Catching this in a unit test is cheaper than catching
    // it in a privacy review after six months of logs.
    query.mockResolvedValue({ rows: [] })
    const { recordUsage } = await import('./apiusage')
    await recordUsage(7, '/v1/normas/29994', 200, 5)
    expect(query).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('accepts every template the API actually uses', async () => {
    query.mockResolvedValue({ rows: [] })
    const { recordUsage } = await import('./apiusage')
    for (const t of [
      '/v1/search',
      '/v1/normas/{idNorma}',
      '/v1/normas/{idNorma}/articulos',
      '/v1/normas/{idNorma}/articulos/{slug}',
      '/v1/normas/{idNorma}/versiones',
      '/v1/normas/{idNorma}/diff',
      '/v1/normas/{idNorma}/modificaciones',
      '/v1/normas/{idNorma}/raw',
    ]) {
      await recordUsage(7, t, 200, 1)
    }
    expect(query).toHaveBeenCalledTimes(8)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd site && pnpm vitest run lib/apiusage.test.ts`
Expected: FAIL — `Cannot find module './apiusage'`.

- [ ] **Step 3: Write the implementation**

Create `site/lib/apiusage.ts`:

```ts
import { pool } from './db'

/** Endpoint strings must be route templates, not concrete paths.
 *
 *  A digit where `{idNorma}` belongs means a caller passed the real path, which
 *  would turn this table into a record of which laws each key holder read. That
 *  is the exact data this design chose not to collect, so it is refused rather
 *  than written. */
const TEMPLATE_RE = /^\/v1\/[a-z{}/]*$/

/** Record one API call. Never throws.
 *
 *  Callers dispatch this without awaiting, so a rejection would surface as an
 *  unhandled promise rejection and, on some runtimes, take the process down —
 *  over a metric. Observability must never be able to fail a request that
 *  already produced a correct response. */
export async function recordUsage(
  keyId: number, endpoint: string, status: number, durationMs: number,
): Promise<void> {
  if (!TEMPLATE_RE.test(endpoint)) {
    console.error(
      `[api] refusing to record a concrete path as usage: ${endpoint} — ` +
      `endpoint must be a route template such as /v1/normas/{idNorma}`,
    )
    return
  }
  try {
    await pool.query(
      `INSERT INTO api_usage (key_id, endpoint, status, duration_ms)
       VALUES ($1, $2, $3, $4)`,
      [keyId, endpoint, status, durationMs],
    )
  } catch (err) {
    console.error('[api] usage insert failed:', err)
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run lib/apiusage.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add site/lib/apiusage.ts site/lib/apiusage.test.ts
git commit --no-gpg-sign -m "feat(api): record per-key usage, refusing concrete paths

Writes key, endpoint template, status and duration. Never throws:
callers dispatch it without awaiting, so a rejection would surface as an
unhandled rejection over a metric.

A concrete path is refused rather than written. '/v1/normas/29994' is a
record of which law a caller read — the data this design chose not to
collect — and a unit test is a cheaper place to catch that than a
privacy review six months of logs later."
```

---

### Task 4: The `withApiKey` wrapper

**Files:**
- Create: `site/lib/apiroute.ts`
- Test: `site/lib/apiroute.test.ts`

**Interfaces:**
- Consumes: `verifyApiKey` (Task 2), `recordUsage` (Task 3).
- Produces: `apiError(status: number, code: string, message: string): Response`, `jsonOk(body: unknown, cacheSeconds?: number): Response`, `withApiKey(endpoint: string, handler: ApiHandler): (req: Request, ctx: RouteCtx) => Promise<Response>`, `type RouteCtx = { params: Promise<Record<string, string>> }`, `type ApiHandler = (req: Request, ctx: RouteCtx) => Promise<Response>`, and `class NotFound extends Error` / `class BadRequest extends Error`.

- [ ] **Step 1: Write the failing test**

Create `site/lib/apiroute.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyApiKey = vi.fn()
const recordUsage = vi.fn()
vi.mock('./apikey', () => ({ verifyApiKey }))
vi.mock('./apiusage', () => ({ recordUsage }))

beforeEach(() => {
  vi.resetModules()
  verifyApiKey.mockReset()
  recordUsage.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const CTX = { params: Promise.resolve({}) }
const req = (auth?: string) =>
  new Request('https://x/v1/search?q=a', auth ? { headers: { authorization: auth } } : undefined)

async function wrap(handler: () => Promise<Response>) {
  const { withApiKey } = await import('./apiroute')
  return withApiKey('/v1/search', handler)
}

describe('withApiKey', () => {
  it('401s with no Authorization header, and records nothing', async () => {
    const res = await (await wrap(async () => Response.json({})))(req(), CTX)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'missing_api_key', message: expect.any(String) } })
    // Unattributable traffic cannot be recorded — there is no key to attribute it to.
    expect(recordUsage).not.toHaveBeenCalled()
  })

  it('401s on a non-Bearer scheme', async () => {
    const res = await (await wrap(async () => Response.json({})))(req('Basic abc'), CTX)
    expect(res.status).toBe(401)
  })

  it('401s on an unknown or revoked key', async () => {
    verifyApiKey.mockResolvedValue(null)
    const res = await (await wrap(async () => Response.json({})))(req('Bearer lc_live_x'), CTX)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('invalid_api_key')
  })

  it('runs the handler for a valid key and records the call', async () => {
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    const res = await (await wrap(async () => Response.json({ ok: true })))(req('Bearer lc_live_x'), CTX)
    expect(res.status).toBe(200)
    const [keyId, endpoint, status, duration] = recordUsage.mock.calls[0]
    expect(keyId).toBe(7)
    expect(endpoint).toBe('/v1/search')
    expect(status).toBe(200)
    expect(typeof duration).toBe('number')
  })

  it('turns a database failure into 503, never a 200 with empty data', async () => {
    // The 2026-09-07 outage in one assertion: a broken dependency was reported
    // as an empty successful result, so monitoring saw only healthy 200s.
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    const boom = async () => { throw new Error('connection terminated') }
    const res = await (await wrap(boom))(req('Bearer lc_live_x'), CTX)
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('service_unavailable')
    expect(recordUsage.mock.calls[0][2]).toBe(503)
  })

  it('maps NotFound to 404 and BadRequest to 400', async () => {
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    const { NotFound, BadRequest } = await import('./apiroute')
    const nf = await (await wrap(async () => { throw new NotFound('no such norma') }))(req('Bearer k'), CTX)
    expect(nf.status).toBe(404)
    expect((await nf.json()).error.code).toBe('not_found')
    const br = await (await wrap(async () => { throw new BadRequest('bad fecha') }))(req('Bearer k'), CTX)
    expect(br.status).toBe(400)
    expect((await br.json()).error.code).toBe('bad_request')
  })

  it('does not fail the request when usage recording rejects', async () => {
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    recordUsage.mockRejectedValue(new Error('db down'))
    const res = await (await wrap(async () => Response.json({ ok: true })))(req('Bearer k'), CTX)
    expect(res.status).toBe(200)
  })
})

describe('jsonOk', () => {
  it('marks responses private so no shared cache stores authenticated data', async () => {
    const { jsonOk } = await import('./apiroute')
    const cc = jsonOk({ a: 1 }, 300).headers.get('cache-control')
    expect(cc).toContain('private')
    expect(cc).not.toContain('public')
    expect(cc).toContain('max-age=300')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd site && pnpm vitest run lib/apiroute.test.ts`
Expected: FAIL — `Cannot find module './apiroute'`.

- [ ] **Step 3: Write the implementation**

Create `site/lib/apiroute.ts`:

```ts
import { verifyApiKey } from './apikey'
import { recordUsage } from './apiusage'

export type RouteCtx = { params: Promise<Record<string, string>> }
export type ApiHandler = (req: Request, ctx: RouteCtx) => Promise<Response>

/** Handler-thrown signals the wrapper maps to status codes, so route handlers
 *  return data or throw meaning, and never assemble error responses. */
export class NotFound extends Error {}
export class BadRequest extends Error {}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

/** `private`, never `public`: these responses sit behind an Authorization
 *  header and must not be stored by a shared cache. */
export function jsonOk(body: unknown, cacheSeconds = 0): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cacheSeconds > 0) headers['cache-control'] = `private, max-age=${cacheSeconds}`
  return new Response(JSON.stringify(body), { status: 200, headers })
}

/** Authenticate, time, record, and normalise errors for one endpoint.
 *
 *  `endpoint` MUST be the route template ('/v1/normas/{idNorma}'), because it
 *  is what gets logged — see lib/apiusage.ts.
 *
 *  An unrecognised throw becomes 503, not 200-with-nothing. On 2026-09-07 a
 *  dependency failure was reported as an empty successful result and a total
 *  outage looked, to monitoring, like a wall of healthy 200s. */
export function withApiKey(endpoint: string, handler: ApiHandler) {
  return async (req: Request, ctx: RouteCtx): Promise<Response> => {
    const started = Date.now()
    const auth = req.headers.get('authorization') ?? ''
    const m = /^Bearer\s+(\S+)$/i.exec(auth)
    if (!m) {
      return apiError(401, 'missing_api_key',
        'Provide an API key as: Authorization: Bearer lc_live_…')
    }

    const key = await verifyApiKey(m[1])
    if (!key) {
      return apiError(401, 'invalid_api_key', 'The API key is unknown or has been revoked.')
    }

    let res: Response
    try {
      res = await handler(req, ctx)
    } catch (err) {
      if (err instanceof NotFound) {
        res = apiError(404, 'not_found', err.message)
      } else if (err instanceof BadRequest) {
        res = apiError(400, 'bad_request', err.message)
      } else {
        console.error(`[api] ${endpoint} failed:`, err)
        res = apiError(503, 'service_unavailable', 'The service is temporarily unavailable.')
      }
    }

    // Dispatched, not awaited: recording must add no latency. The site runs a
    // single persistent Node replica, so the insert completes after the
    // response is sent. `.catch` because recordUsage's own guard could still be
    // bypassed by a rejection at dispatch time.
    void recordUsage(key.id, endpoint, res.status, Date.now() - started)
      .catch((e) => console.error('[api] usage dispatch failed:', e))

    return res
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run lib/apiroute.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add site/lib/apiroute.ts site/lib/apiroute.test.ts
git commit --no-gpg-sign -m "feat(api): withApiKey wrapper for auth, timing, errors and usage

One place handles authentication, the error envelope, response timing
and usage recording, so no route handler repeats any of it. Handlers
return data or throw NotFound/BadRequest; the wrapper maps those to 404
and 400 and anything unrecognised to 503.

That last mapping is the 2026-09-07 lesson: a dependency failure
reported as an empty successful result made a total outage look like a
wall of healthy 200s. Responses are Cache-Control: private, never
public, because they sit behind an Authorization header."
```

---

### Task 5: `GET /v1/search`

**Files:**
- Create: `site/app/api/v1/search/route.ts`
- Test: `site/app/api/v1/search/route.test.ts`

**Interfaces:**
- Consumes: `withApiKey`, `jsonOk`, `BadRequest` (Task 4); `runSearch` from `@/lib/search`; `getNormasByKey`, `getOrganismosByIds` from `@/lib/norma`.
- Produces: `GET` handler. Response shape `{ query, asOf, total, resultados: Array<{ idNorma, tipo, numero, titulo, organismo }> }`.

- [ ] **Step 1: Write the failing test**

Create `site/app/api/v1/search/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const runSearch = vi.fn()
const getNormasByKey = vi.fn()
const getOrganismosByIds = vi.fn()
vi.mock('@/lib/search', () => ({ runSearch }))
vi.mock('@/lib/norma', () => ({ getNormasByKey, getOrganismosByIds }))
vi.mock('@/lib/apikey', () => ({ verifyApiKey: vi.fn().mockResolvedValue({ id: 1, label: 'T' }) }))
vi.mock('@/lib/apiusage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

beforeEach(() => {
  vi.resetModules()
  runSearch.mockReset()
  getNormasByKey.mockReset()
  getOrganismosByIds.mockReset().mockResolvedValue(new Map([[29994, 'MINISTERIO DEL INTERIOR']]))
})

const CTX = { params: Promise.resolve({}) }
const call = async (qs: string) => {
  const { GET } = await import('./route')
  return GET(new Request(`https://x/v1/search?${qs}`, {
    headers: { authorization: 'Bearer lc_live_x' },
  }), CTX)
}

const HIT = { idNorma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC DE LOS PARTIDOS POLITICOS' }

describe('GET /v1/search', () => {
  it('returns free-text results enriched with organismo', async () => {
    runSearch.mockResolvedValue([HIT])
    const res = await call('q=partidos')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.resultados[0]).toEqual({
      idNorma: 29994, tipo: 'ley', numero: '18603',
      titulo: 'LOC DE LOS PARTIDOS POLITICOS', organismo: 'MINISTERIO DEL INTERIOR',
    })
  })

  it('400s when neither q nor a tipo/numero pair is given', async () => {
    const res = await call('')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('bad_request')
  })

  it('resolves a citation to every candidate, since (tipo, numero) is ambiguous', async () => {
    // Several DFL 1 exist, one per organismo. Returning one of them silently
    // would be the /ley/20780 bug all over again.
    getNormasByKey.mockResolvedValue([
      { ...HIT, idNorma: 1, tipo: 'dfl', numero: '1', organismo: 'TRABAJO' },
      { ...HIT, idNorma: 2, tipo: 'dfl', numero: '1', organismo: 'SALUD' },
    ])
    const res = await call('tipo=dfl&numero=1')
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.resultados.map((r: { idNorma: number }) => r.idNorma)).toEqual([1, 2])
    expect(runSearch).not.toHaveBeenCalled()
  })

  it('rejects a malformed asOf rather than silently searching today', async () => {
    const res = await call('q=x&asOf=ayer')
    expect(res.status).toBe(400)
  })

  it('caps limit so one call cannot ask for the whole corpus', async () => {
    runSearch.mockResolvedValue([])
    await call('q=x&limit=9999')
    expect(runSearch.mock.calls[0][2]).toBe(100)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd site && pnpm vitest run app/api/v1/search/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `site/app/api/v1/search/route.ts`:

```ts
import { runSearch } from '@/lib/search'
import { getNormasByKey, getOrganismosByIds } from '@/lib/norma'
import { withApiKey, jsonOk, BadRequest } from '@/lib/apiroute'

const MAX_LIMIT = 100
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

interface Result {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  organismo: string
}

/** Search the corpus, either by free text (`q`) or by citation
 *  (`tipo` + `numero`).
 *
 *  A citation returns EVERY candidate rather than a best guess: (tipo, numero)
 *  is not unique — there are many "DFL 1", one per organismo — and picking one
 *  silently is how /ley/20780 once resolved to an unrelated decreto. Callers
 *  disambiguate on `idNorma`, which is unique. */
export const GET = withApiKey('/v1/search', async (req) => {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const tipo = url.searchParams.get('tipo')?.trim() ?? ''
  const numero = url.searchParams.get('numero')?.trim() ?? ''
  const asOf = url.searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10)

  if (!FECHA_RE.test(asOf)) {
    throw new BadRequest(`asOf must be YYYY-MM-DD, got "${asOf}"`)
  }

  const rawLimit = Number(url.searchParams.get('limit') ?? 20)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : 20

  let resultados: Result[]

  if (tipo && numero) {
    const normas = await getNormasByKey(tipo, numero)
    resultados = normas.slice(0, limit).map((n) => ({
      idNorma: n.idNorma, tipo: n.tipo, numero: n.numero,
      titulo: n.titulo, organismo: n.organismo,
    }))
  } else if (q.length >= 2) {
    const hits = await runSearch(q, asOf, limit)
    const orgs = await getOrganismosByIds(hits.map((h) => h.idNorma))
    resultados = hits.map((h) => ({
      idNorma: h.idNorma, tipo: h.tipo, numero: h.numero,
      titulo: h.titulo, organismo: orgs.get(h.idNorma) ?? '',
    }))
  } else {
    throw new BadRequest(
      'Provide q (at least 2 characters) for free-text search, or tipo and numero for a citation.',
    )
  }

  return jsonOk({ query: q || `${tipo} ${numero}`.trim(), asOf, total: resultados.length, resultados })
})
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run app/api/v1/search/route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add site/app/api/v1/search/route.ts site/app/api/v1/search/route.test.ts
git commit --no-gpg-sign -m "feat(api): GET /v1/search

Free text via q, or a citation via tipo+numero. A citation returns every
candidate rather than a best guess: (tipo, numero) is not unique — there
are many DFL 1, one per organismo — and picking one silently is how
/ley/20780 once resolved to an unrelated decreto. Callers disambiguate
on idNorma.

limit is capped at 100 so one call cannot ask for the whole corpus, and
a malformed asOf is a 400 rather than a silent search of today."
```

---

### Task 6: Norma metadata and articles

**Files:**
- Create: `site/app/api/v1/normas/[idNorma]/route.ts`
- Create: `site/app/api/v1/normas/[idNorma]/articulos/route.ts`
- Create: `site/app/api/v1/normas/[idNorma]/articulos/[slug]/route.ts`
- Create: `site/lib/apiparams.ts`
- Test: `site/lib/apiparams.test.ts`
- Test: `site/app/api/v1/normas/normas.route.test.ts`

**Interfaces:**
- Consumes: `withApiKey`, `jsonOk`, `NotFound`, `BadRequest` (Task 4); `getNormaById`, `getArticlesAsOf`, `getVersions`, `currentFecha` from `@/lib/norma`; `searchArticles` from `@/lib/search`.
- Produces: `parseIdNorma(raw: string): number` and `parseFecha(raw: string | null, fallback: string): string` in `site/lib/apiparams.ts`; three `GET` handlers.

- [ ] **Step 1: Write the failing test for the shared parameter parsing**

Create `site/lib/apiparams.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseIdNorma, parseFecha } from './apiparams'
import { BadRequest } from './apiroute'

describe('parseIdNorma', () => {
  it('accepts a positive integer', () => {
    expect(parseIdNorma('29994')).toBe(29994)
  })
  it('rejects anything that is not one', () => {
    // A NaN reaching a SQL parameter is a 500 waiting to happen.
    for (const bad of ['', 'abc', '-1', '0', '1.5', '12e3', ' 12 ']) {
      expect(() => parseIdNorma(bad)).toThrow(BadRequest)
    }
  })
})

describe('parseFecha', () => {
  it('accepts YYYY-MM-DD and falls back when absent', () => {
    expect(parseFecha('2020-01-31', '2026-01-01')).toBe('2020-01-31')
    expect(parseFecha(null, '2026-01-01')).toBe('2026-01-01')
  })
  it('rejects a malformed date rather than searching an unintended day', () => {
    for (const bad of ['ayer', '2020-1-1', '20200101', '2020-13-01']) {
      expect(() => parseFecha(bad, '2026-01-01')).toThrow(BadRequest)
    }
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd site && pnpm vitest run lib/apiparams.test.ts`
Expected: FAIL — `Cannot find module './apiparams'`.

- [ ] **Step 3: Write the parameter parsing**

Create `site/lib/apiparams.ts`:

```ts
import { BadRequest } from './apiroute'

/** Strict positive integer. Anything else is a 400, never a NaN handed to a
 *  SQL parameter. */
export function parseIdNorma(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new BadRequest(`idNorma must be a positive integer, got "${raw}"`)
  }
  return Number(raw)
}

/** YYYY-MM-DD, validated as a real calendar date. A malformed fecha must not
 *  silently become "today" — the answer would be right-looking and wrong. */
export function parseFecha(raw: string | null, fallback: string): string {
  if (raw === null || raw === '') return fallback
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequest(`fecha must be YYYY-MM-DD, got "${raw}"`)
  }
  const d = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw new BadRequest(`fecha is not a real date: "${raw}"`)
  }
  return raw
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run lib/apiparams.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing tests for the three routes**

Create `site/app/api/v1/normas/normas.route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getNormaById = vi.fn()
const getArticlesAsOf = vi.fn()
const getVersions = vi.fn()
const currentFecha = vi.fn()
const searchArticles = vi.fn()
vi.mock('@/lib/norma', () => ({ getNormaById, getArticlesAsOf, getVersions, currentFecha }))
vi.mock('@/lib/search', () => ({ searchArticles }))
vi.mock('@/lib/apikey', () => ({ verifyApiKey: vi.fn().mockResolvedValue({ id: 1, label: 'T' }) }))
vi.mock('@/lib/apiusage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

const NORMA = {
  idNorma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC PARTIDOS',
  organismo: 'INTERIOR', derogado: false, fechaPublicacion: '1987-03-11', lawDir: 'leyes/18603',
}
const ART = { slug: 'a1', label: 'Artículo 1', rawHeading: 'Artículo 1º', body: 'Cuerpo.', ord: 0 }

beforeEach(() => {
  vi.resetModules()
  for (const m of [getNormaById, getArticlesAsOf, getVersions, currentFecha, searchArticles]) m.mockReset()
  getNormaById.mockResolvedValue(NORMA)
  getVersions.mockResolvedValue([{ desde: '1987-03-11', hasta: null, commitSha: 'a', causaId: null, subject: 's' }])
  currentFecha.mockReturnValue('1987-03-11')
  getArticlesAsOf.mockResolvedValue([ART])
})

const H = { headers: { authorization: 'Bearer lc_live_x' } }

describe('GET /v1/normas/{idNorma}', () => {
  it('returns metadata and an article index without bodies', async () => {
    // A single norma can be ~350KB. The index lists articles; bodies are
    // fetched one at a time.
    const { GET } = await import('./[idNorma]/route')
    const res = await GET(new Request('https://x/v1/normas/29994', H),
      { params: Promise.resolve({ idNorma: '29994' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.titulo).toBe('LOC PARTIDOS')
    expect(body.articulos).toEqual([{ slug: 'a1', label: 'Artículo 1', rawHeading: 'Artículo 1º' }])
    expect(JSON.stringify(body)).not.toContain('Cuerpo.')
  })

  it('404s for an unknown norma', async () => {
    getNormaById.mockResolvedValue(null)
    const { GET } = await import('./[idNorma]/route')
    const res = await GET(new Request('https://x/v1/normas/1', H),
      { params: Promise.resolve({ idNorma: '1' }) })
    expect(res.status).toBe(404)
  })

  it('400s on a non-numeric idNorma', async () => {
    const { GET } = await import('./[idNorma]/route')
    const res = await GET(new Request('https://x/v1/normas/abc', H),
      { params: Promise.resolve({ idNorma: 'abc' }) })
    expect(res.status).toBe(400)
  })
})

describe('GET /v1/normas/{idNorma}/articulos', () => {
  it('lists the article index at a fecha', async () => {
    const { GET } = await import('./[idNorma]/articulos/route')
    const res = await GET(new Request('https://x/v1/normas/29994/articulos?fecha=2020-01-01', H),
      { params: Promise.resolve({ idNorma: '29994' }) })
    expect(res.status).toBe(200)
    expect(getArticlesAsOf).toHaveBeenCalledWith(29994, '2020-01-01')
    expect((await res.json()).articulos[0].slug).toBe('a1')
  })

  it('adds snippets and drops non-matching articles when q is given', async () => {
    searchArticles.mockResolvedValue([
      { slug: 'a1', label: 'Artículo 1', rawHeading: 'Artículo 1º', snippet: '…<b>cuerpo</b>…' },
    ])
    const { GET } = await import('./[idNorma]/articulos/route')
    const res = await GET(new Request('https://x/v1/normas/29994/articulos?q=cuerpo', H),
      { params: Promise.resolve({ idNorma: '29994' }) })
    const body = await res.json()
    expect(searchArticles).toHaveBeenCalled()
    expect(body.articulos[0].snippet).toContain('cuerpo')
  })
})

describe('GET /v1/normas/{idNorma}/articulos/{slug}', () => {
  it('returns one article body', async () => {
    const { GET } = await import('./[idNorma]/articulos/[slug]/route')
    const res = await GET(new Request('https://x/v1/normas/29994/articulos/a1', H),
      { params: Promise.resolve({ idNorma: '29994', slug: 'a1' }) })
    expect(res.status).toBe(200)
    expect((await res.json()).body).toBe('Cuerpo.')
  })

  it('404s for a slug that is not in this norma', async () => {
    const { GET } = await import('./[idNorma]/articulos/[slug]/route')
    const res = await GET(new Request('https://x/v1/normas/29994/articulos/zz', H),
      { params: Promise.resolve({ idNorma: '29994', slug: 'zz' }) })
    expect(res.status).toBe(404)
  })

  it('truncates a very long body and says so', async () => {
    getArticlesAsOf.mockResolvedValue([{ ...ART, body: 'x'.repeat(20_000) }])
    const { GET } = await import('./[idNorma]/articulos/[slug]/route')
    const res = await GET(new Request('https://x/v1/normas/29994/articulos/a1', H),
      { params: Promise.resolve({ idNorma: '29994', slug: 'a1' }) })
    const body = await res.json()
    expect(body.body.length).toBeLessThan(20_000)
    expect(body.truncado).toBe(true)
  })
})
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `cd site && pnpm vitest run app/api/v1/normas/normas.route.test.ts`
Expected: FAIL — cannot find `./[idNorma]/route`.

- [ ] **Step 7: Write the three route handlers**

Create `site/app/api/v1/normas/[idNorma]/route.ts`:

```ts
import { getNormaById, getArticlesAsOf, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** Metadata plus an article INDEX — never article bodies.
 *
 *  One norma can be ~350 KB of text. Returning it whole would make the common
 *  case (identify a law, then read one article) pay for the rare one. Bodies
 *  come from /articulos/{slug}, one at a time. */
export const GET = withApiKey('/v1/normas/{idNorma}', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  const fecha = parseFecha(new URL(req.url).searchParams.get('fecha'), currentFecha(versions))
  const articulos = await getArticlesAsOf(idNorma, fecha)

  return jsonOk({
    idNorma: norma.idNorma,
    tipo: norma.tipo,
    numero: norma.numero,
    titulo: norma.titulo,
    organismo: norma.organismo,
    derogado: norma.derogado,
    fechaPublicacion: norma.fechaPublicacion,
    fecha,
    totalVersiones: versions.length,
    articulos: articulos.map((a) => ({
      slug: a.slug, label: a.label, rawHeading: a.rawHeading,
    })),
  }, 300)
})
```

Create `site/app/api/v1/normas/[idNorma]/articulos/route.ts`:

```ts
import { getNormaById, getArticlesAsOf, getVersions, currentFecha } from '@/lib/norma'
import { searchArticles } from '@/lib/search'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** The article index at a fecha. With `q`, searches WITHIN the norma and
 *  returns only matching articles, each with a snippet — the way to locate the
 *  relevant article of a code with hundreds of them without pulling its text. */
export const GET = withApiKey('/v1/normas/{idNorma}/articulos', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const url = new URL(req.url)
  const versions = await getVersions(idNorma)
  const fecha = parseFecha(url.searchParams.get('fecha'), currentFecha(versions))
  const q = url.searchParams.get('q')?.trim() ?? ''

  if (q.length >= 2) {
    const hits = await searchArticles(idNorma, q, fecha)
    return jsonOk({
      idNorma, fecha, query: q, total: hits.length,
      articulos: hits.map((h) => ({
        slug: h.slug, label: h.label, rawHeading: h.rawHeading, snippet: h.snippet,
      })),
    })
  }

  const articulos = await getArticlesAsOf(idNorma, fecha)
  return jsonOk({
    idNorma, fecha, total: articulos.length,
    articulos: articulos.map((a) => ({
      slug: a.slug, label: a.label, rawHeading: a.rawHeading,
    })),
  }, 300)
})
```

Create `site/app/api/v1/normas/[idNorma]/articulos/[slug]/route.ts`:

```ts
import { getNormaById, getArticlesAsOf, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** Matches the cap the MCP server applies. A handful of articles in the corpus
 *  are enormous; `truncado` tells the caller the text is incomplete rather than
 *  letting them treat a cut-off article as the whole provision. */
const MAX_BODY = 12_000

export const GET = withApiKey('/v1/normas/{idNorma}/articulos/{slug}', async (req, ctx) => {
  const params = await ctx.params
  const idNorma = parseIdNorma(params.idNorma)
  const slug = params.slug

  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  const fecha = parseFecha(new URL(req.url).searchParams.get('fecha'), currentFecha(versions))
  const articulos = await getArticlesAsOf(idNorma, fecha)
  const art = articulos.find((a) => a.slug === slug)
  if (!art) throw new NotFound(`No article "${slug}" in idNorma ${idNorma} as of ${fecha}`)

  const truncado = art.body.length > MAX_BODY
  return jsonOk({
    idNorma, fecha, slug: art.slug, label: art.label, rawHeading: art.rawHeading,
    body: truncado ? art.body.slice(0, MAX_BODY) : art.body,
    truncado,
    largoCompleto: art.body.length,
  }, 300)
})
```

- [ ] **Step 8: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run app/api/v1/normas lib/apiparams.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 9: Commit**

```bash
git add site/lib/apiparams.ts site/lib/apiparams.test.ts site/app/api/v1/normas
git commit --no-gpg-sign -m "feat(api): norma metadata and article endpoints

GET /v1/normas/{idNorma} returns metadata plus an article INDEX, never
bodies — one norma can be ~350KB, and returning it whole would make the
common case pay for the rare one. Bodies come one at a time from
/articulos/{slug}, capped at 12k with an explicit truncado flag so a
cut-off article is never mistaken for a whole provision.

/articulos takes an optional q that searches within the norma and
returns only matching articles with snippets.

parseIdNorma and parseFecha reject malformed input with 400 rather than
handing a NaN to a SQL parameter or silently substituting today for an
unparseable date."
```

---

### Task 7: Versions, modifications, and the raw link

**Files:**
- Create: `site/app/api/v1/normas/[idNorma]/versiones/route.ts`
- Create: `site/app/api/v1/normas/[idNorma]/modificaciones/route.ts`
- Create: `site/app/api/v1/normas/[idNorma]/raw/route.ts`
- Test: `site/app/api/v1/normas/relations.route.test.ts`

**Interfaces:**
- Consumes: `withApiKey`, `jsonOk`, `NotFound` (Task 4); `parseIdNorma`, `parseFecha` (Task 6); `getNormaById`, `getVersions`, `getModifies`, `getModifiedBy`, `currentFecha` from `@/lib/norma`.
- Produces: three `GET` handlers.

- [ ] **Step 1: Write the failing test**

Create `site/app/api/v1/normas/relations.route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getNormaById = vi.fn()
const getVersions = vi.fn()
const getModifies = vi.fn()
const getModifiedBy = vi.fn()
const currentFecha = vi.fn()
vi.mock('@/lib/norma', () => ({ getNormaById, getVersions, getModifies, getModifiedBy, currentFecha }))
vi.mock('@/lib/apikey', () => ({ verifyApiKey: vi.fn().mockResolvedValue({ id: 1, label: 'T' }) }))
vi.mock('@/lib/apiusage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

const NORMA = {
  idNorma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC PARTIDOS',
  organismo: 'INTERIOR', derogado: false, fechaPublicacion: '1987-03-11', lawDir: 'leyes/18603',
}
const MOD = { idNorma: 242302, tipo: 'ley', numero: '20500', titulo: 'ASOCIACIONES', fecha: '2011-02-16' }

beforeEach(() => {
  vi.resetModules()
  for (const m of [getNormaById, getVersions, getModifies, getModifiedBy, currentFecha]) m.mockReset()
  getNormaById.mockResolvedValue(NORMA)
  getVersions.mockResolvedValue([
    { desde: '1987-03-11', hasta: '2011-02-15', commitSha: 'a', causaId: null, subject: 'orig' },
    { desde: '2011-02-16', hasta: null, commitSha: 'b', causaId: 242302, subject: 'reforma' },
  ])
  currentFecha.mockReturnValue('2011-02-16')
  getModifies.mockResolvedValue([])
  getModifiedBy.mockResolvedValue([MOD])
})

const H = { headers: { authorization: 'Bearer lc_live_x' } }
const P = { params: Promise.resolve({ idNorma: '29994' }) }

describe('GET /v1/normas/{idNorma}/versiones', () => {
  it('lists every version with its validity window', async () => {
    const { GET } = await import('./[idNorma]/versiones/route')
    const res = await GET(new Request('https://x/v1/normas/29994/versiones', H), P)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.versiones[0]).toMatchObject({ desde: '1987-03-11', hasta: '2011-02-15' })
    expect(body.vigente).toBe('2011-02-16')
  })

  it('404s for an unknown norma', async () => {
    getNormaById.mockResolvedValue(null)
    const { GET } = await import('./[idNorma]/versiones/route')
    expect((await GET(new Request('https://x/v1/normas/29994/versiones', H), P)).status).toBe(404)
  })
})

describe('GET /v1/normas/{idNorma}/modificaciones', () => {
  it('returns both directions, each carrying idNorma', async () => {
    // Without idNorma a caller would have to resolve (tipo, numero), which for
    // a "DFL 4" reference is ambiguous many times over.
    const { GET } = await import('./[idNorma]/modificaciones/route')
    const res = await GET(new Request('https://x/v1/normas/29994/modificaciones', H), P)
    const body = await res.json()
    expect(body.modificadaPor[0].idNorma).toBe(242302)
    expect(body.modifica).toEqual([])
  })
})

describe('GET /v1/normas/{idNorma}/raw', () => {
  it('returns the canonical upstream link for a fecha', async () => {
    const { GET } = await import('./[idNorma]/raw/route')
    const res = await GET(new Request('https://x/v1/normas/29994/raw?fecha=2011-02-16', H), P)
    const body = await res.json()
    expect(body.url).toContain('leychile.cl')
    expect(body.url).toContain('29994')
    expect(body.fecha).toBe('2011-02-16')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd site && pnpm vitest run app/api/v1/normas/relations.route.test.ts`
Expected: FAIL — cannot find `./[idNorma]/versiones/route`.

- [ ] **Step 3: Write the three handlers**

Create `site/app/api/v1/normas/[idNorma]/versiones/route.ts`:

```ts
import { getNormaById, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma } from '@/lib/apiparams'

/** Every version of a norma with its validity window. `desde`/`hasta` are the
 *  fechas to pass to the article and diff endpoints. */
export const GET = withApiKey('/v1/normas/{idNorma}/versiones', async (_req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  return jsonOk({
    idNorma,
    vigente: currentFecha(versions),
    total: versions.length,
    versiones: versions.map((v) => ({
      desde: v.desde, hasta: v.hasta, causaId: v.causaId, subject: v.subject,
    })),
  }, 300)
})
```

Create `site/app/api/v1/normas/[idNorma]/modificaciones/route.ts`:

```ts
import { getNormaById, getModifies, getModifiedBy } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma } from '@/lib/apiparams'

/** Both directions of the modification graph.
 *
 *  Every entry carries `idNorma`, so a caller can address the related norma
 *  directly instead of resolving (tipo, numero) — which for a "DFL 4"
 *  reference is ambiguous many times over. */
export const GET = withApiKey('/v1/normas/{idNorma}/modificaciones', async (_req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const [modifica, modificadaPor] = await Promise.all([
    getModifies(idNorma),
    getModifiedBy(idNorma),
  ])
  const shape = (m: { idNorma: number; tipo: string; numero: string; titulo: string; fecha: string }) => ({
    idNorma: m.idNorma, tipo: m.tipo, numero: m.numero, titulo: m.titulo, fecha: m.fecha,
  })

  return jsonOk({ idNorma, modifica: modifica.map(shape), modificadaPor: modificadaPor.map(shape) }, 300)
})
```

Create `site/app/api/v1/normas/[idNorma]/raw/route.ts`:

```ts
import { getNormaById, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** The canonical leychile.cl URL for one version — the authoritative source
 *  this corpus is derived from, for anyone who needs to cite or verify it. */
export const GET = withApiKey('/v1/normas/{idNorma}/raw', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  const fecha = parseFecha(new URL(req.url).searchParams.get('fecha'), currentFecha(versions))

  return jsonOk({
    idNorma,
    fecha,
    url: `https://www.leychile.cl/Navegar?idNorma=${idNorma}&idVersion=${fecha}`,
    xml: `https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma=${idNorma}&idVersion=${fecha}`,
  }, 300)
})
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run app/api/v1/normas/relations.route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add site/app/api/v1/normas
git commit --no-gpg-sign -m "feat(api): versiones, modificaciones and raw endpoints

Version windows are what the article and diff endpoints take as fechas,
so they are returned as desde/hasta pairs rather than a formatted list.

Modification entries carry idNorma in both directions, so a caller can
address the related norma directly instead of resolving (tipo, numero),
which for a DFL 4 reference is ambiguous many times over."
```

---

### Task 8: `GET /v1/normas/{idNorma}/diff`

**Files:**
- Create: `site/app/api/v1/normas/[idNorma]/diff/route.ts`
- Test: `site/app/api/v1/normas/diff.route.test.ts`

**Interfaces:**
- Consumes: `withApiKey`, `jsonOk`, `NotFound`, `BadRequest` (Task 4); `parseIdNorma`, `parseFecha` (Task 6); `getNormaById`, `getArticlesAsOf` from `@/lib/norma`; `align`, `wordDiff`, `joinDiffText` from `@/lib/diff`.
- Produces: `GET` handler returning `{ idNorma, from, to, resumen: { modificados, añadidos, eliminados }, cambios: Array<{ slug, rawHeading, estado, ops? , body? }> }`.

- [ ] **Step 1: Write the failing test**

Create `site/app/api/v1/normas/diff.route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getNormaById = vi.fn()
const getArticlesAsOf = vi.fn()
vi.mock('@/lib/norma', () => ({ getNormaById, getArticlesAsOf }))
vi.mock('@/lib/apikey', () => ({ verifyApiKey: vi.fn().mockResolvedValue({ id: 1, label: 'T' }) }))
vi.mock('@/lib/apiusage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

const NORMA = {
  idNorma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC PARTIDOS',
  organismo: 'INTERIOR', derogado: false, fechaPublicacion: '1987-03-11', lawDir: 'leyes/18603',
}
const art = (slug: string, body: string) => ({
  slug, label: `Artículo ${slug}`, rawHeading: `Artículo ${slug}`, body, ord: 0,
})

beforeEach(() => {
  vi.resetModules()
  getNormaById.mockReset().mockResolvedValue(NORMA)
  getArticlesAsOf.mockReset()
})

const H = { headers: { authorization: 'Bearer lc_live_x' } }
const P = { params: Promise.resolve({ idNorma: '29994' }) }
const call = async (qs: string) => {
  const { GET } = await import('./[idNorma]/diff/route')
  return GET(new Request(`https://x/v1/normas/29994/diff?${qs}`, H), P)
}

describe('GET /v1/normas/{idNorma}/diff', () => {
  it('reports modified, added and removed articles', async () => {
    getArticlesAsOf
      .mockResolvedValueOnce([art('a1', 'el plazo es de 30 dias'), art('a2', 'se elimina')])
      .mockResolvedValueOnce([art('a1', 'el plazo es de 60 dias'), art('a3', 'nuevo')])
    const res = await call('from=2010-01-01&to=2020-01-01')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resumen).toEqual({ modificados: 1, añadidos: 1, eliminados: 1 })
    const mod = body.cambios.find((c: { estado: string }) => c.estado === 'modificado')
    expect(mod.slug).toBe('a1')
    expect(JSON.stringify(mod.ops)).toContain('60')
  })

  it('returns an empty change set when nothing changed, not an error', async () => {
    getArticlesAsOf
      .mockResolvedValueOnce([art('a1', 'igual')])
      .mockResolvedValueOnce([art('a1', 'igual')])
    const res = await call('from=2010-01-01&to=2020-01-01')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cambios).toEqual([])
    expect(body.resumen).toEqual({ modificados: 0, añadidos: 0, eliminados: 0 })
  })

  it('400s when from or to is missing', async () => {
    expect((await call('from=2010-01-01')).status).toBe(400)
    expect((await call('to=2020-01-01')).status).toBe(400)
  })

  it('404s when neither fecha has any text', async () => {
    getArticlesAsOf.mockResolvedValue([])
    expect((await call('from=1800-01-01&to=1801-01-01')).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd site && pnpm vitest run app/api/v1/normas/diff.route.test.ts`
Expected: FAIL — cannot find `./[idNorma]/diff/route`.

- [ ] **Step 3: Write the implementation**

Create `site/app/api/v1/normas/[idNorma]/diff/route.ts`:

```ts
import { getNormaById, getArticlesAsOf } from '@/lib/norma'
import { align, wordDiff, joinDiffText } from '@/lib/diff'
import { withApiKey, jsonOk, NotFound, BadRequest } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

const MAX_ADDED_BODY = 4_000

/** What changed in a norma between two fechas.
 *
 *  This is the central question the corpus exists to answer — "how did this law
 *  read before the reform?" — so the diff is returned structured rather than
 *  rendered: callers get per-article insert/delete operations and can present
 *  them however they like. The MCP server renders the same data as prose. */
export const GET = withApiKey('/v1/normas/{idNorma}/diff', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const url = new URL(req.url)
  const rawFrom = url.searchParams.get('from')
  const rawTo = url.searchParams.get('to')
  if (!rawFrom || !rawTo) {
    throw new BadRequest('Both from and to are required (YYYY-MM-DD).')
  }
  const from = parseFecha(rawFrom, rawFrom)
  const to = parseFecha(rawTo, rawTo)

  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const [prev, curr] = await Promise.all([
    getArticlesAsOf(idNorma, from),
    getArticlesAsOf(idNorma, to),
  ])
  if (prev.length === 0 && curr.length === 0) {
    throw new NotFound(`No text for idNorma ${idNorma} at either ${from} or ${to}`)
  }

  const changed = align(prev, curr).filter((a) => a.status !== 'unchanged')

  const cambios = changed.map((a) => {
    const art = a.curr ?? a.prev!
    const base = { slug: art.slug, rawHeading: art.rawHeading || art.label }
    if (a.status === 'modified' && a.prev && a.curr) {
      const ops = wordDiff(a.prev.body, a.curr.body)
        .filter((o) => o.op !== 'equal')
        .map((o) => ({ op: o.op, text: joinDiffText(o.text).trim() }))
        .filter((o) => o.text.length > 0)
      return { ...base, estado: 'modificado' as const, ops }
    }
    if (a.status === 'added') {
      return {
        ...base, estado: 'añadido' as const,
        body: art.body.slice(0, MAX_ADDED_BODY),
        truncado: art.body.length > MAX_ADDED_BODY,
      }
    }
    return { ...base, estado: 'eliminado' as const }
  })

  return jsonOk({
    idNorma, from, to,
    resumen: {
      modificados: cambios.filter((c) => c.estado === 'modificado').length,
      'añadidos': cambios.filter((c) => c.estado === 'añadido').length,
      eliminados: cambios.filter((c) => c.estado === 'eliminado').length,
    },
    cambios,
  }, 300)
})
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd site && pnpm vitest run app/api/v1/normas/diff.route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `cd site && pnpm vitest run && pnpm tsc --noEmit`
Expected: all tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add site/app/api/v1/normas
git commit --no-gpg-sign -m "feat(api): structured diff between two versions

The central question the corpus answers — how did this law read before
the reform — returned as structured per-article insert/delete operations
rather than rendered text, so callers present it however they like. The
MCP server renders the same data as prose.

An unchanged norma is an empty cambios array with a 200, not an error:
'nothing changed' is a real answer."
```

---

### Task 9: Apply the migration to production and document the API

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/api.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Apply the migration to production**

The site will 503 on every `/v1` call until `api_key` exists.

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/public-api
cat sql/006_api.sql | railway connect Postgres
```

Expected: `CREATE EXTENSION`, `CREATE TABLE` ×2, `CREATE INDEX` ×2, `CREATE FUNCTION` ×3.

- [ ] **Step 2: Issue a key and verify the live endpoints**

```bash
echo "SELECT issue_api_key('smoke test');" | railway connect Postgres
# then, with the printed token:
KEY=lc_live_…
curl -s -H "Authorization: Bearer $KEY" 'https://leyes.pisanvs.cl/v1/search?q=partidos+politicos' | head -c 400
curl -s -H "Authorization: Bearer $KEY" 'https://leyes.pisanvs.cl/v1/normas/29994' | head -c 400
curl -s -o /dev/null -w '%{http_code}\n' 'https://leyes.pisanvs.cl/v1/search?q=x'          # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer nope" \
  'https://leyes.pisanvs.cl/v1/search?q=x'                                                  # expect 401
echo "SELECT endpoint, status, duration_ms FROM api_usage ORDER BY ts DESC LIMIT 5;" | railway connect Postgres
```

Expected: JSON bodies for the authenticated calls, `401` for both unauthenticated ones, and `api_usage` rows whose `endpoint` values are **templates** (`/v1/normas/{idNorma}`), never concrete paths.

- [ ] **Step 3: Write the consumer documentation**

Create `docs/api.md` covering: base URL `https://leyes.pisanvs.cl/v1`, the `Authorization: Bearer` header, every endpoint from the spec's table with one worked `curl` example and its JSON response, the error codes table, the note that `idNorma` is the stable identifier while `(tipo, numero)` is ambiguous, and a statement of what is logged (key, endpoint template, status, duration, timestamp), what is not (query text, IP, user-agent, concrete paths), and the 90-day retention.

- [ ] **Step 4: Record the API in CLAUDE.md**

Add to the **Railway SSR** section, after the **MCP server** paragraph:

```markdown
**Public REST API.** `site/app/api/v1/**` is a read-only JSON API at
`https://leyes.pisanvs.cl/v1`, authenticated with `Authorization: Bearer
lc_live_…`. Same data layer as the MCP server (`@/lib/norma`, `@/lib/search`);
JSON rather than prose. Keys are issued with `SELECT issue_api_key('label')`
and revoked with `SELECT revoke_api_key('lc_live_prefix')` — only the SHA-256
digest is stored, so the plaintext is unrecoverable after issue. Usage is
recorded per key in `api_usage`, storing the **route template** and never the
concrete path, so the log cannot become a record of which laws a caller read;
pruned at 90 days by `prune_api_usage()`. Schema: `sql/006_api.sql`. Spec:
`docs/superpowers/specs/2026-09-08-public-api-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/api.md CLAUDE.md
git commit --no-gpg-sign -m "docs(api): consumer documentation for the public API

Covers every endpoint with a worked curl example, the error codes, and
why idNorma rather than (tipo, numero) is the stable identifier.

States plainly what is logged — key, endpoint template, status,
duration, timestamp — what is not (query text, IP, user-agent, concrete
paths), and the 90-day retention. sql/001_schema.sql records that
analytics.event collects no user dimension; this API introduces one for
its consumers, and key holders should be able to read that rather than
infer it."
```

---

## Self-Review

**Spec coverage.** All eight MCP tools map to a task: `search_laws` and the citation lookup (Task 5), `search_articles` and `get_article` and `get_law` (Task 6), `list_versions`, `get_modifications`, `get_raw_link` (Task 7), `diff_versions` (Task 8). Auth (Task 2), usage with the template guarantee (Tasks 1, 3, 4), issuance and revocation and pruning (Task 1), 503-not-empty (Task 4), `private` caching (Task 4), retention (Task 1), the privacy-posture note (Task 9).

**Type consistency.** `ApiKeyRecord {id, label}` is produced in Task 2 and consumed as `key.id` in Task 4. `RouteCtx.params` is a `Promise` in every route, matching Next 16. `parseIdNorma`/`parseFecha` are defined in Task 6 and used unchanged in Tasks 7 and 8. `NotFound`/`BadRequest` are defined in Task 4 and thrown in Tasks 5–8. `recordUsage(keyId, endpoint, status, durationMs)` has the same four-parameter shape in Tasks 3 and 4.

**One gap accepted deliberately.** `getAvisos` and `getRefundido` are exposed by the MCP `get_law` tool but not by `/v1/normas/{idNorma}`. They are display concerns (LeyChile's own annotations and refundido pointers) rather than corpus data, and adding them is a small additive change if a consumer asks. Recorded here so it is a decision rather than an oversight.
