import { describe, it, expect } from 'vitest'
import { isNumberingAviso, sortAvisos } from './avisos'

describe('isNumberingAviso', () => {
  it('catches the notes that make article citations unsafe', () => {
    // Real values from the corpus.
    expect(isNumberingAviso('LA NUMERACION DE LOS ARTICULOS DEL TEXTO PUBLICADO REPITE EL Nº 2')).toBe(true)
    expect(isNumberingAviso('La numeración de los artículos de la presente norma no es correlativa, falta el N° 43.')).toBe(true)
  })

  it('rejects the document-type noise that is 99.7% of the field', () => {
    // 8,533 "EXTRACTO" + 400 "PF" + promulgation notes, measured.
    for (const noise of [
      'EXTRACTO', 'extracto', 'EXTRACTO.', 'PF',
      'NORMA SIN PROMULGACIÓN', 'SIN FECHA DE PROMULGACION',
      'EXTRACTO; NORMA SIN PROMULGACIÓN',
    ]) {
      expect(isNumberingAviso(noise)).toBe(false)
    }
  })

  it('does not fire on a bare mention of an artículo', () => {
    // Would otherwise drag vigencia and cross-reference notes into the warning
    // tier and re-create the noise problem.
    expect(isNumberingAviso(
      'LO DISPUESTO EN EL ARTICULO UNICO TIENE VIGENCIA ESPECIAL DE TRES AÑOS DESDE SU PUBLICACION',
    )).toBe(false)
    expect(isNumberingAviso('LA PROMULGACION DE ESTA ORDENANZA SE ENCUENTRA EN EL ARTICULO 13')).toBe(false)
  })
})

describe('sortAvisos', () => {
  it('splits the two tiers', () => {
    const { numbering, notes } = sortAvisos([
      'EXTRACTO',
      'LA NUMERACION DE LOS ARTICULOS DEL TEXTO PUBLICADO REPITE EL Nº 2',
      'NORMA SIN PROMULGACIÓN',
    ])
    expect(numbering).toEqual(['LA NUMERACION DE LOS ARTICULOS DEL TEXTO PUBLICADO REPITE EL Nº 2'])
    expect(notes).toEqual(['EXTRACTO', 'NORMA SIN PROMULGACIÓN'])
  })

  it('drops blanks and trims', () => {
    expect(sortAvisos(['  ', '', '  EXTRACTO  '])).toEqual({ numbering: [], notes: ['EXTRACTO'] })
  })

  it('is empty for the ~45% of normas with no observaciones', () => {
    expect(sortAvisos([])).toEqual({ numbering: [], notes: [] })
  })
})
