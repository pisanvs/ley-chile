import { pool } from './db'

export interface Hit {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  slug: string
  snippet: string
  /** 'exact' = matched by law number, surfaced first. 'cold' = full-text over
   *  article bodies (named before the hot tier was removed).
   *  'typeahead' = norma-level palette match, no article text involved. */
  tier: 'exact' | 'cold' | 'typeahead'
}

/** 'typeahead' runs per keystroke and stays norma-level; 'full' is the
 *  on-submit search that reads article bodies. They are different questions,
 *  and conflating them is what made an instant palette look expensive. */
export type SearchMode = 'typeahead' | 'full'

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

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
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

export interface SearchOutcome {
  hits: Hit[]
}

/** The one search entry point. Number matches first, then full-text over
 *  article bodies (Postgres FTS, sql/004) — deduped by norma and capped. All
 *  three surfaces (the ⌘K palette, /buscar, the MCP tool) go through here so
 *  they rank identically. Postgres is the only search engine.
 *
 *  A Postgres failure throws: there are no results to be had, and the caller
 *  must be able to tell that apart from an honestly empty corpus. */
export async function runSearchDetailed(
  q: string, asOf: string, limit = 20, mode: SearchMode = 'full',
): Promise<SearchOutcome> {
  const exact = await searchByNumber(q)

  // Typeahead stays norma-level and never reads article bodies.
  if (mode === 'typeahead') {
    const ahead = await searchTypeahead(q, limit)
    return { hits: dedupe([...exact, ...ahead], limit) }
  }

  const deep = await searchDeep(q, asOf, limit)
  return { hits: dedupe([...exact, ...deep], limit) }
}

/** One norma appears once, at its best-ranked position. Tiers are concatenated
 *  in priority order, so the first occurrence is the one to keep. */
function dedupe(hits: Hit[], limit: number): Hit[] {
  const seen = new Set<number>()
  return hits
    .filter((h) => (seen.has(h.idNorma) ? false : (seen.add(h.idNorma), true)))
    .slice(0, limit)
}

export async function runSearch(q: string, asOf: string, limit = 20): Promise<Hit[]> {
  return (await runSearchDetailed(q, asOf, limit)).hits
}

export interface ArticleHit {
  slug: string
  label: string
  rawHeading: string
  snippet: string
}

/** Search the articles of ONE norma, as of a date.
 *
 *  Postgres FTS, scoped by id_norma, so exhaustive within the law. Powers the MCP `search_articles` tool —
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

/** Deep path: exhaustive Postgres FTS over the WHOLE corpus.
 *
 *  `search_articulos_deep` (sql/004) picks its query shape by selectivity.
 *  This matters more than it sounds: the old query's `DISTINCT ON (id_norma)
 *  ... ORDER BY id_norma` forced a plan that never used `articulo_tsv_idx`,
 *  so a rare term scanned the entire table — 664 ms measured, against 8 ms
 *  for the same search through the GIN index.
 *
 *  DEPLOY ORDER: sql/003–005 must be applied before this ships. */
export async function searchDeep(q: string, asOf: string, limit = 20): Promise<Hit[]> {
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo, slug, snippet
       FROM search_articulos_deep($1, $2::date, $3)`,
    [q, asOf, limit],
  )
  return rows.map(r => ({
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    slug: r.slug, snippet: r.snippet, tier: 'cold' as const,
  }))
}

/** Typeahead: norma-level lookup for the ⌘K palette, per keystroke.
 *
 *  Deliberately does NOT search article bodies. Someone typing in the palette
 *  is asking "which law is this?", answered by title, common name or number —
 *  and that question is a single-table lookup over an index small enough to
 *  stay resident (~254 MB at full corpus). Measured ~4 ms for a correctly
 *  spelled query.
 *
 *  No `asOf`: a norma's identity does not change with the as-of date, only its
 *  text does, and typeahead shows no text. */
export async function searchTypeahead(q: string, limit = 12): Promise<Hit[]> {
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo
       FROM search_normas_typeahead($1, $2)`,
    [q, limit],
  )
  return rows.map(r => ({
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    slug: '', snippet: '', tier: 'typeahead' as const,
  }))
}
