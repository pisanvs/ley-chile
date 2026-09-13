import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

import { segment } from './segment'
import {
  alignEffects,
  codPattern,
  isWholesaleRewrite,
  nameTokens,
  strictPattern,
} from './efectosAlign'
import type { Efecto } from './efectos'

/**
 * Every fixture here is a real modificatoria whose Efectos tab was reported
 * wrong, captured from production along with the effects the API returned for
 * it. Three distinct failures are pinned below; a fourth law is included
 * because it already worked and must keep working.
 */

const DIR = path.join(__dirname, '__fixtures__', 'efectos')

function fixture(id: string): { text: string; efectos: Efecto[] } {
  const text = readFileSync(path.join(DIR, `${id}.md`), 'utf8')
  const { efectos } = JSON.parse(readFileSync(path.join(DIR, `${id}.json`), 'utf8')) as {
    efectos: Efecto[]
  }
  return { text, efectos }
}

function run(id: string) {
  const { text, efectos } = fixture(id)
  const articles = segment(text)
  return { articles, ...alignEffects(articles, efectos) }
}

/** Which target laws a row claims, as "tipo numero". */
const targetsOf = (r: { efectos: Efecto[] }) =>
  r.efectos.map((e) => `${e.target.tipo} ${e.target.numero}`)

describe('alignEffects — no text is ever dropped', () => {
  // The reported failure: "law not shown completely in the left side".
  //
  // A modificatoria's quoted insertions carry their own `#### Artículo N`
  // heading, so segment() emits them as articles of the modifier. The panel
  // renders only rows that have effects, which silently discarded them.
  for (const id of ['1040829', '1192682', '1193517', '1193333']) {
    it(`${id}: every segment of the law gets a row`, () => {
      const { articles, rows } = run(id)
      expect(rows.map((r) => r.article)).toEqual(articles)
    })
  }

  it('1193517: the inserted artículo 7° transitorio is displayed, not dropped', () => {
    // Ley 21.579 ended at "Agrégase el siguiente artículo 7° transitorio,
    // nuevo:" — the article it inserts was nowhere on the page.
    const { rows } = run('1193517')
    const shown = rows.map((r) => r.article.body).join('\n')
    expect(shown).toContain('Prorrógase por dos años')
    expect(shown).toContain('licencias no profesionales clase B')
  })

  it('1192682: the inserted artículo 43 bis and the transitory articles survive', () => {
    const { rows } = run('1192682')
    const headings = rows.map((r) => r.article.rawHeading)
    expect(headings).toContain('Artículo 43 bis')
    expect(headings).toContain('Artículo primero')
    // The effect belongs to the article that does the amending, not to the
    // preamble, whose text is the law's own title: "MODIFICA LEY N° 19.300…".
    const withEfectos = rows.filter((r) => r.efectos.length > 0)
    expect(withEfectos).toHaveLength(1)
    expect(withEfectos[0].article.rawHeading).toBe('Artículo único')
    expect(targetsOf(withEfectos[0])).toEqual(['ley 19300'])
  })
})

describe('alignEffects — códigos are matched by name', () => {
  // The reported failure: "complete disconnection between cause and effect".
  //
  // A código's `numero` is a word, not a number ("PENAL"), so every numeric
  // rule is a no-op for it. Ley 20.587 opens "Introdúcense las siguientes
  // modificaciones en el Código Penal" and the whole Código Penal block still
  // landed in "Otras modificaciones".
  it('1040829: the Código Penal effect attaches to the article that names it', () => {
    const { rows, unmatched } = run('1040829')
    expect(unmatched.map((e) => e.target.numero)).not.toContain('PENAL')
    const row = rows.find((r) => targetsOf(r).includes('cod PENAL'))
    // Artículo 2º — "Introdúcense las siguientes modificaciones al Código
    // Penal". Artículo 1º amends DL 321 and says "para los penados", which the
    // cue requirement correctly declines to read as a Código Penal reference.
    expect(row?.article.rawHeading).toBe('Artículo 2º')
  })

  it('codPattern requires the cue, so "penal" alone is not a Código Penal reference', () => {
    const p = codPattern('PENAL')!
    expect(p.test('Introdúcense las siguientes modificaciones en el Código Penal:')).toBe(true)
    expect(p.test('modifícase el Código Penal')).toBe(true)
    expect(p.test('la legislación civil, penal, comercial y de procedimiento')).toBe(false)
    expect(p.test('el procedimiento penal vigente')).toBe(false)
  })

  it('codPattern handles multi-word names', () => {
    const p = codPattern('DEL TRABAJO')!
    expect(p.test('Modifícase el Código del Trabajo en el siguiente sentido:')).toBe(true)
    expect(p.test('el trabajo de los menores')).toBe(false)
  })

  it('strictPattern still refuses an incidental article number', () => {
    const p = strictPattern('dfl', '5')!
    expect(p.test('el decreto con fuerza de ley N° 5, de 1967')).toBe(true)
    expect(p.test('lo dispuesto en el artículo 5 de esta ley')).toBe(false)
  })
})

