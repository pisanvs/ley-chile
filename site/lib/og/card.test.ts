import { describe, it, expect } from 'vitest'
import { buildLawCardProps } from './card'
import type { Norma } from '../norma'

const LEY: Norma = {
  idNorma: 1200096, tipo: 'otras', numero: '21643', titulo: 'LEY KARIN',
  organismo: 'MINTRAB', derogado: false, fechaPublicacion: '2024-01-15',
  lawDir: 'modificaciones/21643',
}

describe('buildLawCardProps', () => {
  it('maps a norma into display-ready card fields', () => {
    const props = buildLawCardProps({ norma: LEY, versions: 3, kicker: 'LEY' })
    expect(props).toEqual({
      kicker: 'LEY',
      tipoLabel: 'Ley',
      numeroLabel: '21.643',
      titulo: 'LEY KARIN',
      organismo: 'MINTRAB',
      fechaPublicacion: '15 de enero de 2024',
      derogado: false,
      versions: 3,
      articles: undefined,
    })
  })

  it('renders derogado status and omits missing organismo/fecha', () => {
    const derogada: Norma = { ...LEY, organismo: '', fechaPublicacion: null, derogado: true }
    const props = buildLawCardProps({ norma: derogada, versions: 1, kicker: 'GUÍA', articles: 12 })
    expect(props.organismo).toBe('')
    expect(props.fechaPublicacion).toBe('')
    expect(props.derogado).toBe(true)
    expect(props.articles).toBe(12)
  })
})
