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
