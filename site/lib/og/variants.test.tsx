import { describe, it, expect } from 'vitest'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { loadOgFonts } from './fonts'
import { renderLawCardEditorial, renderLawCardStamp, renderLawCardSplit } from './variants'
import type { LawCardProps } from './card'

const SAMPLE: LawCardProps = {
  kicker: 'LEY',
  tipoLabel: 'Ley',
  numeroLabel: '21.719',
  titulo: 'Sobre protección y tratamiento de los datos personales',
  organismo: 'Ministerio Secretaría General de la Presidencia',
  fechaPublicacion: '13 de diciembre de 2024',
  derogado: false,
  versions: 1,
  articles: 44,
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

async function renderToPng(el: ReturnType<typeof renderLawCardEditorial>): Promise<Buffer> {
  const fonts = await loadOgFonts()
  const svg = await satori(el, { width: 1200, height: 630, fonts })
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}

describe('law card variants', () => {
  it.each([
    ['editorial', renderLawCardEditorial],
    ['stamp', renderLawCardStamp],
    ['split', renderLawCardSplit],
  ] as const)('%s renders to a valid PNG', async (_name, render) => {
    const png = await renderToPng(render(SAMPLE))
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC)
    expect(png.length).toBeGreaterThan(1000)
  })
})
