import { describe, it, expect } from 'vitest'
import { align, joinDiffText, wordDiff, type Segment } from './diff'

const seg = (label: string, body: string): Segment => ({
  label, slug: label.replace(/\s+/g, '-'), rawHeading: label, body,
})

describe('align', () => {
  it('classifies unchanged / modified / added / removed', () => {
    const prev = [seg('articulo 1', 'A'), seg('articulo 2', 'B'), seg('articulo 3', 'C')]
    const curr = [seg('articulo 1', 'A'), seg('articulo 2', 'B2'), seg('articulo 4', 'D')]
    const r = align(prev, curr)
    expect(r.map((a) => a.status)).toEqual(['unchanged', 'modified', 'added', 'removed'])
    expect(r[3].prev?.label).toBe('articulo 3') // removed segment carried through
  })

  it('matches the k-th duplicate label in prev to the k-th in curr', () => {
    // The ley 19.300 bug: a body with a permanent "Artículo 2" AND a transitory
    // "Artículo 2". A Map keyed by label collapses them (last wins), so the
    // permanent article gets diffed against the unrelated transitory one and
    // both show as fully rewritten. Positional matching keeps them apart.
    const prev = [
      seg('articulo 1', 'permanente-1'),
      seg('articulo 2', 'permanente-2'),
      seg('articulo 1', 'transitorio-1'),
      seg('articulo 2', 'transitorio-2'),
    ]
    const curr = [
      seg('articulo 1', 'permanente-1'),          // unchanged
      seg('articulo 2', 'permanente-2-REFORMADO'), // the one real edit
      seg('articulo 1', 'transitorio-1'),          // unchanged
      seg('articulo 2', 'transitorio-2'),          // unchanged
    ]
    const r = align(prev, curr)
    expect(r.map((a) => a.status)).toEqual(['unchanged', 'modified', 'unchanged', 'unchanged'])
    // The modified one must be the PERMANENT article 2, paired with its own prev.
    expect(r[1].prev?.body).toBe('permanente-2')
    expect(r[1].curr?.body).toBe('permanente-2-REFORMADO')
  })

  it('treats an extra duplicate in curr as added, a missing one as removed', () => {
    const prev = [seg('articulo 1', 'x'), seg('articulo 1', 'y')]
    const curr = [seg('articulo 1', 'x'), seg('articulo 1', 'y'), seg('articulo 1', 'z')]
    expect(align(prev, curr).map((a) => a.status)).toEqual(['unchanged', 'unchanged', 'added'])
    expect(align(curr, prev).map((a) => a.status)).toEqual(['unchanged', 'unchanged', 'removed'])
  })
})

describe('wordDiff', () => {
  /** Every edit, rendered the way the MCP and the redline view render it. */
  const ops = (a: string, b: string) =>
    wordDiff(a, b).filter((o) => o.op !== 'equal').map((o) => `${o.op}:${joinDiffText(o.text)}`)


  it('never slices a word apart', () => {
    // The bug: cleanup ran after diff_charsToLines_, so common-prefix factoring
    // worked on characters. "suministre" → "ministre" came back as delete "su",
    // and "sus grados" → "su grado" as [-] "s grados" / [+] " grado".
    expect(ops('El que suministre a menores', 'El que ministre a menores'))
      .toEqual(['delete:suministre', 'insert:ministre'])
    expect(ops('presidio menor en sus grados medio a máximo', 'presidio menor en su grado medio a máximo'))
      .toEqual(['delete:sus grados', 'insert:su grado'])
  })

  it('keeps accents attached to their word', () => {
    // "años" → "anos" used to surface as [-] "ños s" / [+] "nos " — a fragment
    // that carries part of the next word and cannot be quoted.
    expect(ops('dieciocho años sin el', 'dieciocho anos in el'))
      .toEqual(['delete:años sin', 'insert:anos in'])
  })

  it('renders a pure deletion as whole words', () => {
    expect(ops('de cuarenta y cinco horas semanales', 'de cuarenta horas semanales'))
      .toEqual(['delete:y cinco '])
  })

  it('reports no edits for identical text', () => {
    expect(ops('Artículo 22. Derogado.', 'Artículo 22. Derogado.')).toEqual([])
  })

  it('handles a full substitution, which is what a derogación looks like', () => {
    const before = 'Será circunstancia atenuante de responsabilidad penal la cooperación eficaz.'
    expect(ops(before, 'Derogado.')).toEqual([`delete:${before}`, 'insert:Derogado.'])
  })

  it('every rendered edit is quotable — it appears verbatim in one of the inputs', () => {
    // The property C4 gold labels depend on: a "what changed" string has to be
    // findable in the text it came from.
    const a = 'El que suministre a menores de dieciocho años sin el consentimiento del padre será sancionado con presidio menor en sus grados medio a máximo'
    const b = 'El que ministre a menores de dieciocho anos in el consentimiento del padre será sancionado con presidio menor en su grado medio a máximo'
    for (const o of wordDiff(a, b)) {
      if (o.op === 'equal') continue
      const haystack = o.op === 'delete' ? a : b
      expect(haystack).toContain(joinDiffText(o.text))
    }
  })
})
