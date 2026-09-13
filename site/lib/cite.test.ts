import { describe, it, expect } from 'vitest'

import {
  renderCite,
  normaName,
  prettyNumero,
  sentenceCase,
  titleCase,
  CITE_FORMATS,
  type CiteSource,
} from './cite'

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

describe('renderCite — Revista Chilena de Derecho', () => {
  // Asserted against UC's "Cómo citar según la Revista Chilena de Derecho",
  // which prints one worked example per norm kind. The guide sets everything in
  // versales; plain text cannot carry small caps, so ordinary capitals are used
  // and the rest — element order, punctuation, date format — is followed
  // exactly, including the ley entry's lack of a closing period.
  const ley20066: CiteSource = {
    tipo: 'ley', numero: '20066',
    titulo: 'ESTABLECE LEY DE VIOLENCIA INTRAFAMILIAR',
    denominacion: 'LEY DE VIOLENCIA INTRAFAMILIAR',
    fechaPublicacion: '2005-09-22', url: 'https://leyes.pisanvs.cl/ley/20066',
  }
  const constitucion: CiteSource = {
    tipo: 'cod', numero: 'POLITICA',
    titulo: 'CONSTITUCIÓN POLÍTICA DE LA REPÚBLICA',
    fechaPublicacion: '1980-08-11', url: 'https://leyes.pisanvs.cl/norma/242302',
  }

  it("matches the guide's ley entry", () => {
    // CHILE, Ley N° 20.066 (22/09/2005) Ley de violencia intrafamiliar
    expect(renderCite('rchd', ley20066)).toBe(
      'Chile, Ley N° 20.066 (22/09/2005) Ley de Violencia Intrafamiliar',
    )
  })

  it("matches the guide's ley footnote form", () => {
    // LEY N° 20.066 de 2005
    expect(renderCite('rchd-nota', ley20066)).toBe('Ley N° 20.066 de 2005')
  })

  it("matches the guide's Constitución entry", () => {
    // CHILE, Constitución Política de la República (11/08/1980).
    expect(renderCite('rchd', constitucion)).toBe(
      'Chile, Constitución Política de la República (11/08/1980).',
    )
  })

  it("matches the guide's Constitución footnote form", () => {
    // CONSTITUCIÓN POLÍTICA DE LA REPÚBLICA, Chile.
    expect(renderCite('rchd-nota', constitucion)).toBe(
      'Constitución Política de la República, Chile.',
    )
  })

  it('puts the date before the denominación, not after it', () => {
    // The ordering that distinguishes this style: the publication date sits
    // between the norma and its name, and the entry does not end in a period.
    const out = renderCite('rchd', ley20066)
    expect(out.indexOf('(22/09/2005)')).toBeLessThan(out.indexOf('Violencia'))
    expect(out.endsWith('.')).toBe(false)
  })

  it('falls back to the official título when there is no denominación legal', () => {
    // The guide says to include the denominación "si es que la tiene".
    expect(renderCite('rchd', { ...ley20066, denominacion: undefined })).toBe(
      'Chile, Ley N° 20.066 (22/09/2005) Establece ley de violencia intrafamiliar',
    )
  })

  it('omits the Diario Oficial and the URL, which the guide never prints', () => {
    for (const fmt of ['rchd', 'rchd-nota'] as const) {
      expect(renderCite(fmt, ley20066)).not.toContain('Diario Oficial')
      expect(renderCite(fmt, ley20066)).not.toContain('http')
    }
  })

  it('uses the degree sign, following the guide', () => {
    // Published articles can be found using "Nº" (masculine ordinal) instead.
    // The glyphs are near-identical and the difference survives a copy-paste,
    // so it is pinned rather than left to whichever source was read last.
    expect(renderCite('rchd', ley20066)).toContain('Ley N\u00B0 20.066')
    expect(renderCite('rchd', ley20066)).not.toContain('\u00BA')
  })

  it('carries the article when one is being cited', () => {
    expect(renderCite('rchd-nota', { ...ley20066, articulo: 'Artículo 5' })).toBe(
      'Ley N° 20.066, art. 5 de 2005',
    )
  })

  it('falls back cleanly when the publication date is unknown', () => {
    expect(renderCite('rchd', { ...ley20066, fechaPublicacion: null })).toBe(
      'Chile, Ley N° 20.066 Ley de Violencia Intrafamiliar',
    )
    expect(renderCite('rchd-nota', { ...ley20066, fechaPublicacion: null })).toBe(
      'Ley N° 20.066',
    )
  })
})

