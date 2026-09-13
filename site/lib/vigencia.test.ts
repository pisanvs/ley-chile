import { describe, it, expect } from 'vitest'
import {
  addOffset, eventoWarning, extractNotas, gradualidadWarning, parseCondicionEvento,
  parseGradualidad, phaseAt, vigenciaWarnings,
} from './vigencia'

/** Verbatim from the corpus: the nota on article 22 of the Código del Trabajo
 *  (DFL 1, idNorma 207436), as get_article returns it today. */
const NOTA_21561 =
  'NOTA 1 La modificación introducida por la ley 21561, publicada el 26.04.2023, a la ' +
  'jornada de trabajo referida en el inciso primero del presente artículo, se implementará ' +
  'de forma gradual, reduciéndose de cuarenta y cinco horas semanales a cuarenta y cuatro ' +
  'horas al primer año; cuarenta y dos horas al tercer año y cuarenta horas al quinto año, ' +
  'contados desde la publicación de la ley en el Diario Oficial.'

/** The article body as the pipeline renders it — text first, nota blockquoted
 *  underneath, which is exactly why the schedule went unread. */
const ART_22_BODY = [
  'La duración de la jornada ordinaria de trabajo no excederá de cuarenta horas semanales',
  'y su distribución se podrá efectuar en cada semana calendario.',
  '',
  `> **Nota.** ${NOTA_21561}`,
].join('\n')

describe('addOffset', () => {
  it('adds whole years', () => {
    expect(addOffset('2023-04-26', 1, 'año')).toBe('2024-04-26')
    expect(addOffset('2023-04-26', 5, 'año')).toBe('2028-04-26')
  })

  it('clamps 29 February rather than rolling into March', () => {
    expect(addOffset('2024-02-29', 1, 'año')).toBe('2025-02-28')
  })

  it('adds months across a year boundary, clamping short months', () => {
    expect(addOffset('2023-11-15', 3, 'mes')).toBe('2024-02-15')
    expect(addOffset('2024-01-31', 1, 'mes')).toBe('2024-02-29')
    expect(addOffset('2023-01-31', 1, 'mes')).toBe('2023-02-28')
  })

  it('adds days across a month boundary', () => {
    expect(addOffset('2024-02-28', 2, 'día')).toBe('2024-03-01')
  })
})

describe('extractNotas', () => {
  it('finds the blockquoted nota the pipeline emits', () => {
    expect(extractNotas(ART_22_BODY)).toEqual([NOTA_21561])
  })

  it('returns nothing for a body with no nota', () => {
    expect(extractNotas('Artículo 22. Derogado.')).toEqual([])
  })

  it('finds several notas', () => {
    const body = `> **Nota.** uno\ntexto\n> **Nota.** dos`
    expect(extractNotas(body)).toEqual(['uno', 'dos'])
  })
})

describe('parseGradualidad — ley 21.561', () => {
  const g = parseGradualidad(NOTA_21561)!

  it('reads the anchor from the nota rather than assuming one', () => {
    expect(g.anchor).toBe('2023-04-26')
    expect(g.causaNumero).toBe('21561')
  })

  it('recovers the pre-reform rule', () => {
    expect(g.base).toBe('cuarenta y cinco horas semanales')
  })

  it('builds the calendar the law actually sets', () => {
    // 45 → 44 at year one, 42 at year three, 40 at year five, counted from
    // publication. The report's expected answer: "la gradualidad de la ley
    // 21.561 parte el 26-04-2024".
    expect(g.steps).toEqual([
      { desde: '2024-04-26', valor: 'cuarenta y cuatro horas', plazo: 'primer año' },
      { desde: '2026-04-26', valor: 'cuarenta y dos horas', plazo: 'tercer año' },
      { desde: '2028-04-26', valor: 'cuarenta horas', plazo: 'quinto año' },
    ])
  })

  it('quotes quantities instead of interpreting them', () => {
    // Converting "cuarenta y cuatro" to 44 would be a second place to be
    // silently wrong. Every value is text lifted from the schedule.
    for (const s of g.steps) expect(typeof s.valor).toBe('string')
    expect(g.steps.map((s) => s.valor).join(' ')).not.toMatch(/\d/)
  })
})

