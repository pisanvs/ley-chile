import { describe, expect, it } from 'vitest'
import { legacySlugFor, resolveHighlights, type Highlight } from './annotations'

const BODY_16B =
  'Se entenderá por acoso escolar toda acción u omisión constitutiva de agresión u hostigamiento reiterado.'
const BODY_16 =
  'Las infracciones a lo dispuesto en los artículos 11, 12, 13, 14 y 15 de esta ley serán sancionadas con multa.'

function hl(over: Partial<Highlight> = {}): Highlight {
  return {
    id: 'h1',
    idNorma: 1014974,
    slug: 'art-16',
    start: 0,
    end: 12,
    color: 'yellow',
    text: 'Se entenderá',
    createdAt: 0,
    ...over,
  }
}

describe('legacySlugFor', () => {
  it('maps a lettered slug to the slug its series used to share', () => {
    expect(legacySlugFor('art-16-b')).toBe('art-16')
    expect(legacySlugFor('art-35-ñ')).toBe('art-35')
  })

  it('leaves alone slugs that never collided', () => {
    expect(legacySlugFor('art-16')).toBeNull()
    expect(legacySlugFor('art-10-bis')).toBeNull()
    expect(legacySlugFor('art-5-transitorio')).toBeNull()
    expect(legacySlugFor('preambulo')).toBeNull()
  })
})

describe('resolveHighlights', () => {
  it('keeps a highlight whose text still sits at its offsets', () => {
    const h = hl({ start: 0, end: 12, text: 'Se entenderá' })
    expect(resolveHighlights({ body: BODY_16B, stored: [h] })).toEqual([h])
  })

  it('refreshes drifted offsets when the text occurs once', () => {
    const h = hl({ start: 50, end: 62, text: 'Se entenderá' })
    const [out] = resolveHighlights({ body: BODY_16B, stored: [h] })
    expect([out.start, out.end]).toEqual([0, 12])
    expect(BODY_16B.slice(out.start, out.end)).toBe('Se entenderá')
  })

  it('keeps an unlocatable highlight when the article has no lettered siblings', () => {
    const h = hl({ text: 'texto que no está en el cuerpo' })
    expect(resolveHighlights({ body: BODY_16, stored: [h] })).toEqual([h])
  })

  it('drops an unlocatable highlight when a lettered sibling exists', () => {
    // Made in 16 B, stored under "art-16": it must not be painted over
    // unrelated words in article 16.
    const h = hl({ text: 'acoso escolar toda acción' })
    expect(
      resolveHighlights({ body: BODY_16, stored: [h], hasLetteredSiblings: true }),
    ).toEqual([])
  })

  it('claims a legacy highlight whose text is in this body', () => {
    const legacy = hl({ text: 'acoso escolar toda acción', start: 0, end: 25 })
    const [out] = resolveHighlights({
      body: BODY_16B,
      stored: [],
      legacy: [legacy],
      slug: 'art-16-b',
    })
    expect(out.slug).toBe('art-16-b')
    expect(BODY_16B.slice(out.start, out.end)).toBe('acoso escolar toda acción')
  })

  it('does not claim a legacy highlight whose text appears twice', () => {
    const body = 'hostigamiento reiterado y luego hostigamiento reiterado otra vez'
    const legacy = hl({ text: 'hostigamiento reiterado' })
    expect(
      resolveHighlights({ body, stored: [], legacy: [legacy], slug: 'art-16-b' }),
    ).toEqual([])
  })

  it('does not claim a legacy highlight that is not in this body', () => {
    const legacy = hl({ text: 'acoso escolar toda acción' })
    expect(
      resolveHighlights({ body: BODY_16, stored: [], legacy: [legacy], slug: 'art-16-a' }),
    ).toEqual([])
  })

  it('ignores a text too short to locate anything', () => {
    const legacy = hl({ text: 'por' })
    expect(
      resolveHighlights({ body: BODY_16B, stored: [], legacy: [legacy], slug: 'art-16-b' }),
    ).toEqual([])
  })

  it('never mutates the stored highlights', () => {
    const h = hl({ start: 50, end: 62, text: 'Se entenderá' })
    const copia = { ...h }
    resolveHighlights({ body: BODY_16B, stored: [h] })
    expect(h).toEqual(copia)
  })
})
