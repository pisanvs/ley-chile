import { describe, it, expect } from 'vitest'

import { renderCite, normaName, prettyNumero, CITE_FORMATS, type CiteSource } from './cite'

const LEY: CiteSource = {
  tipo: 'ley',
  numero: '21719',
  titulo: 'REGULA LA PROTECCIÓN Y EL TRATAMIENTO DE LOS DATOS PERSONALES',
  organismo: 'MINISTERIO DE ECONOMÍA',
  fechaPublicacion: '2024-08-26',
  fecha: '2024-08-26',
  url: 'https://leyes.pisanvs.cl/norma/1205200/ley-21719/2024-08-26#art-12',
  articulo: 'Artículo 12',
}

const FIXED_TODAY = new Date('2026-09-10T12:00:00Z')

describe('prettyNumero', () => {
  it('adds the thousands separator Chilean law numbers are written with', () => {
    expect(prettyNumero('21719')).toBe('21.719')
    expect(prettyNumero('1')).toBe('1')
    // Not every numero is numeric — "S/N" covers 1,259 certificados alone.
    expect(prettyNumero('S/N')).toBe('S/N')
  })
})

describe('normaName', () => {
  it('renders the kind Chilean legal writing uses', () => {
    expect(normaName(LEY)).toBe('Ley N° 21.719')
    expect(normaName({ ...LEY, tipo: 'dfl', numero: '1' })).toBe('Decreto con Fuerza de Ley N° 1')
    expect(normaName({ ...LEY, tipo: 'dl', numero: '3500' })).toBe('Decreto Ley N° 3.500')
  })

  it('names códigos instead of numbering them', () => {
    // "Código N° 1" is not a thing anyone writes; the code has a name.
    expect(normaName({ ...LEY, tipo: 'cod', numero: '1', titulo: 'CÓDIGO PENAL' }))
      .toBe('CÓDIGO PENAL')
  })
})

describe('renderCite', () => {
  it('chile: norm, article, gazette, date — the unambiguous default', () => {
    expect(renderCite('chile', LEY, FIXED_TODAY))
      .toBe('Ley N° 21.719, art. 12, Diario Oficial, 26 de agosto de 2024.')
  })

  it('markdown: link text names the article AND the version date', () => {
    // A blogger's readers see the link text out of context, so it has to say
    // which text it points at — that is the whole pitch against leychile.cl.
    const md = renderCite('markdown', LEY, FIXED_TODAY)
    expect(md).toBe(
      '[Art. 12 de la Ley N° 21.719 (texto al 2024-08-26)]' +
      '(https://leyes.pisanvs.cl/norma/1205200/ley-21719/2024-08-26#art-12)',
    )
  })

  it('markdown: omits the version date when citing the current text', () => {
    const md = renderCite('markdown', { ...LEY, fecha: undefined }, FIXED_TODAY)
    expect(md).not.toContain('texto al')
    expect(md).toContain('](https://leyes.pisanvs.cl/')
  })

  it('apa: year and date, gazette, URL', () => {
    const s = renderCite('apa', LEY, FIXED_TODAY)
    expect(s).toContain('Ley N° 21.719, art. 12.')
    expect(s).toContain('(2024, 26 de agosto)')
    expect(s).toContain('Diario Oficial de la República de Chile')
    expect(s).toContain(LEY.url)
  })

  it('mla: quoted title, abbreviated month, bare host', () => {
    const s = renderCite('mla', LEY, FIXED_TODAY)
    expect(s).toContain('"Ley N° 21.719, art. 12."')
    expect(s).toContain('26 ago. 2024')
    // MLA drops the scheme.
    expect(s).toContain('leyes.pisanvs.cl/')
    expect(s).not.toContain('https://leyes')
  })

  it('bibtex: parses as one entry with a usable key and an access date', () => {
    const s = renderCite('bibtex', LEY, FIXED_TODAY)
    expect(s.startsWith('@legislation{ley21719,')).toBe(true)
    expect(s.trimEnd().endsWith('}')).toBe(true)
    expect(s).toContain('urldate      = {2026-09-10}')
    // Braces must balance or the entry breaks a whole .bib file.
    expect((s.match(/{/g) ?? []).length).toBe((s.match(/}/g) ?? []).length)
  })

  it('ris: correct statute type and a terminator, which importers require', () => {
    const s = renderCite('ris', LEY, FIXED_TODAY)
    expect(s.startsWith('TY  - STAT')).toBe(true)
    expect(s.trimEnd().endsWith('ER  -')).toBe(true)
    expect(s).toContain('DA  - 2024/08/26')
    // Every line must be a RIS tag; a stray line makes importers reject the file.
    for (const line of s.split('\n')) expect(line).toMatch(/^[A-Z][A-Z0-9]\s{2}- ?/)
  })

  it('url: exactly the URL, nothing decorating it', () => {
    expect(renderCite('url', LEY, FIXED_TODAY)).toBe(LEY.url)
  })

  it('cites the whole norma when no article is given', () => {
    const s = renderCite('chile', { ...LEY, articulo: undefined }, FIXED_TODAY)
    expect(s).toBe('Ley N° 21.719, Diario Oficial, 26 de agosto de 2024.')
    expect(s).not.toContain('art.')
  })

  it('degrades to "s. f." rather than inventing a date', () => {
    // 3,703 normas have no publication date. Fabricating one in a citation
    // would be worse than admitting it is unknown.
    const undated = { ...LEY, fechaPublicacion: null }
    expect(renderCite('apa', undated, FIXED_TODAY)).toContain('s. f.')
    expect(renderCite('mla', undated, FIXED_TODAY)).toContain('s. f.')
    expect(renderCite('chile', undated, FIXED_TODAY)).not.toContain('undefined')
  })

  it('never emits "undefined" or "null" in any format', () => {
    const sparse: CiteSource = {
      tipo: 'res', numero: 'S/N', titulo: '', url: 'https://x/y',
      fechaPublicacion: null,
    }
    for (const { id } of CITE_FORMATS) {
      const out = renderCite(id, sparse, FIXED_TODAY)
      expect(out, id).not.toMatch(/undefined|null|NaN/)
      expect(out.length, id).toBeGreaterThan(0)
    }
  })

  it('does not shift the date across a timezone boundary', () => {
    // lib/db.ts already guards this for DATE columns; the same trap applies to
    // any Date built from a bare YYYY-MM-DD in a positive-offset zone.
    expect(renderCite('chile', { ...LEY, fechaPublicacion: '2024-01-01' }, FIXED_TODAY))
      .toContain('1 de enero de 2024')
  })
})
