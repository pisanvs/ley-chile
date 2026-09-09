import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyApiKey = vi.fn()
const recordUsage = vi.fn()
vi.mock('./apikey', () => ({ verifyApiKey }))
vi.mock('./apiusage', () => ({ recordUsage }))

beforeEach(() => {
  vi.resetModules()
  verifyApiKey.mockReset()
  recordUsage.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const CTX = { params: Promise.resolve({}) }
const req = (auth?: string) =>
  new Request('https://x/v1/search?q=a', auth ? { headers: { authorization: auth } } : undefined)

async function wrap(handler: () => Promise<Response>) {
  const { withApiKey } = await import('./apiroute')
  return withApiKey('/v1/search', handler)
}

describe('withApiKey', () => {
  it('401s with no Authorization header, and records nothing', async () => {
    const res = await (await wrap(async () => Response.json({})))(req(), CTX)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'missing_api_key', message: expect.any(String) } })
    // Unattributable traffic cannot be recorded — there is no key to attribute it to.
    expect(recordUsage).not.toHaveBeenCalled()
  })

  it('401s on a non-Bearer scheme', async () => {
    const res = await (await wrap(async () => Response.json({})))(req('Basic abc'), CTX)
    expect(res.status).toBe(401)
  })

  it('401s on an unknown or revoked key', async () => {
    verifyApiKey.mockResolvedValue(null)
    const res = await (await wrap(async () => Response.json({})))(req('Bearer lc_live_x'), CTX)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('invalid_api_key')
  })

  it('503s when the key lookup itself throws, and records nothing', async () => {
    // Distinguishes a database failure during auth (503) from an unknown or
    // revoked key (401, tested above) — these must never collapse together.
    verifyApiKey.mockRejectedValue(new Error('connection terminated'))
    const res = await (await wrap(async () => Response.json({})))(req('Bearer lc_live_x'), CTX)
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('service_unavailable')
    expect(recordUsage).not.toHaveBeenCalled()
  })

  it('runs the handler for a valid key and records the call', async () => {
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    const res = await (await wrap(async () => Response.json({ ok: true })))(req('Bearer lc_live_x'), CTX)
    expect(res.status).toBe(200)
    const [keyId, endpoint, status, duration] = recordUsage.mock.calls[0]
    expect(keyId).toBe(7)
    expect(endpoint).toBe('/v1/search')
    expect(status).toBe(200)
    expect(typeof duration).toBe('number')
  })

  it('turns a database failure into 503, never a 200 with empty data', async () => {
    // The 2026-09-07 outage in one assertion: a broken dependency was reported
    // as an empty successful result, so monitoring saw only healthy 200s.
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    const boom = async () => { throw new Error('connection terminated') }
    const res = await (await wrap(boom))(req('Bearer lc_live_x'), CTX)
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('service_unavailable')
    expect(recordUsage.mock.calls[0][2]).toBe(503)
  })

  it('maps NotFound to 404 and BadRequest to 400', async () => {
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    const { NotFound, BadRequest } = await import('./apiroute')
    const nf = await (await wrap(async () => { throw new NotFound('no such norma') }))(req('Bearer k'), CTX)
    expect(nf.status).toBe(404)
    expect((await nf.json()).error.code).toBe('not_found')
    const br = await (await wrap(async () => { throw new BadRequest('bad fecha') }))(req('Bearer k'), CTX)
    expect(br.status).toBe(400)
    expect((await br.json()).error.code).toBe('bad_request')
  })

  it('does not fail the request when usage recording rejects', async () => {
    verifyApiKey.mockResolvedValue({ id: 7, label: 'Acme' })
    recordUsage.mockRejectedValue(new Error('db down'))
    const res = await (await wrap(async () => Response.json({ ok: true })))(req('Bearer k'), CTX)
    expect(res.status).toBe(200)
  })
})

describe('jsonOk', () => {
  it('marks responses private so no shared cache stores authenticated data', async () => {
    const { jsonOk } = await import('./apiroute')
    const cc = jsonOk({ a: 1 }, 300).headers.get('cache-control')
    expect(cc).toContain('private')
    expect(cc).not.toContain('public')
    expect(cc).toContain('max-age=300')
  })

  it('sets an ETag on a cacheable response', async () => {
    const { jsonOk } = await import('./apiroute')
    const res = jsonOk({ a: 1 }, 300)
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]{32}"$/)
  })

  it('sets no ETag on a non-cacheable response', async () => {
    const { jsonOk } = await import('./apiroute')
    const res = jsonOk({ a: 1 })
    expect(res.headers.get('etag')).toBeNull()
  })

  it('returns 304 with no body when If-None-Match matches the computed ETag', async () => {
    const { jsonOk } = await import('./apiroute')
    const first = jsonOk({ a: 1 }, 300)
    const etag = first.headers.get('etag')
    const req = new Request('https://x/v1/normas/1', { headers: { 'if-none-match': etag! } })
    const res = jsonOk({ a: 1 }, 300, req)
    expect(res.status).toBe(304)
    expect(res.headers.get('etag')).toBe(etag)
    expect(res.headers.get('cache-control')).toContain('private')
    expect(await res.text()).toBe('')
  })

  it('returns 200 with the body when If-None-Match does not match', async () => {
    const { jsonOk } = await import('./apiroute')
    const req = new Request('https://x/v1/normas/1', { headers: { 'if-none-match': '"stale"' } })
    const res = jsonOk({ a: 1 }, 300, req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ a: 1 })
  })
})
