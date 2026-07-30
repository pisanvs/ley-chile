/** Bounded in-process LRU cache of rendered PNG bytes, keyed by idNorma.
 *
 *  Law metadata is immutable after publication, so a render is valid
 *  forever — but caching every idNorma a crawler ever touches would grow
 *  unbounded (this corpus has ~350k laws), so entries are evicted
 *  least-recently-used once past maxEntries. `Map` preserves insertion
 *  order: re-inserting on a hit moves a key to the end (most-recent), and
 *  the oldest key sits at the front for eviction. */
export class OgImageCache {
  private readonly cache = new Map<number, Buffer>()

  constructor(private readonly maxEntries: number) {}

  get(id: number): Buffer | undefined {
    const hit = this.cache.get(id)
    if (hit) {
      this.cache.delete(id)
      this.cache.set(id, hit)
    }
    return hit
  }

  set(id: number, png: Buffer): void {
    this.cache.delete(id)
    this.cache.set(id, png)
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }

  get size(): number {
    return this.cache.size
  }
}