describe('phaseAt', () => {
  const g = parseGradualidad(NOTA_21561)!

  it('is the pre-reform rule before the first step — the bug, exactly', () => {
    // get_article ... fecha 2024-01-01 returned "no excederá de cuarenta horas
    // semanales". The binding limit that day was 45.
    const p = phaseAt(g, '2024-01-01')
    expect(p.kind).toBe('base')
    if (p.kind === 'base') {
      expect(p.valor).toBe('cuarenta y cinco horas semanales')
      expect(p.hasta).toBe('2024-04-26')
    }
  })

  it('is exact on the day a step begins', () => {
    expect(phaseAt(g, '2024-04-25').kind).toBe('base')
    const p = phaseAt(g, '2024-04-26')
    expect(p.kind).toBe('step')
    if (p.kind === 'step') expect(p.step.valor).toBe('cuarenta y cuatro horas')
  })

  it('walks the middle steps', () => {
    const p = phaseAt(g, '2027-01-01')
    expect(p.kind).toBe('step')
    if (p.kind === 'step') {
      expect(p.step.valor).toBe('cuarenta y dos horas')
      expect(p.hasta).toBe('2028-04-26')
    }
  })

  it('is complete once the last step lands', () => {
    expect(phaseAt(g, '2028-04-26').kind).toBe('complete')
    expect(phaseAt(g, '2035-01-01').kind).toBe('complete')
  })
})

describe('gradualidadWarning', () => {
  const g = parseGradualidad(NOTA_21561)!

  it('leads with the contradiction and names the rule that actually bound', () => {
    const w = gradualidadWarning(g, '2024-01-01')!
    expect(w).toContain('VIGENCIA GRADUAL')
    expect(w).toContain('cuarenta y cinco horas semanales')
    expect(w).toContain('ley 21561')
    expect(w).toContain('2024-04-26')
  })

  it('goes quiet once the schedule has run — a warning nobody needs teaches people to skip warnings', () => {
    expect(gradualidadWarning(g, '2028-04-26')).toBeNull()
    expect(gradualidadWarning(g, '2030-01-01')).toBeNull()
  })

  it('carries the nota verbatim so the reader can check the reading', () => {
    expect(gradualidadWarning(g, '2024-01-01')).toContain(NOTA_21561)
  })
})

describe('vigenciaWarnings', () => {
  it('warns on the real article body at a date inside the phase-in', () => {
    const w = vigenciaWarnings(ART_22_BODY, '2024-01-01')
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('cuarenta y cinco horas semanales')
  })

  it('is silent once the schedule completes', () => {
    expect(vigenciaWarnings(ART_22_BODY, '2029-01-01')).toEqual([])
  })

  it('is silent on an article with no schedule', () => {
    expect(vigenciaWarnings('Artículo 1. Texto cualquiera.', '2024-01-01')).toEqual([])
  })
})

