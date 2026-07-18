import { describe, it, expect } from 'vitest'
import { normaSlug } from './slug'
import { canonicalHref } from './href'

const n = (tipo: string, numero: string, titulo: string) => ({ tipo, numero, titulo })

describe('normaSlug', () => {
  it('leads with the citation so the URL reads as a legal reference', () => {
    expect(normaSlug(n('dfl', '4', 'FIJA EL TEXTO REFUNDIDO'))).toBe('dfl-4-fija-el-texto-refundido')
  })

  it('folds diacritics and ordinals rather than percent-encoding them', () => {
    expect(normaSlug(n('ley', '20330', 'MODIFICACIÓN Nº 3 — EDUCACIÓN'))).toBe(
      'ley-20330-modificacion-n-3-educacion',
    )
  })

  it('survives a numero that is not URL-safe', () => {
    // ~48% of the corpus: spaces, slashes, commas, "EXENTA".
    expect(normaSlug(n('dto', 'S/N', 'ACUERDO'))).toBe('dto-s-n-acuerdo')
    expect(normaSlug(n('res', '0076/2015 EXENTA', 'X'))).toBe('res-0076-2015-exenta-x')
    expect(normaSlug(n('res', '0,088', 'X'))).toBe('res-0-088-x')
  })

  it('clips long titles at a word boundary', () => {
    const long = normaSlug(n('dfl', '4',
      'FIJA PLANTA DE PERSONAL DEL MINISTERIO DEL MEDIO AMBIENTE Y DEL SERVICIO DE ' +
      'EVALUACION AMBIENTAL Y REGULA LAS DEMAS MATERIAS A QUE SE REFIERE EL ARTICULO'))
    expect(long.length).toBeLessThanOrEqual(72)
    expect(long.endsWith('-')).toBe(false)
    // no half-word at the tail
    expect(long).toBe('dfl-4-fija-planta-de-personal-del-ministerio-del-medio-ambiente-y-del')
  })

  it('always yields something addressable, even with nothing to work with', () => {
    expect(normaSlug(n('', '', ''))).toBe('norma')
    expect(normaSlug(n('', '', '···'))).toBe('norma')
  })

  it('is pure ASCII slug output, so canonicalHref needs no encoding', () => {
    const slug = normaSlug(n('dto', 'S/N 1,2', 'ÑOÑO ÁRBOL'))
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(encodeURIComponent(slug)).toBe(slug)
  })
})

describe('canonicalHref', () => {
  const partidos = {
    idNorma: 1107684, tipo: 'dfl', numero: '4',
    titulo: 'FIJA EL TEXTO REFUNDIDO, COORDINADO Y SISTEMATIZADO DE LA LEY Nº 18.603',
  }

  it('addresses by idNorma, never by the ambiguous key', () => {
    // The reported bug: this norma and the Ley General de Servicios Eléctricos
    // are both "DFL 4"; /dfl/4 served the latter.
    expect(canonicalHref(partidos)).toBe(
      '/norma/1107684/dfl-4-fija-el-texto-refundido-coordinado-y-sistematizado-de-la-ley-n-18',
    )
  })

  it('appends fecha and hash, and can be absolute', () => {
    expect(canonicalHref(partidos, '2017-09-06', 'art-1', 'https://x.cl')).toBe(
      'https://x.cl/norma/1107684/dfl-4-fija-el-texto-refundido-coordinado-y-sistematizado-de-la' +
      '-ley-n-18/2017-09-06#art-1',
    )
  })

  it('gives two same-key normas two different addresses', () => {
    const electricos = {
      idNorma: 258171, tipo: 'dfl', numero: '4',
      titulo: 'LEY GENERAL DE SERVICIOS ELECTRICOS',
    }
    expect(canonicalHref(partidos)).not.toBe(canonicalHref(electricos))
  })
})
