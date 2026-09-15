import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

import { buildOutline, countNodes, type OutlineNode } from './outline'
import { segment } from './segment'

const CODIGO_PENAL = readFileSync(
  path.join(__dirname, '__fixtures__', 'outline', 'codigo-penal-excerpt.md'),
  'utf8',
)

/** Depth-first flattening, for asserting on shape without deep literals. */
function flatten(nodes: OutlineNode[], depth = 0): string[] {
  return nodes.flatMap((n) => [`${'  '.repeat(depth)}${n.text}`, ...flatten(n.children, depth + 1)])
}

describe('buildOutline', () => {
  it('nests headings by level', () => {
    const tree = buildOutline(
      ['# Libro Primero', '## Título I', '#### Artículo 1', 'cuerpo', '## Título II', '#### Artículo 2'].join('\n'),
    )
    expect(flatten(tree)).toEqual([
      'Libro Primero',
      '  Título I',
      '    Artículo 1',
      '  Título II',
      '    Artículo 2',
    ])
  })

  it('reads the real hierarchy of the Código Penal', () => {
    const tree = buildOutline(CODIGO_PENAL)
    expect(tree.map((n) => n.text)).toEqual(['Libro Primero'])
    const titulo = tree[0].children[0]
    expect(titulo.text).toBe('Título Primero')
    expect(titulo.children.map((n) => n.text)).toEqual([
      'I. De los delitos',
      'II. De las circunstancias que eximen de responsabilidad criminal',
    ])
    expect(titulo.children[0].children.map((n) => n.text)).toContain('Artículo 7')
  })

  it('skips a missing level rather than losing the heading', () => {
    // `# Libro` straight to `#### Artículo` with no Título between.
    const tree = buildOutline('# Libro Primero\n#### Artículo 1\ncuerpo')
    expect(flatten(tree)).toEqual(['Libro Primero', '  Artículo 1'])
  })

  it('treats a document with no headings as an empty outline', () => {
    expect(buildOutline('Texto corrido sin encabezados.')).toEqual([])
  })
})

describe('outline anchors match what the reader renders', () => {
  // An outline entry that scrolls nowhere is worse than no entry, so the
  // anchors are checked against the slugs segment() produces — the same value
  // ArticleSegment renders as id="art-{slug}".
  it('every article anchor exists as a segment slug', () => {
    const slugs = new Set(segment(CODIGO_PENAL).map((s) => `art-${s.slug}`))
    const articles: OutlineNode[] = []
    const walk = (ns: OutlineNode[]) =>
      ns.forEach((n) => {
        if (n.isArticle) articles.push(n)
        walk(n.children)
      })
    walk(buildOutline(CODIGO_PENAL))

    expect(articles.length).toBeGreaterThan(5)
    for (const a of articles) expect(slugs).toContain(a.anchor)
  })

  it('a structural heading inherits the first article beneath it', () => {
    const tree = buildOutline('## Título I\n### Párrafo 1\n#### Artículo 9\ncuerpo')
    // Doubled prefix on purpose: labelToSlug already renders "articulo 9" as
    // "art-9", and ArticleSegment renders id={`art-${slug}`}. The DOM id really
    // is "art-art-9", so the outline has to emit that and not the tidier form.
    expect(tree[0].anchor).toBe('art-art-9')
    expect(tree[0].children[0].anchor).toBe('art-art-9')
    expect(tree[0].isArticle).toBe(false)
  })

  it('leaves an anchor null when nothing beneath it is an article', () => {
    const tree = buildOutline('## Anexo\n### Tabla de valores\ncontenido')
    expect(tree[0].anchor).toBeNull()
  })
})

describe('countNodes', () => {
  it('counts the whole tree, not just the roots', () => {
    expect(countNodes(buildOutline('# A\n## B\n## C\n#### Artículo 1'))).toBe(4)
    expect(countNodes([])).toBe(0)
  })
})
