import { describe, it, expect } from 'vitest'
import { buildLawCardProps } from './card'
import type { Norma } from '../norma'

const LEY: Norma = {
  idNorma: 1200096, tipo: 'ley', numero: '21643', titulo: 'LEY KARIN',
  organismo: 'MINTRAB', derogado: false, fechaPublicacion: '2024-01-15',
  lawDir: 'modificaciones/21643',
}

describe('buildLawCardProps', () => {
  it('maps a norma into display-ready card fields', () => {
    const props = buildLawCardProps({
      norma: LEY, versions: 3, versionDates: ['2019-01-01', '2021-06-01', '2024-01-15'],
    })
    expect(props).toEqual({
      tipoLabel: 'Ley',
      numeroLabel: '21.643',
      titulo: 'LEY KARIN',
      organismo: 'MINTRAB',
      fechaPublicacion: '15 de enero de 2024',
      derogado: false,
      versions: 3,
      articles: undefined,
      versionDates: ['2019-01-01', '2021-06-01', '2024-01-15'],
    })
  })

  it('renders derogado status and omits missing organismo/fecha', () => {
    const derogada: Norma = { ...LEY, organismo: '', fechaPublicacion: null, derogado: true }
    const props = buildLawCardProps({
      norma: derogada, versions: 1, versionDates: ['2024-01-15'], articles: 12,
    })
    expect(props.organismo).toBe('')
    expect(props.fechaPublicacion).toBe('')
    expect(props.derogado).toBe(true)
    expect(props.articles).toBe(12)
  })

  it('caps versionDates to the 5 most recent, keeping order', () => {
    const dates = ['2014-01-09', '2016-06-02', '2018-11-14', '2020-05-03', '2022-08-27', '2024-12-13']
    const props = buildLawCardProps({ norma: LEY, versions: dates.length, versionDates: dates })
    expect(props.versionDates).toEqual(['2016-06-02', '2018-11-14', '2020-05-03', '2022-08-27', '2024-12-13'])
  })
})
