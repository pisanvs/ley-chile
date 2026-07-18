import { describe, it, expect } from 'vitest'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { loadOgFonts } from './fonts'
import { renderLawCard } from './render'
import type { LawCardProps } from './card'

const SAMPLE: LawCardProps = {
  tipoLabel: 'Ley',
  numeroLabel: '20.720',
  titulo: 'Sustituye el régimen concursal vigente por una ley de reorganización y liquidación de empresas y personas',
  organismo: 'Ministerio de Economía, Fomento y Turismo',
  fechaPublicacion: '9 de enero de 2014',
  derogado: false,
  versions: 6,
  articles: 402,
  versionDates: ['2016-06-02', '2018-11-14', '2020-05-03', '2022-08-27', '2024-12-13'],
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

describe('renderLawCard', () => {
  it('renders to a valid PNG', async () => {
    const fonts = await loadOgFonts()
    const svg = await satori(renderLawCard(SAMPLE), { width: 1200, height: 630, fonts })
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC)
    expect(png.length).toBeGreaterThan(1000)
  })

  it('renders with a single version and no articles (no crash on empty/undefined fields)', async () => {
    const single: LawCardProps = {
      ...SAMPLE, versions: 1, articles: undefined, versionDates: ['2024-12-13'], organismo: '',
    }
    const fonts = await loadOgFonts()
    const svg = await satori(renderLawCard(single), { width: 1200, height: 630, fonts })
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC)
  })
})