describe('nameTokens', () => {
  it('keeps the discriminating word of a código, which a 7-char floor dropped', () => {
    expect(nameTokens('CÓDIGO PENAL', [])).toEqual(['penal'])
    expect(nameTokens('CÓDIGO DE AGUAS', [])).toEqual(['aguas'])
  })

  it('drops words too generic to identify a law', () => {
    const toks = nameTokens('FIJA TEXTO REFUNDIDO, COORDINADO Y SISTEMATIZADO DE LA LEY GENERAL', [])
    expect(toks).toEqual([])
  })

  it('prefers common names, which is how codes are actually cited', () => {
    expect(nameTokens('FIJA TEXTO REFUNDIDO … DE LA LEY DE TRÁNSITO', ['LEY DE TRÁNSITO']))
      .toContain('transito')
  })
})

describe('isWholesaleRewrite — corpus artifacts are not legislative history', () => {
  // Decreto ley 3.346's earliest stored version (1980-05-22) carries the text
  // of the 2016 ministry rename, so diffing 2012 against it reports all 19
  // articles modified, backwards. Ley 20.587 amended that law in two places.
  it('1040829: the decreto ley 3.346 effect is flagged', () => {
    const { efectos } = fixture('1040829')
    const dl = efectos.find((e) => e.target.numero === '3346')!
    expect(dl.articles.length + dl.more).toBeGreaterThanOrEqual(dl.totalArticles)
    expect(isWholesaleRewrite(dl)).toBe(true)
  })

  it('does not flag a real amendment, however large the target', () => {
    const { efectos } = fixture('1040829')
    // 7 articles of the Código Penal's 579 — a substantial reform, still a
    // reform. Flagging this would hide exactly what the panel exists to show.
    expect(isWholesaleRewrite(efectos.find((e) => e.target.numero === 'PENAL')!)).toBe(false)
    for (const id of ['1192682', '1193517', '1193333']) {
      for (const e of fixture(id).efectos) expect(isWholesaleRewrite(e)).toBe(false)
    }
  })

  it('needs both a high ratio and enough articles', () => {
    const base = { target: {}, fecha: '2020-01-01', articles: [], more: 0 } as unknown as Efecto
    // A two-article law with both articles changed is a normal small amendment.
    expect(isWholesaleRewrite({ ...base, more: 2, totalArticles: 2 })).toBe(false)
    expect(isWholesaleRewrite({ ...base, more: 8, totalArticles: 9 })).toBe(true)
    expect(isWholesaleRewrite({ ...base, more: 8, totalArticles: 40 })).toBe(false)
  })
})

describe('alignEffects — the case that already worked keeps working', () => {
  it('1193333: the cooperativas effect stays on the artículo único', () => {
    const { rows, unmatched } = run('1193333')
    expect(unmatched).toEqual([])
    const withEfectos = rows.filter((r) => r.efectos.length > 0)
    expect(withEfectos).toHaveLength(1)
    expect(withEfectos[0].article.rawHeading).toBe('Artículo único')
    expect(targetsOf(withEfectos[0])).toEqual(['dfl 5'])
  })
})
