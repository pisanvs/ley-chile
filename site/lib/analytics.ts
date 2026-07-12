import { pool } from './db'

/** No user dimension is ever collected: no IP, cookie, session id, fingerprint.
 *  For a site where someone may search "ley de aborto", never collecting the
 *  means to link queries to people beats any retention policy. */
export interface Event {
  kind: 'search' | 'result_click' | 'cold_surface'
  queryNorm?: string
  idNorma?: number
  tier?: 'hot' | 'cold'
  resultCount?: number
  clickedRank?: number
}

const FLUSH_MS = 10_000
let buffer: Event[] = []
let timer: NodeJS.Timeout | null = null

/** Buffered: a search click costs zero round-trips on the hot path. A redeploy
 *  loses ≤10s of events, which against a 90-day promotion window is noise. */
export function recordEvent(e: Event): void {
  buffer.push(e)
  timer ??= setInterval(() => void flush(), FLUSH_MS).unref?.() ?? null
}

export async function flush(): Promise<void> {
  if (buffer.length === 0) return
  const batch = buffer
  buffer = []
  const values = batch.map((_, i) => {
    const b = i * 6
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`
  }).join(',')
  const params = batch.flatMap(e => [
    e.kind, e.queryNorm ?? null, e.idNorma ?? null,
    e.tier ?? null, e.resultCount ?? null, e.clickedRank ?? null,
  ])
  try {
    await pool.query(
      `INSERT INTO analytics.event (kind, query_norm, id_norma, tier, result_count, clicked_rank)
       VALUES ${values}`, params,
    )
  } catch (err) {
    // Analytics must never take the site down. Drop the batch and move on.
    console.error('[analytics] flush failed, dropping batch', err)
  }
}
