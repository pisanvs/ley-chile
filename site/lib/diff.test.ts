import { describe, it, expect } from 'vitest'
import { align, type Segment } from './diff'

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
