import { describe, it, expect } from 'vitest'
import { segment, align, wordDiff, normalizeLabel, joinDiffText, paragraphDiff, splitParagraphs } from './diff'

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

  it('detects markdown-heading article form (post render_texto.py)', () => {
    const text = [
      '## Título I — De los principios',
      '',
      '#### Artículo 1°',
      '',
      'Cuerpo del artículo uno con **énfasis**.',
      '',
      '#### Artículo 2° bis',
      '',
      'Cuerpo del dos bis.',
      '',
      '> **Nota.** Una nota al pie.',
    ].join('\n')
    const segs = segment(text)
    // preamble (with Título), then two articles
    expect(segs.length).toBe(3)
    expect(segs[0].label).toBe('__preamble__')
    expect(segs[0].body).toContain('## Título I')
    expect(segs[1].rawHeading).toBe('Artículo 1°')
    expect(segs[1].slug).toBe('art-1')
    expect(segs[1].body).toContain('**énfasis**')
    expect(segs[2].rawHeading).toBe('Artículo 2° bis')
    expect(segs[2].slug).toBe('art-2-bis')
    expect(segs[2].body).toContain('Nota')
  })

  it('does not split on the plural "Artículos transitorios" header', () => {
    const text = [
      '#### Artículo 1°',
      'Texto del 1°.',
      '',
      '## Artículos transitorios',
      '',
      '#### Artículo único',
      'Texto transitorio.',
    ].join('\n')
    const segs = segment(text)
    // Two real articles; the "Artículos transitorios" line should ride along
    // inside Artículo 1°'s tail, not become its own segment.
    expect(segs.map(s => s.rawHeading)).toEqual(['Artículo 1°', 'Artículo único'])
    expect(segs[0].body).toContain('## Artículos transitorios')
  })

  it('parses markdown "único" identifier without the ordinal mark', () => {
    const segs = segment('#### Artículo único\nCuerpo.')
    expect(segs).toHaveLength(1)
    expect(segs[0].label).toBe('articulo unico')
    expect(segs[0].slug).toBe('art-unico')
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

describe('paragraphDiff', () => {
  it('splits paragraphs by blank lines', () => {
    expect(splitParagraphs('a\n\nb\n\nc')).toEqual(['a', 'b', 'c'])
    expect(splitParagraphs('a\n\n\nb')).toEqual(['a', 'b'])
    expect(splitParagraphs('\n\n')).toEqual([])
  })
  it('marks identical bodies as all unchanged', () => {
    const out = paragraphDiff('p1\n\np2', 'p1\n\np2')
    expect(out.every(p => p.status === 'unchanged')).toBe(true)
    expect(out).toHaveLength(2)
  })
  it('detects an inserted paragraph between two unchanged ones', () => {
    const out = paragraphDiff('a\n\nc', 'a\n\nb\n\nc')
    expect(out.map(p => p.status)).toEqual(['unchanged', 'added', 'unchanged'])
    expect(out[1].curr).toBe('b')
  })
  it('detects a removed paragraph', () => {
    const out = paragraphDiff('a\n\nb\n\nc', 'a\n\nc')
    expect(out.map(p => p.status)).toEqual(['unchanged', 'removed', 'unchanged'])
    expect(out[1].prev).toBe('b')
  })
  it('treats an in-place rewrite as modified, not removed+added', () => {
    const out = paragraphDiff('a\n\nold body', 'a\n\nnew body')
    expect(out.map(p => p.status)).toEqual(['unchanged', 'modified'])
    expect(out[1].prev).toBe('old body')
    expect(out[1].curr).toBe('new body')
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
