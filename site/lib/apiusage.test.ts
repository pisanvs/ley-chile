import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('./db', () => ({ pool: { query } }))

beforeEach(() => {
  vi.resetModules()
  query.mockReset()
})

describe('recordUsage', () => {
  it('writes one row with the key, endpoint, status and duration', async () => {
    query.mockResolvedValue({ rows: [] })
    const { recordUsage } = await import('./apiusage')
    await recordUsage(7, '/v1/normas/{idNorma}', 200, 42)
    expect(query.mock.calls[0][1]).toEqual([7, '/v1/normas/{idNorma}', 200, 42])
  })

  it('never rejects when the insert fails', async () => {
    // Usage recording is observability. It must not be able to fail a request
    // that already produced a correct response.
    query.mockRejectedValue(new Error('deadlock detected'))
    const { recordUsage } = await import('./apiusage')
    await expect(recordUsage(7, '/v1/search', 200, 5)).resolves.toBeUndefined()
  })

  it('refuses a concrete path, which would defeat the privacy guarantee', async () => {
    // The template is the whole point: '/v1/normas/29994' is a record of which
    // law someone read. Catching this in a unit test is cheaper than catching
    // it in a privacy review after six months of logs.
    query.mockResolvedValue({ rows: [] })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { recordUsage } = await import('./apiusage')
    await recordUsage(7, '/v1/normas/29994', 200, 5)
    expect(query).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('accepts every template the API actually uses', async () => {
    query.mockResolvedValue({ rows: [] })
    const { recordUsage } = await import('./apiusage')
    for (const t of [
      '/v1/search',
      '/v1/normas/{idNorma}',
      '/v1/normas/{idNorma}/articulos',
      '/v1/normas/{idNorma}/articulos/{slug}',
      '/v1/normas/{idNorma}/versiones',
      '/v1/normas/{idNorma}/diff',
      '/v1/normas/{idNorma}/modificaciones',
      '/v1/normas/{idNorma}/raw',
    ]) {
      await recordUsage(7, t, 200, 1)
    }
    expect(query).toHaveBeenCalledTimes(8)
  })
})
