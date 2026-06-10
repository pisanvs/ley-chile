import { describe, it, expect } from 'vitest'
import { segment, align, wordDiff, normalizeLabel, joinDiffText } from './diff'

describe('normalizeLabel', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalizeLabel('Artículo Único')).toBe('articulo unico')
  })
  it('collapses art./Artículo and trims trailing degree marks', () => {
    expect(normalizeLabel('Art. 5°')).toBe('articulo 5')
    expect(normalizeLabel('Artículo 5')).toBe('articulo 5')
  })
})

describe('segment', () => {
  it('returns a single __doc__ block when no article heading exists', () => {
    const segs = segment('Plain prose without any article marker.')
    expect(segs).toHaveLength(1)
    expect(segs[0].label).toBe('__doc__')
  })
  it('detects "Artículo único.-" inline', () => {
    const text = 'Preamble. Artículo único.- The body of the article.'
    const segs = segment(text)
    expect(segs.length).toBeGreaterThanOrEqual(2)
    expect(segs[0].label).toBe('__preamble__')
    expect(segs.some(s => s.label.includes('unico'))).toBe(true)
  })
  it('detects multiple sequential articles', () => {
    const text = 'Artículo 1°.- foo bar. Artículo 2°.- baz qux.'
    const segs = segment(text)
    expect(segs.length).toBeGreaterThanOrEqual(2)
  })
})

describe('align', () => {
  it('marks identical bodies as unchanged', () => {
    const prev = [{ label: 'a', slug: 'a', rawHeading: '', body: 'same' }]
    const curr = [{ label: 'a', slug: 'a', rawHeading: '', body: 'same' }]
    const out = align(prev, curr)
    expect(out[0].status).toBe('unchanged')
  })
  it('marks differing bodies as modified', () => {
    const prev = [{ label: 'a', slug: 'a', rawHeading: '', body: 'old' }]
    const curr = [{ label: 'a', slug: 'a', rawHeading: '', body: 'new' }]
    const out = align(prev, curr)
    expect(out[0].status).toBe('modified')
  })
  it('marks segments missing in curr as removed', () => {
    const out = align(
      [{ label: 'gone', slug: 'gone', rawHeading: '', body: 'x' }],
      []
    )
    expect(out[0].status).toBe('removed')
  })
  it('marks new curr segments as added', () => {
    const out = align(
      [],
      [{ label: 'fresh', slug: 'fresh', rawHeading: '', body: 'y' }]
    )
    expect(out[0].status).toBe('added')
  })
})

describe('wordDiff', () => {
  it('returns equal op when texts are identical', () => {
    const ops = wordDiff('hello world', 'hello world')
    expect(ops.every(o => o.op === 'equal')).toBe(true)
  })
  it('identifies insertions', () => {
    const ops = wordDiff('hello world', 'hello new world')
    expect(ops.some(o => o.op === 'insert')).toBe(true)
  })
  it('identifies deletions', () => {
    const ops = wordDiff('hello cruel world', 'hello world')
    expect(ops.some(o => o.op === 'delete')).toBe(true)
  })
  it('reassembles equal text faithfully via joinDiffText', () => {
    const ops = wordDiff('foo bar baz', 'foo bar baz')
    const reconstructed = ops.map(o => joinDiffText(o.text)).join('')
    expect(reconstructed).toBe('foo bar baz')
  })
})
