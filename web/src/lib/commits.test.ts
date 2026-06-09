import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchCommits } from './commits'

describe('fetchCommits', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('parses a commits shard', async () => {
    const payload = {
      norma: { id_norma: 20330, numero: '20.330', tipo: 'ley', titulo: 'Becas', organismo: 'Min Ed', fecha_publicacion: '2009-03-15' },
      commits: [
        { sha: 'abc', date: '2009-03-15', causa_id: 20330, subject: 'feat(ley): 20330', magnitude: 0 },
        { sha: 'def', date: '2015-06-01', causa_id: 20808, subject: 'update(ley): 20330 by 20808', magnitude: 5 },
      ],
      rel_dir: 'leyes/20330',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
    const result = await fetchCommits(20330)
    expect(result.norma.numero).toBe('20.330')
    expect(result.relDir).toBe('leyes/20330')
    expect(result.commits).toHaveLength(2)
    expect(result.commits[0].sha).toBe('abc')
    expect(result.commits[1].causaId).toBe(20808)
  })

  it('picks the latest version by date when sorted ascending', async () => {
    const payload = {
      norma: { id_norma: 1, numero: '1', tipo: 'ley', titulo: 't', organismo: 'o', fecha_publicacion: '2000-01-01' },
      commits: [
        { sha: 'older', date: '2000-01-01', causa_id: 1, subject: 's', magnitude: 0 },
        { sha: 'newer', date: '2020-01-01', causa_id: 1, subject: 's', magnitude: 0 },
      ],
      rel_dir: 'leyes/1',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
    const result = await fetchCommits(1)
    const latest = result.commits[result.commits.length - 1]
    expect(latest.sha).toBe('newer')
  })
})
