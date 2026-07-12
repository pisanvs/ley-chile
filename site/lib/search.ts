import { Meilisearch } from 'meilisearch'
import { pool } from './db'

export const OPEN_ENDED_TS = 253402300799
export const COLD_THRESHOLD = 5

// Falls back to a placeholder host so importing this module (e.g. from pure
// unit tests that only exercise asOfFilter/normalizeQuery/needsColdPath)
// never crashes for lack of MEILI_URL. Real deployments always set it.
const meili = new Meilisearch({
  host: process.env.MEILI_URL ?? 'http://localhost:7700',
  apiKey: process.env.MEILI_SEARCH_KEY,
})

export interface Hit {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  slug: string
  snippet: string
  tier: 'hot' | 'cold'
}

export function asOfFilter(asOf: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be YYYY-MM-DD, got ${asOf}`)
  const ts = Math.floor(Date.parse(`${asOf}T00:00:00Z`) / 1000)
  return `desde_ts <= ${ts} AND hasta_ts >= ${ts}`
}

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

export function needsColdPath(hotCount: number): boolean {
  return hotCount < COLD_THRESHOLD
}

/** Hot path: the ~8% of the corpus anyone searches. Typo-tolerant, instant.
 *  `distinct` is a per-search parameter, never an index setting — otherwise
 *  "all matching artículos inside this law" would silently collapse to one. */
export async function searchHot(q: string, asOf: string): Promise<Hit[]> {
  const res = await meili.index('articulos').search(q, {
    filter: asOfFilter(asOf),
    distinct: 'id_norma',
    limit: 20,
    attributesToCrop: ['body'],
    cropLength: 40,
  })
  return res.hits.map(h => ({
    idNorma: h.id_norma as number,
    tipo: h.tipo as string,
    numero: h.numero as string,
    titulo: h.titulo as string,
    slug: h.slug as string,
    snippet: (h._formatted?.body as string) ?? '',
    tier: 'hot' as const,
  }))
}

/** Cold path: exhaustive Postgres FTS over the tier Meilisearch does not hold.
 *  The `index_tier = 'meta'` predicate keeps the two result sets disjoint.
 *  This is also what stops the promotion policy from being self-fulfilling. */
export async function searchCold(q: string, asOf: string): Promise<Hit[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (n.id_norma)
            n.id_norma, n.tipo, n.numero, n.titulo, a.slug,
            ts_headline('spanish', a.body, websearch_to_tsquery('spanish', $1),
                        'MaxWords=40, MinWords=15') AS snippet,
            ts_rank_cd(a.tsv, websearch_to_tsquery('spanish', $1)) AS rank
       FROM articulo a
       JOIN norma n ON n.id_norma = a.id_norma
       JOIN articulo_span s ON s.articulo_id = a.id
      WHERE n.index_tier = 'meta'
        AND a.tsv @@ websearch_to_tsquery('spanish', $1)
        AND s.vigencia @> $2::date
      ORDER BY n.id_norma, rank DESC
      LIMIT 20`,
    [q, asOf],
  )
  return rows.map(r => ({
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    slug: r.slug, snippet: r.snippet, tier: 'cold' as const,
  }))
}
