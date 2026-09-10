import { describe, it, expect } from 'vitest'
import { gunzipSync } from 'node:zlib'

import { gzipJson, jsonz } from './jsonz'

const req = (headers: Record<string, string> = {}) =>
  new Request('https://x/api/idx/titles', { headers })

const big = JSON.stringify(Array.from({ length: 400 }, (_, i) => ({
  idNorma: i, titulo: 'LEY ORGANICA CONSTITUCIONAL DE LOS PARTIDOS POLITICOS',
})))

describe('gzipJson', () => {
  it('compresses a large body when the client accepts gzip', async () => {
    const res = gzipJson(req({ 'accept-encoding': 'gzip, deflate, br' }), big)
    expect(res.headers.get('content-encoding')).toBe('gzip')
    // And the bytes must actually round-trip — a wrong header with an
    // uncompressed body is worse than no compression at all.
    const buf = Buffer.from(await res.arrayBuffer())
    expect(gunzipSync(buf).toString()).toBe(big)
  })

  it('achieves a real reduction on repetitive legal text', async () => {
    const res = gzipJson(req({ 'accept-encoding': 'gzip' }), big)
    const out = (await res.arrayBuffer()).byteLength
    // Legal titles repeat heavily. If this ratio ever collapses, the helper is
    // not doing what it claims and the CPU is being spent for nothing.
    expect(out).toBeLessThan(Buffer.byteLength(big) / 4)
  })

  it('leaves the body alone when the client does not accept gzip', async () => {
    const res = gzipJson(req(), big)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(await res.text()).toBe(big)
  })

  it('does not compress a small body even when gzip is accepted', async () => {
    // Below one MTU there is nothing to win, and the Vary split costs more
    // than the bytes saved.
    const small = JSON.stringify({ ok: true })
    const res = gzipJson(req({ 'accept-encoding': 'gzip' }), small)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(await res.text()).toBe(small)
  })

  it('sets Vary: Accept-Encoding so caches do not serve gzip to a client that cannot read it', () => {
    const res = gzipJson(req({ 'accept-encoding': 'gzip' }), big)
    expect(res.headers.get('vary')?.toLowerCase()).toContain('accept-encoding')
  })

  it('appends to an existing Vary rather than clobbering it', () => {
    // Next sets Vary on some responses; overwriting it would break its router
    // caching.
    const res = gzipJson(req({ 'accept-encoding': 'gzip' }), big, {
      headers: { vary: 'RSC' },
    })
    const vary = res.headers.get('vary')?.toLowerCase() ?? ''
    expect(vary).toContain('rsc')
    expect(vary).toContain('accept-encoding')
  })

  it('preserves caller headers and status', () => {
    const res = gzipJson(req({ 'accept-encoding': 'gzip' }), big, {
      status: 200,
      headers: { 'cache-control': 'public, max-age=300' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('content-type')).toBe('application/json')
  })

  it('tolerates a missing request, as server-side callers may have none', async () => {
    const res = gzipJson(undefined, big)
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(await res.text()).toBe(big)
  })
})

describe('jsonz', () => {
  it('serializes an object and round-trips through gzip', async () => {
    const body = { total: 2, resultados: [{ idNorma: 1 }, { idNorma: 2 }] }
    const res = jsonz(req({ 'accept-encoding': 'gzip' }), body)
    // Small, so uncompressed — the point here is that serialization is correct.
    expect(JSON.parse(await res.text())).toEqual(body)
  })
})
