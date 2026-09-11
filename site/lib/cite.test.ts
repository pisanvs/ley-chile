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
  // Asserted against entries copied from the journal's own reference lists.
  const mk = (over: Partial<CiteSource>): CiteSource => ({
    tipo: 'ley', numero: '19628', titulo: 'SOBRE PROTECCIÓN DE LA VIDA PRIVADA',
    fechaPublicacion: '1999-08-28', url: 'https://leyes.pisanvs.cl/ley/19628', ...over,
  })

  it('renders a ley exactly as the journal prints it', () => {
    expect(renderCite('rchd', mk({}))).toBe(
      'Chile, Ley Nº 19.628. Sobre protección de la vida privada (28/08/1999).',
    )
  })

  it('renders a decreto', () => {
    expect(renderCite('rchd', mk({
      tipo: 'dto', numero: '201', fechaPublicacion: '2008-09-17',
      titulo: 'PROMULGA LA CONVENCIÓN DE LAS NACIONES UNIDAS SOBRE LOS DERECHOS DE LAS ' +
        'PERSONAS CON DISCAPACIDAD Y SU PROTOCOLO FACULTATIVO',
    }))).toBe(
      'Chile, Decreto Nº 201. Promulga la convención de las naciones unidas sobre los ' +
      'derechos de las personas con discapacidad y su protocolo facultativo (17/09/2008).',
    )
  })

  it('prints a named norma once, with no repeated title', () => {
    // "Chile, Constitución Política de la República (11/08/1980)." — the name
    // *is* the title, so there is no second clause and no period before it.
    expect(renderCite('rchd', mk({
      tipo: 'cod', numero: 'POLITICA', titulo: 'CONSTITUCIÓN POLÍTICA DE LA REPÚBLICA',
      fechaPublicacion: '1980-08-11',
    }))).toBe('Chile, Constitución Política de la República (11/08/1980).')
  })

  it('uses Nº, the ordinal mark, not the degree sign the rest of the site uses', () => {
    const out = renderCite('rchd', mk({}))
    expect(out).toContain('Ley Nº 19.628')
    expect(out).not.toContain('N°')
    // The two characters are visually near-identical; pin the codepoint.
    expect(out).toContain('Nº')
  })

  it('omits the Diario Oficial and the URL, which the journal does not print', () => {
    const out = renderCite('rchd', mk({}))
    expect(out).not.toContain('Diario Oficial')
    expect(out).not.toContain('http')
  })

  it('carries the article when one is being cited', () => {
    expect(renderCite('rchd', mk({ articulo: 'Artículo 3' }))).toBe(
      'Chile, Ley Nº 19.628, art. 3. Sobre protección de la vida privada (28/08/1999).',
    )
  })

  it('falls back cleanly when the publication date is unknown', () => {
    expect(renderCite('rchd', mk({ fechaPublicacion: null }))).toBe(
      'Chile, Ley Nº 19.628. Sobre protección de la vida privada.',
    )
  })

  it('leaves a title that is already mixed case alone', () => {
    // Recasing only applies to the all-caps titles the corpus stores; a title
    // that already distinguishes proper nouns must not be flattened.
    expect(renderCite('rchd', mk({ titulo: 'Sobre el Banco del Estado de Chile' }))).toContain(
      '. Sobre el Banco del Estado de Chile (',
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

  it('follows the journal for RChD, which does not disambiguate either', () => {
    // "Chile, Decreto Nº 873. Aprueba Convención Americana…" — the style puts
    // the burden on the title, and the examples carry no organismo.
    expect(renderCite('rchd', dfl)).toBe(
      'Chile, Decreto con Fuerza de Ley Nº 1. Fija texto refundido de la ley de tránsito (07/02/2009).',
    )
  })
})
