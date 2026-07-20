import { Meilisearch } from 'meilisearch'
import { pool } from './db'

export const OPEN_ENDED_TS = 253402300799
export const COLD_THRESHOLD = 5

// Constructed lazily so importing this module (e.g. from pure unit tests
// that only exercise asOfFilter/normalizeQuery/needsColdPath) never
// constructs a client and never touches MEILI_URL. Real deployments call
// searchHot, which constructs on first use -- and fail loudly if MEILI_URL
// is unset, rather than silently degrading to a localhost fallback.
let _client: Meilisearch | null = null
function meiliClient(): Meilisearch {
  if (!_client) {
    _client = new Meilisearch({
      host: process.env.MEILI_URL!,
      apiKey: process.env.MEILI_SEARCH_KEY,
    })
  }
  return _client
}

export interface Hit {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  slug: string
  snippet: string
  /** 'exact' = matched by law number, surfaced first. 'hot'/'cold' = full-text. */
  tier: 'exact' | 'hot' | 'cold'
}

/** Substantive law types first: someone typing a bare number almost always
 *  means a ley or a code, not one of the thousands of numbered decretos and
 *  resoluciones that share every low number. */
const TIPO_RANK = `CASE n.tipo
    WHEN 'ley' THEN 0 WHEN 'dl' THEN 1 WHEN 'dfl' THEN 2 WHEN 'cod' THEN 3
    WHEN 'dto' THEN 4 ELSE 5 END`

/** A search query that is really a law citation, e.g. "20000", "ley 20.000",
 *  "dfl 4", "DL 3.500". Returns the tipo (if the user gave one) and the bare
 *  numero, or null when the query is not number-shaped.
 *
 *  Chilean law numbers are written with thousands separators ("20.000"), so
 *  dots are stripped; a numero in the data is digits only. */
export function parseNumberQuery(q: string): { tipo?: string; numero: string } | null {
  const norm = q.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')
  // Optional tipo word, optional "n°"/"nº"/"no", then 1–7 digits, nothing else.
  const m = norm.match(
    /^(?:(ley|dl|dfl|dto|cod|res|decreto|codigo)\s*)?(?:n[°º]?\s*)?(\d{1,7})$/,
  )
  if (!m) return null
  const tipoWord = m[1]
  const tipo = tipoWord === 'decreto' ? 'dto' : tipoWord === 'codigo' ? 'cod' : tipoWord
  return { tipo, numero: m[2] }
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
  const res = await meiliClient().index('articulos').search(q, {
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

/** Exact law-number matches, surfaced above full-text results.
 *
 *  This is the fix for "search 20000 and get everything except ley 20.000":
 *  the number was only ever matched as free text inside article bodies, so a
 *  law whose *number* is 20000 lost to any law that happens to mention "20.000"
 *  somewhere. Now a number-shaped query does an exact `numero` lookup first.
 *
 *  Ordered ley-first then most-reformed, because (tipo, numero) is not unique —
 *  "1" alone is 450 decretos — so without a sensible order the one law the user
 *  meant would drown. Capped for the same reason. */
export async function searchByNumber(q: string): Promise<Hit[]> {
  const parsed = parseNumberQuery(q)
  if (!parsed) return []
  const { tipo, numero } = parsed
  const { rows } = await pool.query(
    `SELECT n.id_norma, n.tipo, n.numero, n.titulo
       FROM norma n
       LEFT JOIN version v ON v.id_norma = n.id_norma
      WHERE n.numero = $1 ${tipo ? 'AND n.tipo = $2' : ''}
      GROUP BY n.id_norma, n.tipo, n.numero, n.titulo
      ORDER BY ${TIPO_RANK}, count(v.*) DESC, n.id_norma ASC
      LIMIT 6`,
    tipo ? [numero, tipo] : [numero],
  )
  return rows.map((r) => ({
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    slug: '', snippet: '', tier: 'exact' as const,
  }))
}

/** The one search entry point. Number matches first, then the hot full-text
 *  tier, then the cold tier when the hot tier is thin — deduped by norma and
 *  capped. All three surfaces (the ⌘K palette, /buscar, the MCP tool) go
 *  through here so they rank identically. */
export async function runSearch(q: string, asOf: string, limit = 20): Promise<Hit[]> {
  const exact = await searchByNumber(q)
  const hot = await searchHot(q, asOf)
  const cold = needsColdPath(hot.length) ? await searchCold(q, asOf) : []
  const seen = new Set<number>()
  return [...exact, ...hot, ...cold]
    .filter((h) => (seen.has(h.idNorma) ? false : (seen.add(h.idNorma), true)))
    .slice(0, limit)
}

export interface ArticleHit {
  slug: string
  label: string
  rawHeading: string
  snippet: string
}

/** Search the articles of ONE norma, as of a date.
 *
 *  Postgres FTS, not Meilisearch: this must work for any norma, and Meili only
 *  holds the hot tier (~8% of the corpus). Scoped by id_norma, so exhaustive
 *  within the law regardless of tier. Powers the MCP `search_articles` tool —
 *  "where does this law talk about X" without pulling its whole text.
 */
export async function searchArticles(
  idNorma: number, q: string, asOf: string,
): Promise<ArticleHit[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.slug)
            a.slug, a.label, a.raw_heading,
            ts_headline('spanish', a.body, websearch_to_tsquery('spanish', $2),
                        'MaxWords=45, MinWords=18') AS snippet,
            ts_rank_cd(a.tsv, websearch_to_tsquery('spanish', $2)) AS rank
       FROM articulo a
       JOIN articulo_span s ON s.articulo_id = a.id
      WHERE a.id_norma = $1
        AND a.tsv @@ websearch_to_tsquery('spanish', $2)
        AND s.vigencia @> $3::date
      ORDER BY a.slug, rank DESC`,
    [idNorma, q, asOf],
  )
  return rows
    .map(r => ({
      slug: r.slug as string,
      label: r.label as string,
      rawHeading: (r.raw_heading ?? '') as string,
      snippet: (r.snippet ?? '') as string,
      rank: r.rank as number,
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 25)
    .map(({ slug, label, rawHeading, snippet }) => ({ slug, label, rawHeading, snippet }))
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
