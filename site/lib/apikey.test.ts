import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('./db', () => ({ pool: { query } }))

beforeEach(() => {
  vi.resetModules()
  query.mockReset()
})

const ROW = { id: 7, label: 'Acme Corp' }

describe('verifyApiKey', () => {
  it('accepts a live key and returns its identity', async () => {
    query.mockResolvedValue({ rows: [ROW] })
    const { verifyApiKey } = await import('./apikey')
    expect(await verifyApiKey('lc_live_abc')).toEqual(ROW)
  })

  it('looks the key up by SHA-256 digest, never by the plaintext', async () => {
    // The plaintext must not appear in any query parameter — a query log or an
    // error trace would otherwise leak usable credentials.
    query.mockResolvedValue({ rows: [ROW] })
    const { verifyApiKey } = await import('./apikey')
    await verifyApiKey('lc_live_abc')
    const params = query.mock.calls[0][1] as string[]
    expect(params).toHaveLength(1)
    expect(params[0]).not.toContain('lc_live_abc')
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects an unknown key', async () => {
    query.mockResolvedValue({ rows: [] })
    const { verifyApiKey } = await import('./apikey')
    expect(await verifyApiKey('lc_live_nope')).toBeNull()
  })

  it('rejects an empty token without touching the database', async () => {
    const { verifyApiKey } = await import('./apikey')
    expect(await verifyApiKey('')).toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('filters revoked keys in SQL rather than in the caller', async () => {
    query.mockResolvedValue({ rows: [] })
    const { verifyApiKey } = await import('./apikey')
    await verifyApiKey('lc_live_abc')
    expect(String(query.mock.calls[0][0])).toMatch(/revoked_at IS NULL/)
  })
})
