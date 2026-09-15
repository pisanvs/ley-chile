import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { segment } from './segment'

/** /api/text/{idNorma}/{fecha} — the permalink `get_raw_link` advertises as
 *  "estable: (norma, fecha) siempre devuelve el mismo texto".
 *
 *  It was not stable. `fecha` reached `$2::date` unvalidated, so Postgres's
 *  DateStyle (MDY in production) decided what it meant: `01-06-2024` — 1 June
 *  to every Chilean lawyer who writes it — resolved to 6 January and returned
 *  a different Código del Trabajo (698,235 bytes rather than 708,079), with no
 *  error and no warning. `13-09-2024` had no MDY reading at all and came back
 *  as a bare 500; so did `banana` and `2024-02-30`. A nonexistent idNorma, and
 *  a date before the norma was enacted, both answered 200 with zero bytes,
 *  which is indistinguishable from a law that says nothing.
 *
 *  The pool is mocked (lib/search.resilience.test.ts does the same), so these
 *  exercise the route's real SQL-backed helpers — getVersions, getArticlesAsOf,
 *  getNormaById — rather than stubs of them. */

const query = vi.fn()
vi.mock('./db', () => ({ pool: { query } }))

const CT = 207436 // Código del Trabajo
const ARTS = [
  { slug: 'art-1', label: 'articulo 1', raw_heading: 'Artículo 1º', body: 'Las relaciones laborales…', ord: 0 },
  { slug: 'art-2', label: 'articulo 2', raw_heading: 'Artículo 2º', body: 'Reconócese la función social…', ord: 1 },
]
const VERSIONS = [
  { desde: '2003-01-16', hasta: '2024-05-31', commit_sha: 'a', causa_id: null, subject: 'v1' },
  { desde: '2024-06-01', hasta: null, commit_sha: 'b', causa_id: 1191554, subject: 'v2' },
]
const NORMA_ROW = {
  id_norma: CT, tipo: 'dfl', numero: '1', titulo: 'CODIGO DEL TRABAJO', organismo: 'TRABAJO',
  derogado: false, fecha_publicacion: '2003-01-16', law_dir: 'dfl/trabajo/1',
}

/** Route each statement to its fixture by a fragment unique to that query, so
 *  a change to any of them fails loudly here instead of feeding the wrong rows
 *  to the wrong helper. */
function stub({ versions = VERSIONS, articles = ARTS as unknown[], norma = NORMA_ROW as unknown }) {
  query.mockImplementation((sql: string) => {
    if (sql.includes('articulo_span')) return Promise.resolve({ rows: articles })
    if (sql.includes('FROM version')) return Promise.resolve({ rows: versions })
    if (sql.includes('FROM norma')) return Promise.resolve({ rows: norma ? [norma] : [] })
    throw new Error(`unexpected SQL in test: ${sql.slice(0, 80)}`)
  })
}

async function get(id: string, fecha: string) {
  const { GET } = await import('@/app/api/text/[id]/[fecha]/route')
  return GET(new Request(`https://x/api/text/${id}/${fecha}`), {
    params: Promise.resolve({ id, fecha }),
  })
}

beforeEach(() => {
  vi.resetModules()
  query.mockReset()
  // `future` is relative to the wall clock; pin it so the horizon assertions
  // mean the same thing in 2030 as they do today.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'))
  stub({})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fecha validation — 400, not 500, and never a guess', () => {
  it.each([
    ['banana', 'no es una fecha ni por asomo'],
    ['2024-02-30', '30 de febrero no existe'],
    ['20240203', 'sin guiones no es ISO 8601'],
    ['2024-2-3', 'los componentes deben ir con cero a la izquierda'],
    ['2024-01-06T00:00:00Z', 'un timestamp no es un día'],
  ])('rejects %s (%s)', async (fecha) => {
    const res = await get(String(CT), fecha)
    expect(res.status).toBe(400)
    expect(await res.text()).not.toBe('')
    expect(query).not.toHaveBeenCalled()
  })

  it.each(['01-06-2024', '13-09-2024', '03-09-2024'])(
    'refuses the ambiguous DD-MM-YYYY %s and names the ISO spelling', async (fecha) => {
      const res = await get(String(CT), fecha)
      expect(res.status).toBe(400)
      const body = await res.text()
      // The whole point of the 400: say that the format is ambiguous rather
      // than pick one of the two readings. 01-06-2024 used to silently become
      // 6 January; 13-09-2024 used to be a 500.
      expect(body).toMatch(/ambigu/i)
      expect(body).toContain('YYYY-MM-DD')
      expect(body).toContain(fecha)
      expect(query).not.toHaveBeenCalled()
    },
  )

  it('rejects a bad idNorma without touching the database', async () => {
    const res = await get('abc', '2024-06-01')
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('abc')
    expect(query).not.toHaveBeenCalled()
  })
})

