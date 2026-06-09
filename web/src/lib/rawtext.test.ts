import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRawText } from './rawtext'

describe('fetchRawText', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('fetches the text at the pinned SHA', async () => {
    const text = '# Artículo 1°\nEstablécese...'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => text })
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchRawText({ sha: 'abc123', relDir: 'leyes/20330' })
    expect(out).toBe(text)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/abc123/')
    expect(url).toContain('leyes/20330/texto.md')
  })

  it('throws on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchRawText({ sha: 'abc', relDir: 'leyes/1' })).rejects.toThrow(/404/)
  })
})
