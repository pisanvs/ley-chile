import { describe, it, expect } from 'vitest'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

import { loadOgFonts } from './fonts'
import { renderCitarCard, SPECIMENS } from './citarCard'
import { CITE_FORMATS } from '../cite'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

/** Every string in an element tree, concatenated. */
function flatten(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join(' ')
  if (node && typeof node === 'object' && 'props' in node) {
    return flatten((node as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

describe('renderCitarCard', () => {
  it('renders to a valid PNG at OG dimensions', async () => {
    const fonts = await loadOgFonts()
    const svg = await satori(renderCitarCard(), { width: 1200, height: 630, fonts })
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC)
    expect(png.length).toBeGreaterThan(1000)
  })

  it('shows every format the tool offers', () => {
    // Asserted against the element tree, not the SVG: satori rasterises every
    // glyph to a <path>, so no rendered output contains searchable text.
    const text = flatten(renderCitarCard())
    for (const f of CITE_FORMATS) expect(text).toContain(f.label)
  })

  it('specimens are real renderCite output, not hand-written strings', () => {
    // If a renderer changes shape, these change with it — the point is that
    // nobody has to remember to retype the card.
    expect(SPECIMENS.map((s) => s.text)).toEqual([
      'Ley N° 21.719, art. 12, Diario Oficial, 26 de agosto de 2024.',
      'Ley N° 21.719, art. 12. (2024, 26 de agosto). ' +
        'Diario Oficial de la República de Chile. https://leyes.pisanvs.cl/ley/21719',
    ])
  })

  it('specimens do not embed the current date', () => {
    // BibTeX/RIS stamp an access date; these two must not, or the card would
    // differ between builds and break the immutable caching the CDN applies.
    const today = new Date().toISOString().slice(0, 10)
    for (const s of SPECIMENS) expect(s.text).not.toContain(today)
  })
})