describe('the two dates that used to diverge silently', () => {
  it('reads 2024-01-06 and 2024-06-01 as different days, both ISO', async () => {
    const jan = await get(String(CT), '2024-01-06')
    expect(jan.status).toBe(200)
    const janSql = query.mock.calls.find((c) => String(c[0]).includes('articulo_span'))
    expect(janSql?.[1]).toEqual([CT, '2024-01-06'])

    query.mockClear()
    const jun = await get(String(CT), '2024-06-01')
    expect(jun.status).toBe(200)
    const junSql = query.mock.calls.find((c) => String(c[0]).includes('articulo_span'))
    expect(junSql?.[1]).toEqual([CT, '2024-06-01'])
  })
})

describe('misses are 404s that say which miss', () => {
  it('404s for a norma that does not exist', async () => {
    stub({ versions: [], articles: [], norma: null })
    const res = await get('999999999', '2024-01-01')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('999999999')
  })

  it('404s for a norma in the corpus with no imported versions', async () => {
    stub({ versions: [], articles: [] })
    const res = await get(String(CT), '2024-01-01')
    expect(res.status).toBe(404)
    expect(await res.text()).toMatch(/versión/i)
  })

  it('404s for a date before the norma existed, naming the first version', async () => {
    stub({ articles: [] })
    const res = await get(String(CT), '2000-01-01')
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toContain('2000-01-01')
    expect(body).toContain('2003-01-16') // primera versión en el corpus
  })

  it('404s after the last closed version without claiming the norma is too new', async () => {
    // A derogated norma: coverage() reports `before` here too, but "su primera
    // versión rige desde 1990" would be the wrong sentence for a 2020 query.
    stub({
      versions: [{ desde: '1990-01-01', hasta: '2010-12-31', commit_sha: 'a', causa_id: null, subject: 'v' }],
      articles: [],
    })
    const res = await get(String(CT), '2020-01-01')
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toContain('2020-01-01')
    expect(body).not.toMatch(/no estaba vigente/i)
  })
})

describe('corpus horizon', () => {
  it('serves a covered date with a positive horizon header', async () => {
    const res = await get(String(CT), '2024-06-01')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-corpus-horizon')).toBe(
      'state=covered; fecha=2024-06-01; today=2026-09-15; version=2024-06-01',
    )
  })

  it('still serves a date beyond the horizon, flagged as an extrapolation', async () => {
    const res = await get(String(CT), '2030-01-01')
    expect(res.status).toBe(200)
    const h = res.headers.get('x-corpus-horizon') ?? ''
    expect(h).toContain('state=future')
    expect(h).toContain('extrapolation')
    expect(h).toContain('last-version=2024-06-01')
    expect(h).toContain('today=2026-09-15')
    expect((await res.text()).length).toBeGreaterThan(0) // the text is not withheld
  })
})

describe('the markdown contract is untouched', () => {
  it('emits only #### headings and bodies — no banner, no preamble segment', async () => {
    const res = await get(String(CT), '2030-01-01') // the case that gained a signal
    const body = await res.text()
    expect(body.startsWith('#### Artículo 1º')).toBe(true)
    expect(body).not.toMatch(/⚠|FECHA FUTURA|extrapolación/)
    const segs = segment(body)
    expect(segs.map((s) => s.label)).toEqual(['articulo 1', 'articulo 2'])
    expect(segs.some((s) => s.label === '__preamble__' || s.label === '__doc__')).toBe(false)
  })

  it('renders byte-identically whether or not the date is extrapolated', async () => {
    const covered = await (await get(String(CT), '2024-06-01')).text()
    const future = await (await get(String(CT), '2030-01-01')).text()
    expect(future).toBe(covered)
  })

  it('serves text/plain', async () => {
    const res = await get(String(CT), '2024-06-01')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })
})
