import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchManifest } from './manifest'

describe('fetchManifest', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('parses a valid manifest payload', async () => {
    const payload = { repo: 'pisanvs/ley-chile', normas_count: 5, versions_count: 12, year_min: 1810, year_max: 2026 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => payload,
    }))
    const m = await fetchManifest('/idx/manifest.json')
    expect(m.repo).toBe('pisanvs/ley-chile')
    expect(m.normasCount).toBe(5)
    expect(m.yearMin).toBe(1810)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchManifest('/idx/manifest.json')).rejects.toThrow(/manifest/)
  })
})
