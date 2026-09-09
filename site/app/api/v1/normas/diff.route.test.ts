import { describe, it, expect, vi, beforeEach } from 'vitest'

const getNormaById = vi.fn()
const getArticlesAsOf = vi.fn()
vi.mock('@/lib/norma', () => ({ getNormaById, getArticlesAsOf }))
vi.mock('@/lib/apikey', () => ({ verifyApiKey: vi.fn().mockResolvedValue({ id: 1, label: 'T' }) }))
vi.mock('@/lib/apiusage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

const NORMA = {
  idNorma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC PARTIDOS',
  organismo: 'INTERIOR', derogado: false, fechaPublicacion: '1987-03-11', lawDir: 'leyes/18603',
}
const art = (slug: string, body: string) => ({
  slug, label: `Artículo ${slug}`, rawHeading: `Artículo ${slug}`, body, ord: 0,
})

beforeEach(() => {
  vi.resetModules()
  getNormaById.mockReset().mockResolvedValue(NORMA)
  getArticlesAsOf.mockReset()
})

const H = { headers: { authorization: 'Bearer lc_live_x' } }
const P = { params: Promise.resolve({ idNorma: '29994' }) }
const call = async (qs: string) => {
  const { GET } = await import('./[idNorma]/diff/route')
  return GET(new Request(`https://x/v1/normas/29994/diff?${qs}`, H), P)
}

describe('GET /v1/normas/{idNorma}/diff', () => {
  it('reports modified, added and removed articles', async () => {
    getArticlesAsOf
      .mockResolvedValueOnce([art('a1', 'el plazo es de 30 dias'), art('a2', 'se elimina')])
      .mockResolvedValueOnce([art('a1', 'el plazo es de 60 dias'), art('a3', 'nuevo')])
    const res = await call('from=2010-01-01&to=2020-01-01')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resumen).toEqual({ modificados: 1, añadidos: 1, eliminados: 1 })
    const mod = body.cambios.find((c: { estado: string }) => c.estado === 'modificado')
    expect(mod.slug).toBe('a1')
    expect(JSON.stringify(mod.ops)).toContain('60')
  })

  it('returns an empty change set when nothing changed, not an error', async () => {
    getArticlesAsOf
      .mockResolvedValueOnce([art('a1', 'igual')])
      .mockResolvedValueOnce([art('a1', 'igual')])
    const res = await call('from=2010-01-01&to=2020-01-01')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cambios).toEqual([])
    expect(body.resumen).toEqual({ modificados: 0, añadidos: 0, eliminados: 0 })
  })

  it('400s when from or to is missing', async () => {
    expect((await call('from=2010-01-01')).status).toBe(400)
    expect((await call('to=2020-01-01')).status).toBe(400)
  })

  it('404s when neither fecha has any text', async () => {
    getArticlesAsOf.mockResolvedValue([])
    expect((await call('from=1800-01-01&to=1801-01-01')).status).toBe(404)
  })
})
