import { describe, it, expect, vi, beforeEach } from 'vitest'

/** The outage this file exists to prevent.
 *
 *  2026-09-07: Meilisearch did not come back from a Railway region migration.
 *  `runSearch` awaited `searchHot` unconditionally, so an unreachable Meili
 *  threw past the two tiers that had already succeeded — and `/api/search`
 *  caught the throw and returned `{hits: []}` with status 200. A total search
 *  outage was rendered to users as "no results found", and to monitoring as a
 *  wall of healthy 200s.
 *
 *  Both tiers exercised here are pure Postgres. Neither has any reason to care
 *  whether Meilisearch exists. */

const search = vi.fn()
// A real class, not `vi.fn(() => …)`: `searchHot` calls `new Meilisearch(…)`,
// and an arrow function is not constructible — mocking it that way makes the
// hot tier throw in every test, which silently turns the fallback assertions
// below green for entirely the wrong reason.
vi.mock('meilisearch', () => ({
  Meilisearch: class {
    index() {
      return { search }
    }
  },
}))

const query = vi.fn()
vi.mock('./db', () => ({ pool: { query } }))

const ASOF = '2026-09-07'

/** Route each tier's SQL to its own fixture by matching on a fragment unique
 *  to that query, so a change in either statement fails loudly here rather
 *  than silently feeding the wrong rows to the wrong tier. */
function stubPostgres(
  { exact = [], cold = [], typeahead = [] }:
  { exact?: unknown[]; cold?: unknown[]; typeahead?: unknown[] },
) {
  query.mockImplementation((sql: string) => {
    if (sql.includes('FROM norma n')) return Promise.resolve({ rows: exact })
    if (sql.includes('search_articulos_deep')) return Promise.resolve({ rows: cold })
    if (sql.includes('search_normas_typeahead')) return Promise.resolve({ rows: typeahead })
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`)
  })
}

const EXACT_ROW = { id_norma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC DE LOS PARTIDOS POLITICOS' }
const COLD_ROW = {
  id_norma: 242302, tipo: 'ley', numero: '20500', titulo: 'ASOCIACIONES Y PARTICIPACION CIUDADANA',
  slug: 'a1', snippet: '…participación…', rank: 0.4,
}

beforeEach(() => {
  vi.resetModules()
  search.mockReset()
  query.mockReset()
  process.env.MEILI_URL = 'http://meili.invalid:3331'
})

describe('runSearch when Meilisearch is unreachable', () => {
  it('still returns exact law-number matches', async () => {
    // The regression in its purest form: "18603" is answered entirely by
    // Postgres, and returned nothing at all while Meili was down.
    search.mockRejectedValue(new Error('connect ECONNREFUSED'))
    stubPostgres({ exact: [EXACT_ROW] })

    const { runSearch } = await import('./search')
    const hits = await runSearch('18603', ASOF)

    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ idNorma: 29994, numero: '18603', tier: 'exact' })
  })

  it('falls through to the Postgres cold tier for free-text queries', async () => {
    // A failed hot tier must be treated as a thin one, not as a fatal error:
    // the cold path covers the whole corpus and can answer this alone.
    search.mockRejectedValue(new Error('connect ECONNREFUSED'))
    stubPostgres({ cold: [COLD_ROW] })

    const { runSearch } = await import('./search')
    const hits = await runSearch('participacion ciudadana', ASOF)

    expect(hits.map(h => h.idNorma)).toEqual([242302])
    expect(hits[0].tier).toBe('cold')
  })

  it('reports the degradation instead of passing it off as a clean result', async () => {
    // Silent fallback is how this outage stayed invisible. Callers must be
    // able to tell "Meili found nothing" apart from "Meili is gone".
    search.mockRejectedValue(new Error('connect ECONNREFUSED'))
    stubPostgres({ exact: [EXACT_ROW] })

    const { runSearchDetailed } = await import('./search')
    const res = await runSearchDetailed('18603', ASOF)

    expect(res.degraded).toBe(true)
    expect(res.hits).toHaveLength(1)
  })

  it('is not degraded when Meilisearch merely has no match', async () => {
    search.mockResolvedValue({ hits: [] })
    stubPostgres({ exact: [EXACT_ROW] })

    const { runSearchDetailed } = await import('./search')
    const res = await runSearchDetailed('18603', ASOF)

    expect(res.degraded).toBe(false)
  })

  it('answers typeahead without consulting Meilisearch at all', async () => {
    // The palette is norma-level and pure Postgres, so a Meili outage must be
    // invisible to it — not merely survivable.
    search.mockRejectedValue(new Error('connect ECONNREFUSED'))
    stubPostgres({ typeahead: [{ ...EXACT_ROW, id_norma: 7000 }] })

    const { runSearchDetailed } = await import('./search')
    const res = await runSearchDetailed('partid', ASOF, 12, 'typeahead')

    expect(search).not.toHaveBeenCalled()
    expect(res.degraded).toBe(false)
    expect(res.hits.map(h => h.tier)).toEqual(['typeahead'])
  })

  it('does not read article bodies on the typeahead path', async () => {
    // Guards the whole point of the split: per keystroke we must not run the
    // deep article search, whatever the hot tier is doing.
    search.mockResolvedValue({ hits: [] })
    stubPostgres({ typeahead: [{ ...EXACT_ROW, id_norma: 7000 }] })

    const { runSearchDetailed } = await import('./search')
    await runSearchDetailed('partid', ASOF, 12, 'typeahead')

    const sql = query.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(sql.some(s => s.includes('search_articulos_deep'))).toBe(false)
  })

  it('surfaces the exact law-number match above typeahead hits', async () => {
    search.mockResolvedValue({ hits: [] })
    stubPostgres({ exact: [EXACT_ROW], typeahead: [{ ...EXACT_ROW, id_norma: 7000 }] })

    const { runSearchDetailed } = await import('./search')
    const res = await runSearchDetailed('18603', ASOF, 12, 'typeahead')

    expect(res.hits.map(h => h.tier)).toEqual(['exact', 'typeahead'])
  })

  it('propagates a Postgres failure rather than reporting an empty corpus', async () => {
    // The inverse guard. If Postgres is down there are no results to be had,
    // and the caller must surface a 5xx — never an innocent-looking empty list.
    search.mockResolvedValue({ hits: [] })
    query.mockRejectedValue(new Error('terminating connection due to administrator command'))

    const { runSearch } = await import('./search')
    await expect(runSearch('18603', ASOF)).rejects.toThrow(/terminating connection/)
  })
})
