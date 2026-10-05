import { describe, it, expect } from 'vitest'
import { findArticle, labelToSlug, normalizeLabel, segment } from './segment'

describe('normalizeLabel / labelToSlug', () => {
  it('keeps Ñ apart from N', () => {
    // Código del Trabajo has both "183 N" and "183 Ñ"
    expect(normalizeLabel('Artículo 183 Ñ')).toBe('articulo 183 ñ')
    expect(labelToSlug(normalizeLabel('Artículo 183 Ñ'))).toBe('art-183-nn')
    expect(labelToSlug(normalizeLabel('Artículo 183 N'))).toBe('art-183-n')
  })

  it('handles a decomposed Ñ the same way', () => {
    expect(normalizeLabel('Artículo 35 Ñ')).toBe('articulo 35 ñ')
  })

  it('still strips other diacritics and ordinal marks', () => {
    expect(labelToSlug(normalizeLabel('Artículo 18 quáter'))).toBe('art-18-quater')
    expect(labelToSlug(normalizeLabel('Artículo 1º transitorio'))).toBe('art-1-transitorio')
    expect(labelToSlug(normalizeLabel('Artículo Único'))).toBe('art-unico')
  })

  it('gives distinct slugs to a letter series', () => {
    const text = ['#### Artículo 16', 'a', '#### Artículo 16 A', 'b', '#### Artículo 16 B', 'c'].join('\n\n')
    expect(segment(text).map((s) => s.slug)).toEqual(['art-16', 'art-16-a', 'art-16-b'])
  })
})

describe('findArticle', () => {
  const arts = segment(
    ['#### Artículo 16', 'a', '#### Artículo 16 B', 'b', '#### Artículo 183 Ñ', 'c', '#### Artículo 5 (art. 2)', 'd'].join('\n\n'),
  )

  it.each([
    ['Artículo 16 B', 'art-16-b'],
    ['artículo 16 b', 'art-16-b'],
    ['Art. 16 B', 'art-16-b'],
    ['articulo 16 B', 'art-16-b'],
    ['16 B', 'art-16-b'],
    ['art-16-b', 'art-16-b'],
    ['Artículo 16', 'art-16'],
    ['Artículo 183 Ñ', 'art-183-nn'],
    ['Artículo 5 (art. 2)', 'art-5-art-2'],
  ])('%s → %s', (query, slug) => {
    expect(findArticle(arts, query)?.slug).toBe(slug)
  })

  it('returns undefined when nothing matches', () => {
    expect(findArticle(arts, 'Artículo 99')).toBeUndefined()
  })
})
