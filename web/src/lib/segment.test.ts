import { describe, it, expect } from 'vitest'
import { normalizeLabel, labelToSlug, segment, canonicalText } from './segment'

describe('ordinal characters normalize identically', () => {
  it('U+00BA and U+00B0 produce the same slug', () => {
    // 'º' (masculine ordinal) decomposes to 'o' under NFKD; '°' (degree) does not.
    expect(labelToSlug(normalizeLabel('articulo 1º'))).toBe('art-1')
    expect(labelToSlug(normalizeLabel('articulo 1°'))).toBe('art-1')
    expect(labelToSlug(normalizeLabel('articulo 1'))).toBe('art-1')
  })
})

describe('segment', () => {
  it('splits markdown headings and keeps a preamble', () => {
    const text = 'Preámbulo aquí.\n\n#### Artículo 1º\nCuerpo uno.\n\n#### Artículo 2°\nCuerpo dos.'
    const segs = segment(text)
    expect(segs.map(s => s.slug)).toEqual(['preambulo', 'art-1', 'art-2'])
    expect(segs[1].rawHeading).toBe('Artículo 1º')
    expect(segs[1].body).toBe('Cuerpo uno.')
  })

  it('falls back to a single __doc__ segment when nothing matches', () => {
    const segs = segment('Texto sin artículos.')
    expect(segs).toHaveLength(1)
    expect(segs[0].slug).toBe('doc')
    expect(segs[0].body).toBe('Texto sin artículos.')
  })

  it('handles inline markers when no markdown headings exist', () => {
    const segs = segment('Artículo 1°.- Cuerpo uno. Artículo 2°.- Cuerpo dos.')
    expect(segs.map(s => s.slug)).toEqual(['art-1', 'art-2'])
  })
})

describe('canonicalText', () => {
  it('is whitespace-insensitive but order- and body-sensitive', () => {
    const a = segment('#### Artículo 1º\nCuerpo.\n\n')
    const b = segment('#### Artículo 1º\n\n   Cuerpo.   ')
    expect(canonicalText(a)).toBe(canonicalText(b))
    expect(canonicalText(a)).toBe('Artículo 1º\nCuerpo.')
  })
})