describe('other schedule shapes', () => {
  it('reads a uniform vacatio legis stated as a plazo', () => {
    const g = parseGradualidad(
      'La ley 21561, publicada el 26.04.2023, comenzará a regir en el plazo de un año ' +
      'contado desde su publicación en el Diario Oficial.',
    )!
    expect(g.steps).toHaveLength(1)
    expect(g.steps[0].desde).toBe('2024-04-26')
    expect(phaseAt(g, '2023-12-31').kind).toBe('base')
    expect(phaseAt(g, '2024-04-26').kind).toBe('complete')
  })

  it('reads a numeric schedule', () => {
    // Ley 21.561 again, for article 152 quáter Y: 176 / 174 / 172 horas.
    const g = parseGradualidad(
      'La ley 21561, publicada el 26.04.2023, se implementará de forma gradual: se reducirá ' +
      'a 176 horas al primer año; 174 horas al tercer año y 172 horas al quinto año.',
    )!
    expect(g.steps.map((s) => `${s.desde}:${s.valor}`)).toEqual([
      '2024-04-26:176 horas', '2026-04-26:174 horas', '2028-04-26:172 horas',
    ])
  })

  it('reads "a los N meses"', () => {
    const g = parseGradualidad(
      'Lo dispuesto, según la ley 21000 publicada el 15 de enero de 2020, entrará en ' +
      'vigencia a los seis meses de su publicación.',
    )!
    expect(g.steps[0].desde).toBe('2020-07-15')
  })

  it('flags entry conditioned on an event rather than dating it', () => {
    const g = parseGradualidad(
      'La ley 21000, publicada el 15.01.2020, entrará en vigencia en forma gradual al ' +
      'primer año, y respecto del resto una vez que se dicte el reglamento correspondiente.',
    )!
    expect(g.condicionadaAEvento).toBe(true)
    expect(gradualidadWarning(g, '2020-06-01')).toContain('no se puede fechar')
  })

  it('refuses to invent a calendar when the nota carries no anchor date', () => {
    // Offsets counted from nothing. Substituting the norma's own publication
    // date here would fabricate a schedule that looks authoritative.
    expect(parseGradualidad(
      'Esta disposición se implementará de forma gradual, reduciéndose a cuarenta y cuatro ' +
      'horas al primer año.',
    )).toBeNull()
  })

  it('ignores a nota that is not about entry into force', () => {
    expect(parseGradualidad(
      'NOTA 2 El artículo 5 de la ley 20000, publicada el 16.02.2005, rectifica una ' +
      'referencia errónea del inciso tercero.',
    )).toBeNull()
  })

  it('does not pair a value from one clause with an offset from the next', () => {
    // The segmentation rule. Matching offsets across the whole nota lets
    // "publicada el 26.04.2023, a la jornada … al primer año" read as a step
    // whose value is the preamble — a schedule that is quietly wrong.
    const g = parseGradualidad(NOTA_21561)!
    for (const s of g.steps) {
      expect(s.valor).not.toContain('publicada')
      expect(s.valor).not.toContain('jornada de trabajo referida')
    }
  })
})

describe('parseCondicionEvento', () => {
  const NOTA_REGLAMENTO =
    'NOTA 1 Esta norma entrará en vigencia una vez que se dicte el reglamento correspondiente.'

  it('recognises an entry into force that no parser could date', () => {
    // Not a parse failure: nothing is missing from the nota. The correct
    // answer is "this cannot be dated", and it needs its own flag so it is
    // never counted against parser coverage.
    expect(parseGradualidad(NOTA_REGLAMENTO)).toBeNull()
    expect(parseCondicionEvento(NOTA_REGLAMENTO)).toEqual({ raw: NOTA_REGLAMENTO })
  })

  it('ignores a nota that is not about entry into force at all', () => {
    expect(parseCondicionEvento('NOTA 2 Rectifica una referencia del inciso tercero.')).toBeNull()
  })

  it('warns without claiming the text was or was not in force', () => {
    const w = eventoWarning(parseCondicionEvento(NOTA_REGLAMENTO)!, '2024-01-01')
    expect(w).toContain('VIGENCIA CONDICIONADA')
    expect(w).toContain('no de una fecha')
    expect(w).toContain('2024-01-01')
  })

  it('surfaces through vigenciaWarnings on a real body', () => {
    const body = `Texto cualquiera.\n\n> **Nota.** ${NOTA_REGLAMENTO}`
    expect(vigenciaWarnings(body, '2024-01-01')).toHaveLength(1)
    expect(vigenciaWarnings(body, '2024-01-01')[0]).toContain('VIGENCIA CONDICIONADA')
  })

  it('does not double-report a dated schedule that also names an event', () => {
    // gradualidadWarning already carries the event caveat; emitting the second
    // warning too would say the same thing twice.
    const body =
      'Texto.\n\n> **Nota.** La ley 21000, publicada el 15.01.2020, entrará en vigencia en ' +
      'forma gradual al primer año, y respecto del resto una vez que se dicte el reglamento.'
    const w = vigenciaWarnings(body, '2020-06-01')
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('VIGENCIA GRADUAL')
    expect(w[0]).toContain('no se puede fechar')
  })
})
