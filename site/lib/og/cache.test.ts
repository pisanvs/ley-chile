import { describe, it, expect } from 'vitest'
import { OgImageCache } from './cache'

describe('OgImageCache', () => {
  it('returns undefined on a miss', () => {
    const cache = new OgImageCache(3)
    expect(cache.get(1)).toBeUndefined()
  })

  it('returns what was set on a hit', () => {
    const cache = new OgImageCache(3)
    const png = Buffer.from('fake-png-bytes')
    cache.set(1, png)
    expect(cache.get(1)).toBe(png)
  })

  it('evicts the least-recently-used entry once past maxEntries', () => {
    const cache = new OgImageCache(2)
    cache.set(1, Buffer.from('a'))
    cache.set(2, Buffer.from('b'))
    cache.set(3, Buffer.from('c')) // evicts 1 (oldest, never touched)
    expect(cache.get(1)).toBeUndefined()
    expect(cache.get(2)).toBeDefined()
    expect(cache.get(3)).toBeDefined()
    expect(cache.size).toBe(2)
  })

  it('a get() refreshes recency, protecting a key from the next eviction', () => {
    const cache = new OgImageCache(2)
    cache.set(1, Buffer.from('a'))
    cache.set(2, Buffer.from('b'))
    cache.get(1) // 1 is now most-recently-used; 2 is now oldest
    cache.set(3, Buffer.from('c')) // evicts 2, not 1
    expect(cache.get(1)).toBeDefined()
    expect(cache.get(2)).toBeUndefined()
    expect(cache.get(3)).toBeDefined()
  })
})