describe('sentenceCase / titleCase', () => {
  it('sentence-cases an all-caps título', () => {
    expect(sentenceCase('SOBRE PROTECCIÓN DE LA VIDA PRIVADA')).toBe(
      'Sobre protección de la vida privada',
    )
  })

  it('title-cases a name, leaving the minor words down', () => {
    expect(titleCase('CÓDIGO PENAL')).toBe('Código Penal')
    expect(titleCase('CONSTITUCIÓN POLÍTICA DE LA REPÚBLICA')).toBe(
      'Constitución Política de la República',
    )
  })

  it('capitalises a minor word when it leads', () => {
    expect(titleCase('DE LOS DELITOS')).toBe('De los Delitos')
  })

  it('cannot restore proper nouns, and does not pretend to', () => {
    // Documented loss: the corpus stores no case information to recover.
    expect(sentenceCase('RINDE HOMENAJE A DON LUIS RICARTE SOTO')).toBe(
      'Rinde homenaje a don luis ricarte soto',
    )
  })
})

describe('disambiguation — a number alone does not name a decreto', () => {
  // The corpus holds 227 normas called "DFL 1" and 525 called "DTO 1". The
  // /citar FAQ and the hub post both say a citation must therefore carry the
  // organismo; for a while the tool said so and then emitted "Decreto con
  // Fuerza de Ley N° 1" with no organismo anywhere in it.
  const dfl: CiteSource = {
    tipo: 'dfl', numero: '1', titulo: 'FIJA TEXTO REFUNDIDO DE LA LEY DE TRÁNSITO',
    organismo: 'MINISTERIO DE TRANSPORTES Y TELECOMUNICACIONES',
    fechaPublicacion: '2009-02-07', url: 'https://leyes.pisanvs.cl/norma/1007469',
  }

  it('names the organismo in every prose format', () => {
    for (const fmt of ['chile', 'apa', 'mla', 'chicago'] as const) {
      expect(renderCite(fmt, dfl)).toContain('Ministerio de Transportes y Telecomunicaciones')
    }
  })

  it('does not print a year for the decreto itself', () => {
    // "DFL 1, de 2007" is the year it was dictated; the corpus only has the
    // publication date, 2009. fechaPromulgacion is not loaded into Postgres,
    // so any year printed here would be wrong as often as right.
    expect(renderCite('chile', dfl)).not.toContain('de 2007')
    expect(renderCite('chile', dfl)).toBe(
      'Decreto con Fuerza de Ley N° 1, del Ministerio de Transportes y Telecomunicaciones, ' +
      'Diario Oficial, 7 de febrero de 2009.',
    )
  })

  it('leaves a ley alone, since its number is unique', () => {
    expect(renderCite('chile', LEY)).not.toContain('Ministerio')
  })

  it('degrades cleanly when the organismo is missing', () => {
    expect(renderCite('chile', { ...dfl, organismo: '' })).toBe(
      'Decreto con Fuerza de Ley N° 1, Diario Oficial, 7 de febrero de 2009.',
    )
  })

  it('does not duplicate the organismo in BibTeX and RIS', () => {
    // Both carry it in a field of their own (institution / PB).
    expect(renderCite('bibtex', dfl)).toContain('title        = {Decreto con Fuerza de Ley N° 1}')
    expect(renderCite('ris', dfl)).toContain('TI  - Decreto con Fuerza de Ley N° 1')
  })

  it('follows the guide for RChD, which does not disambiguate either', () => {
    // UC's guide gives no decreto example and no slot for an organismo; the
    // style leans on the denominación legal instead. Followed rather than
    // extended — an invented element is not the journal's format.
    expect(renderCite('rchd', dfl)).toBe(
      'Chile, Decreto con Fuerza de Ley N° 1 (07/02/2009) Fija texto refundido de la ley de tránsito',
    )
    // With the denominación the corpus actually holds for this DFL, the entry
    // identifies it the way the style intends.
    expect(renderCite('rchd', { ...dfl, denominacion: 'LEY DE TRÁNSITO' })).toBe(
      'Chile, Decreto con Fuerza de Ley N° 1 (07/02/2009) Ley de Tránsito',
    )
  })
})
