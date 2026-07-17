import { describe, it, expect } from 'vitest'
import {
  fechaLarga, MIN_GUIA_ARTICLES, normaLabel, prettyNumero,
  qualifiesForCambios, qualifiesForGuia, tipoLabel,
} from './seo'
import type { Norma, Version } from './norma'

const LEY: Norma = {
  idNorma: 1200096, tipo: 'otras', numero: '21643', titulo: 'LEY KARIN',
  organismo: 'MINTRAB', derogado: false, fechaPublicacion: '2024-01-15',
  lawDir: 'modificaciones/21643',
}

function v(desde: string, hasta: string | null): Version {
  return { desde, hasta, commitSha: 'x', causaId: null, subject: '' }
}

describe('fechaLarga', () => {
  it('formats a date in Chilean Spanish', () => {
    expect(fechaLarga('2024-01-15')).toBe('15 de enero de 2024')
    expect(fechaLarga('2026-12-01')).toBe('1 de diciembre de 2026')
  })

  // The regression this guards: `new Date('2024-01-15')` parses as UTC midnight,
  // and rendering it in Chile (UTC-3/-4) yields Jan 14. Every publication date on
  // every guide would be one day early. fechaLarga parses the string by hand.
  it('does not shift the day in a negative-offset timezone', () => {
    const original = process.env.TZ
    process.env.TZ = 'America/Santiago'
    try {
      expect(fechaLarga('2024-01-15')).toBe('15 de enero de 2024')
      expect(fechaLarga('2024-08-01')).toBe('1 de agosto de 2024')
    } finally {
      process.env.TZ = original
    }
  })

  it('returns empty for missing or malformed input', () => {
    expect(fechaLarga(null)).toBe('')
    expect(fechaLarga('2024-01')).toBe('')
    expect(fechaLarga('')).toBe('')
  })
})

describe('prettyNumero', () => {
  it('dots law numbers the way Chileans write them', () => {
    expect(prettyNumero('21643')).toBe('21.643')
    expect(prettyNumero('19496')).toBe('19.496')
  })

  // Numeros are not all numeric: "S/N" (sin número), "3883 EXENTO". Formatting
  // those as numbers would produce NaN.
  it('leaves non-numeric numeros alone', () => {
    expect(prettyNumero('S/N')).toBe('S/N')
    expect(prettyNumero('3883 EXENTO')).toBe('3883 EXENTO')
    expect(prettyNumero('Bancos 2409')).toBe('Bancos 2409')
  })
})

describe('tipoLabel', () => {
  // BCN files ~700 real leyes under tipo 'otras' (ley 21.643 is /otras/21643).
  // Rendering "OTRAS 21.643" as a page title reads as a bug to a searcher.
  it('labels otras as Ley', () => {
    expect(tipoLabel('otras')).toBe('Ley')
    expect(tipoLabel('ley')).toBe('Ley')
    expect(tipoLabel('dfl')).toBe('DFL')
  })

  it('falls back to uppercase for unknown tipos', () => {
    expect(tipoLabel('bando')).toBe('BANDO')
  })
})

describe('normaLabel', () => {
  it('combines tipo label and dotted numero', () => {
    expect(normaLabel(LEY)).toBe('Ley 21.643')
  })
})

describe('qualifiesForGuia', () => {
  it('accepts a substantive norma of a guide tipo', () => {
    expect(qualifiesForGuia(LEY, { articles: MIN_GUIA_ARTICLES })).toBe(true)
  })

  it('rejects a stub below the article bar', () => {
    expect(qualifiesForGuia(LEY, { articles: MIN_GUIA_ARTICLES - 1 })).toBe(false)
  })

  // res/dto are ~298k of the ~333k corpus and are overwhelmingly one-liners.
  // A guide each would be 300k near-duplicate pages.
  it('rejects tipos outside the guide set regardless of size', () => {
    expect(qualifiesForGuia({ ...LEY, tipo: 'res' }, { articles: 500 })).toBe(false)
    expect(qualifiesForGuia({ ...LEY, tipo: 'dto' }, { articles: 500 })).toBe(false)
  })
})

describe('qualifiesForCambios', () => {
  it('needs both more than one version and a recorded modificacion', () => {
    expect(qualifiesForCambios([v('2024-01-15', '2025-01-02'), v('2025-01-03', null)], 2)).toBe(true)
  })

  it('rejects a single-version norma even with mods recorded', () => {
    // Real case: ley 21.719 has 2 modificacion edges but one version — the page
    // would have no change to describe.
    expect(qualifiesForCambios([v('2024-12-13', null)], 2)).toBe(false)
  })

  it('rejects a multi-version norma with no recorded modificacion', () => {
    expect(qualifiesForCambios([v('2024-01-15', '2025-01-02'), v('2025-01-03', null)], 0)).toBe(false)
  })
})
