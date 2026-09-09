import { describe, it, expect, vi, beforeEach } from 'vitest'

const runSearch = vi.fn()
const getNormasByKey = vi.fn()
const getOrganismosByIds = vi.fn()
vi.mock('@/lib/search', () => ({ runSearch }))
vi.mock('@/lib/norma', () => ({ getNormasByKey, getOrganismosByIds }))
vi.mock('@/lib/apikey', () => ({ verifyApiKey: vi.fn().mockResolvedValue({ id: 1, label: 'T' }) }))
vi.mock('@/lib/apiusage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

beforeEach(() => {
  vi.resetModules()
  runSearch.mockReset()
  getNormasByKey.mockReset()
  getOrganismosByIds.mockReset().mockResolvedValue(new Map([[29994, 'MINISTERIO DEL INTERIOR']]))
})

const CTX = { params: Promise.resolve({}) }
const call = async (qs: string) => {
  const { GET } = await import('./route')
  return GET(new Request(`https://x/v1/search?${qs}`, {
    headers: { authorization: 'Bearer lc_live_x' },
  }), CTX)
}

const HIT = { idNorma: 29994, tipo: 'ley', numero: '18603', titulo: 'LOC DE LOS PARTIDOS POLITICOS' }

describe('GET /v1/search', () => {
  it('returns free-text results enriched with organismo', async () => {
    runSearch.mockResolvedValue([HIT])
    const res = await call('q=partidos')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.resultados[0]).toEqual({
      idNorma: 29994, tipo: 'ley', numero: '18603',
      titulo: 'LOC DE LOS PARTIDOS POLITICOS', organismo: 'MINISTERIO DEL INTERIOR',
    })
  })

  it('400s when neither q nor a tipo/numero pair is given', async () => {
    const res = await call('')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('bad_request')
  })

  it('resolves a citation to every candidate, since (tipo, numero) is ambiguous', async () => {
    // Several DFL 1 exist, one per organismo. Returning one of them silently
    // would be the /ley/20780 bug all over again.
    getNormasByKey.mockResolvedValue([
      { ...HIT, idNorma: 1, tipo: 'dfl', numero: '1', organismo: 'TRABAJO' },
      { ...HIT, idNorma: 2, tipo: 'dfl', numero: '1', organismo: 'SALUD' },
    ])
    const res = await call('tipo=dfl&numero=1')
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.resultados.map((r: { idNorma: number }) => r.idNorma)).toEqual([1, 2])
    expect(runSearch).not.toHaveBeenCalled()
  })

  it('rejects a malformed asOf rather than silently searching today', async () => {
    const res = await call('q=x&asOf=ayer')
    expect(res.status).toBe(400)
  })

  it('rejects an asOf that is not a real calendar date', async () => {
    // 2026-02-31 matches YYYY-MM-DD but does not exist. A regex-only check
    // would let it through; parseFecha's calendar round-trip must not.
    const res = await call('q=x&asOf=2026-02-31')
    expect(res.status).toBe(400)
  })

  it('caps limit so one call cannot ask for the whole corpus', async () => {
    runSearch.mockResolvedValue([])
    await call('q=xy&limit=9999')
    expect(runSearch.mock.calls[0][2]).toBe(100)
  })

  it('never truncates citation candidates, even when limit is given', async () => {
    // limit is a free-text-search concept only. Applying it to the citation
    // branch would silently drop candidates — exactly what idNorma addressing
    // exists to prevent. getNormasByKey deliberately takes no limit param.
    getNormasByKey.mockResolvedValue([
      { ...HIT, idNorma: 1, tipo: 'dfl', numero: '1', organismo: 'TRABAJO' },
      { ...HIT, idNorma: 2, tipo: 'dfl', numero: '1', organismo: 'SALUD' },
      { ...HIT, idNorma: 3, tipo: 'dfl', numero: '1', organismo: 'EDUCACION' },
    ])
    const res = await call('tipo=dfl&numero=1&limit=1')
    const body = await res.json()
    expect(body.total).toBe(3)
    expect(body.resultados.map((r: { idNorma: number }) => r.idNorma)).toEqual([1, 2, 3])
  })
})
