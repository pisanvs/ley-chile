import { pool } from './db'

/** Endpoint strings must be route templates, not concrete paths.
 *
 *  A digit where `{idNorma}` belongs means a caller passed the real path, which
 *  would turn this table into a record of which laws each key holder read. That
 *  is the exact data this design chose not to collect, so it is refused rather
 *  than written. */
const TEMPLATE_RE = /^\/v1\/[a-zA-Z{}/]*$/

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
