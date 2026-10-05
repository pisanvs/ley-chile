import { describe, it, expect } from 'vitest'
import { parseNumberQuery } from './search'

describe('parseNumberQuery', () => {
  it('treats a bare number as a law-number query', () => {
    // The reported bug: "20000" must be recognized as a number, not free text.
    expect(parseNumberQuery('20000')).toEqual({ tipo: undefined, numero: '20000' })
  })

  it('strips the thousands separators Chilean law numbers are written with', () => {
    expect(parseNumberQuery('20.000')).toEqual({ tipo: undefined, numero: '20000' })
    expect(parseNumberQuery('ley 3.500')).toEqual({ tipo: 'ley', numero: '3500' })
  })

  it('picks up an explicit tipo and the N° prefix', () => {
    expect(parseNumberQuery('ley 20000')).toEqual({ tipo: 'ley', numero: '20000' })
    expect(parseNumberQuery('dfl 4')).toEqual({ tipo: 'dfl', numero: '4' })
    expect(parseNumberQuery('LEY N° 19.300')).toEqual({ tipo: 'ley', numero: '19300' })
    expect(parseNumberQuery('ley Nº 21560')).toEqual({ tipo: 'ley', numero: '21560' })
  })

  it('maps spelled-out tipos to their slug', () => {
    expect(parseNumberQuery('decreto 100')).toEqual({ tipo: 'dto', numero: '100' })
    expect(parseNumberQuery('codigo 1')).toEqual({ tipo: 'cod', numero: '1' })
  })

  it('is null for anything that is not purely a citation', () => {
    // These must still go to full-text search.
    expect(parseNumberQuery('medio ambiente')).toBeNull()
    expect(parseNumberQuery('ley de bosques')).toBeNull()
    expect(parseNumberQuery('artículo 20000 del código')).toBeNull()
    expect(parseNumberQuery('20000 pesos')).toBeNull()
    expect(parseNumberQuery('')).toBeNull()
    expect(parseNumberQuery('12345678')).toBeNull() // 8 digits — no such numero
  })
})
import { normalizeQuery } from './search'

describe('normalizeQuery', () => {
  it('lowercases and folds accents so query_norm aggregates cleanly', () => {
    expect(normalizeQuery('  Arrendamiento CIVIL  ')).toBe('arrendamiento civil')
    expect(normalizeQuery('Código')).toBe('codigo')
  })
})
