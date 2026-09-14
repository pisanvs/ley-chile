import { describe, it, expect, vi, beforeEach } from 'vitest'

/** The defect this file exists to prevent.
 *
 *  Full search consulted two full-text tiers and both of them searched article
 *  BODIES. The norma-level index — the one that holds títulos and common names
 *  — was wired only to the ⌘K palette, so in `full` mode a título carried no
 *  weight at all.
 *
 *  Measured against production, four of five normas could not retrieve
 *  themselves by pasting their own official título verbatim. Ley 20.000's title
 *  returned twenty Ministry of Agriculture resolutions about ornamental plant
 *  seeds, and "reduce la jornada laboral 40 horas" returned twenty MINEDUC
 *  decrees about liceo administration. That is not bad ranking; the words were
 *  simply never compared against a title.
 */

const search = vi.fn()
// A real class, not an arrow: searchHot calls `new Meilisearch(…)`, and mocking
// it unconstructibly makes the hot tier throw in every test — which turns the
// assertions below green for the wrong reason.
vi.mock('meilisearch', () => ({
  Meilisearch: class {
    index() {
      return { search }
    }
  },
}))

const query = vi.fn()
vi.mock('./db', () => ({ pool: { query } }))

const ASOF = '2026-09-14'

function stubPostgres(
  { exact = [], deep = [], titles = [] }:
  { exact?: unknown[]; deep?: unknown[]; titles?: unknown[] },
) {
  query.mockImplementation((sql: string) => {
    if (sql.includes('FROM norma n')) return Promise.resolve({ rows: exact })
    if (sql.includes('search_articulos_deep')) return Promise.resolve({ rows: deep })
    if (sql.includes('search_normas_typeahead')) return Promise.resolve({ rows: titles })
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`)
  })
}

const norma = (id: number, titulo: string) => ({
  id_norma: id, tipo: 'ley', numero: String(id), titulo,
})
const body = (id: number) => ({
  id_norma: id, tipo: 'res', numero: String(id), titulo: `resolución ${id}`,
  slug: 's', snippet: '…',
})

beforeEach(() => {
  vi.clearAllMocks()
  search.mockResolvedValue({ hits: [] })
})

describe('full search consults títulos', () => {
  it('finds the law whose título the caller pasted', async () => {
    const { runSearch } = await import('./search')
    stubPostgres({
      titles: [norma(235507, 'SANCIONA EL TRAFICO ILICITO DE ESTUPEFACIENTES')],
      // What the body tiers used to return on their own, and only they.
      deep: [body(900001), body(900002)],
    })
    const hits = await runSearch('SANCIONA EL TRAFICO ILICITO DE ESTUPEFACIENTES', ASOF)
    expect(hits[0]).toMatchObject({ idNorma: 235507, tier: 'titulo' })
  })

  it('ranks títulos above body mentions, below an exact number', async () => {
    const { runSearch } = await import('./search')
    stubPostgres({ exact: [norma(1, 'por número')], titles: [norma(2, 'por título')], deep: [body(3)] })
    const hits = await runSearch('20000', ASOF)
    expect(hits.map((h) => h.tier)).toEqual(['exact', 'titulo', 'cold'])
  })

  it('does not let títulos monopolise a broad topical query', async () => {
    // "medio ambiente" matches hundreds of títulos. If the tier were uncapped
    // it would fill the page and push out the article-level hits that answer
    // what was actually asked.
    const { runSearch } = await import('./search')
    stubPostgres({
      titles: Array.from({ length: 30 }, (_, i) => norma(100 + i, `ley de medio ambiente ${i}`)),
      deep: Array.from({ length: 30 }, (_, i) => body(200 + i)),
    })
    const hits = await runSearch('medio ambiente', ASOF, 20)
    expect(hits).toHaveLength(20)
    expect(hits.filter((h) => h.tier === 'titulo')).toHaveLength(10)
    // The other half still answers "which article says this".
    expect(hits.filter((h) => h.tier === 'cold').length).toBeGreaterThanOrEqual(10)
  })

  it('a norma matching both title and body appears once, at its better rank', async () => {
    const { runSearch } = await import('./search')
    stubPostgres({ titles: [norma(42, 'la ley')], deep: [{ ...body(42) }] })
    const hits = await runSearch('la ley', ASOF)
    expect(hits).toHaveLength(1)
    expect(hits[0].tier).toBe('titulo')
  })

  it('still works when Meilisearch is down', async () => {
    // The title tier is pure Postgres and has no reason to care.
    const { runSearchDetailed } = await import('./search')
    search.mockRejectedValue(new Error('ECONNREFUSED'))
    stubPostgres({ titles: [norma(235507, 'la ley')] })
    const res = await runSearchDetailed('la ley', ASOF)
    expect(res.degraded).toBe(true)
    expect(res.hits[0]).toMatchObject({ idNorma: 235507, tier: 'titulo' })
  })

  it('typeahead mode is unchanged and still labels its own tier', async () => {
    // The palette and the results page present these differently; folding them
    // into one tier would make /buscar and the analytics unable to tell "found
    // by title" from "shown while typing".
    const { runSearchDetailed } = await import('./search')
    stubPostgres({ titles: [norma(7, 'algo')] })
    const res = await runSearchDetailed('algo', ASOF, 20, 'typeahead')
    expect(res.hits.map((h) => h.tier)).toEqual(['typeahead'])
  })
})

describe('composeTiers', () => {
  it('orders precision-first and caps the title tier', async () => {
    const { composeTiers, titleTierCap } = await import('./search')
    const h = (id: number, tier: any) => ({
      idNorma: id, tipo: 'ley', numero: '1', titulo: '', slug: '', snippet: '', tier,
    })
    const out = composeTiers({
      exact: [h(1, 'exact')],
      titles: [h(2, 'titulo'), h(3, 'titulo'), h(4, 'titulo')],
      hot: [h(5, 'hot')],
      deep: [h(6, 'cold')],
    }, 6)
    expect(out.map((x) => x.idNorma)).toEqual([1, 2, 3, 4, 5, 6])
    expect(titleTierCap(6)).toBe(3)
  })

  it('never starves the title tier on a small page', async () => {
    const { titleTierCap } = await import('./search')
    expect(titleTierCap(1)).toBe(3)
    expect(titleTierCap(4)).toBe(3)
    expect(titleTierCap(20)).toBe(10)
  })

  it('tolerates missing tiers', async () => {
    const { composeTiers } = await import('./search')
    expect(composeTiers({}, 10)).toEqual([])
  })
})
