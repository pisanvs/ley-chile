import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { annotations, legacySlugMatches, resolveHighlight, type Highlight } from './annotations'

const hl = (over: Partial<Highlight>): Highlight => ({
  id: 'h', idNorma: 1014974, slug: 'art-16', start: 0, end: 0, color: 'yellow',
  text: '', createdAt: 0, ...over,
})

describe('legacySlugMatches', () => {
  it.each([
    ['art-16', 'art-16', true],
    ['art-16', 'art-16-b', true],          // the series used to share art-16
    ['art-183', 'art-183-nn', true],       // 183 Ñ
    ['art-1', 'art-1-transitorio', true],
    ['art-1757', 'art-1757-art-2', true],  // Código Civil gained its qualifier
    ['art-1', 'art-10', false],
    ['art-10', 'art-10-bis', false],       // bis is its own article, not a series
    ['art-16', 'art-16-b-c', false],
  ])('%s saved, %s now → %s', (saved, slug, ok) => {
    expect(legacySlugMatches(saved, slug)).toBe(ok)
  })
})

describe('resolveHighlight', () => {
  const body = 'Se entenderá por acoso escolar toda acción u omisión constitutiva de agresión.'

  it('keeps a highlight whose text is still at its offsets', () => {
    const h = hl({ start: 17, end: 30, text: 'acoso escolar' })
    expect(resolveHighlight(h, body)).toBe(h)
  })

  it('keeps a short highlight in place', () => {
    const h = hl({ start: 0, end: 2, text: 'Se' })
    expect(resolveHighlight(h, body)).toBe(h)
  })

  it('moves a highlight whose text appears once elsewhere (offset drift)', () => {
    const h = hl({ start: 0, end: 13, text: 'acoso escolar' })
    expect(resolveHighlight(h, body)).toMatchObject({ start: 17, end: 30 })
  })

  it('does not place text that is not in this article', () => {
    expect(resolveHighlight(hl({ start: 0, end: 20, text: 'buena convivencia escolar' }), body)).toBeNull()
  })

  it('does not place text that appears twice', () => {
    const twice = 'la ley dispone. Luego la ley dispone.'
    expect(resolveHighlight(hl({ start: 30, end: 40, text: 'la ley dispone' }), twice)).toBeNull()
  })

  it('does not move short text', () => {
    expect(resolveHighlight(hl({ start: 40, end: 44, text: 'toda' }), body)).toBeNull()
  })

  it('does not mutate the saved highlight', () => {
    const h = hl({ start: 0, end: 13, text: 'acoso escolar' })
    resolveHighlight(h, body)
    expect(h.start).toBe(0)
  })
})

describe('annotations.for', () => {
  let store: Record<string, string>
  beforeEach(() => {
    store = {}
    ;(globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
      },
      dispatchEvent: () => true,
    }
    ;(globalThis as any).CustomEvent = class { constructor(public type: string) {} }
  })
  afterEach(() => {
    delete (globalThis as any).window
  })

  const save = (highlights: Highlight[], notes: any[] = []) => {
    store['lc-annotations-v1'] = JSON.stringify({ highlights, notes })
  }

  it('keys by parte when the article has one, whatever its slug is now', () => {
    save([hl({ id: 'a', slug: 'art-16', parte: 9185307 }), hl({ id: 'b', slug: 'art-16-b', parte: 8940647 })])
    expect(annotations.for(1014974, 'art-16-b', 9185307).highlights.map(h => h.id)).toEqual(['a'])
  })

  it('offers slug-only entries as legacy candidates to series members', () => {
    save([hl({ id: 'old', slug: 'art-16' })])
    const r = annotations.for(1014974, 'art-16-b', 9185307)
    expect(r.highlights).toEqual([])
    expect(r.legacyHighlights.map(h => h.id)).toEqual(['old'])
  })

  it('legacy notes follow only an exact slug', () => {
    save([], [{ id: 'n', idNorma: 1014974, slug: 'art-16', anchor: 0, body: 'x', createdAt: 0, updatedAt: 0 }])
    expect(annotations.for(1014974, 'art-16', 8940647).notes.map(n => n.id)).toEqual(['n'])
    expect(annotations.for(1014974, 'art-16-b', 9185307).notes).toEqual([])
  })

  it('without parte, matches by slug as before', () => {
    save([hl({ id: 'a', slug: 'art-16' }), hl({ id: 'b', slug: 'art-17' })])
    const r = annotations.for(1014974, 'art-16')
    expect(r.highlights.map(h => h.id)).toEqual(['a'])
    expect(r.legacyHighlights).toEqual([])
  })

  it('stores parte on new highlights', () => {
    annotations.addHighlight({
      idNorma: 1014974, slug: 'art-16-b', parte: 9185307, start: 0, end: 5, color: 'yellow', text: 'acoso',
    })
    expect(JSON.parse(store['lc-annotations-v1']).highlights[0].parte).toBe(9185307)
  })
})
