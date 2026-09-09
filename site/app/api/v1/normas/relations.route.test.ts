import { describe, it, expect, vi, beforeEach } from 'vitest'

const getNormaById = vi.fn()
const getVersions = vi.fn()
const getModifies = vi.fn()
const getModifiedBy = vi.fn()
const currentFecha = vi.fn()
vi.mock('@/lib/norma', () => ({ getNormaById, getVersions, getModifies, getModifiedBy, currentFecha }))
vi.mock('@/lib/apikey', () => ({ verifyApiKey: vi.fn().mockResolvedValue({ id: 1, label: 'T' }) }))
vi.mock('@/lib/apiusage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

const NORMA = {
  idNorma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC PARTIDOS',
  organismo: 'INTERIOR', derogado: false, fechaPublicacion: '1987-03-11', lawDir: 'leyes/18603',
}
const MOD = { idNorma: 242302, tipo: 'ley', numero: '20500', titulo: 'ASOCIACIONES', fecha: '2011-02-16' }

beforeEach(() => {
  vi.resetModules()
  for (const m of [getNormaById, getVersions, getModifies, getModifiedBy, currentFecha]) m.mockReset()
  getNormaById.mockResolvedValue(NORMA)
  getVersions.mockResolvedValue([
    { desde: '1987-03-11', hasta: '2011-02-15', commitSha: 'a', causaId: null, subject: 'orig' },
    { desde: '2011-02-16', hasta: null, commitSha: 'b', causaId: 242302, subject: 'reforma' },
  ])
  currentFecha.mockReturnValue('2011-02-16')
  getModifies.mockResolvedValue([])
  getModifiedBy.mockResolvedValue([MOD])
})

const H = { headers: { authorization: 'Bearer lc_live_x' } }
const P = { params: Promise.resolve({ idNorma: '29994' }) }

describe('GET /v1/normas/{idNorma}/versiones', () => {
  it('lists every version with its validity window', async () => {
    const { GET } = await import('./[idNorma]/versiones/route')
    const res = await GET(new Request('https://x/v1/normas/29994/versiones', H), P)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.versiones[0]).toMatchObject({ desde: '1987-03-11', hasta: '2011-02-15' })
    expect(body.vigente).toBe('2011-02-16')
  })

  it('404s for an unknown norma', async () => {
    getNormaById.mockResolvedValue(null)
    const { GET } = await import('./[idNorma]/versiones/route')
    expect((await GET(new Request('https://x/v1/normas/29994/versiones', H), P)).status).toBe(404)
  })
})

describe('GET /v1/normas/{idNorma}/modificaciones', () => {
  it('returns both directions, each carrying idNorma', async () => {
    // Without idNorma a caller would have to resolve (tipo, numero), which for
    // a "DFL 4" reference is ambiguous many times over.
    const { GET } = await import('./[idNorma]/modificaciones/route')
    const res = await GET(new Request('https://x/v1/normas/29994/modificaciones', H), P)
    const body = await res.json()
    expect(body.modificadaPor[0].idNorma).toBe(242302)
    expect(body.modifica).toEqual([])
  })
})

describe('GET /v1/normas/{idNorma}/raw', () => {
  it('returns the canonical upstream link for a fecha', async () => {
    const { GET } = await import('./[idNorma]/raw/route')
    const res = await GET(new Request('https://x/v1/normas/29994/raw?fecha=2011-02-16', H), P)
    const body = await res.json()
    expect(body.url).toContain('leychile.cl')
    expect(body.url).toContain('29994')
    expect(body.fecha).toBe('2011-02-16')
  })
})
