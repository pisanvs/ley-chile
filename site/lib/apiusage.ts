import { pool } from './db'

/** Known route templates that are safe to record in usage logs.
 *
 *  The usage log must never identify what a caller read. All endpoints must be
 *  route templates (with variable segments like {idNorma}), never concrete paths.
 *  An explicit allow-list enforces this directly. Adding a new endpoint requires
 *  adding its template here — deliberate friction appropriate for a privacy guarantee.
 */
export const KNOWN_ENDPOINTS = new Set([
  '/v1/search',
  '/v1/normas/{idNorma}',
  '/v1/normas/{idNorma}/articulos',
  '/v1/normas/{idNorma}/articulos/{slug}',
  '/v1/normas/{idNorma}/versiones',
  '/v1/normas/{idNorma}/diff',
  '/v1/normas/{idNorma}/modificaciones',
  '/v1/normas/{idNorma}/raw',
])

/** Record one API call. Never throws.
 *
 *  Callers dispatch this without awaiting, so a rejection would surface as an
 *  unhandled promise rejection and, on some runtimes, take the process down —
 *  over a metric. Observability must never be able to fail a request that
 *  already produced a correct response. */
export async function recordUsage(
  keyId: number, endpoint: string, status: number, durationMs: number,
): Promise<void> {
  if (!KNOWN_ENDPOINTS.has(endpoint)) {
    console.error(
      `[api] refusing to record unknown endpoint as usage: ${endpoint} — ` +
      `endpoint must be one of the known route templates`,
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
