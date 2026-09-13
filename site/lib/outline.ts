import { labelToSlug, normalizeLabel } from './segment'

/**
 * The structural map of one law: its markdown headings as a tree.
 *
 * A long norma is not a list of articles, it is a hierarchy — Libro, Título,
 * Capítulo, Párrafo, then articles — and the Código Penal has 579 of the last
 * kind. A flat index of those is not a map of anything. This reads the headings
 * the pipeline already emits and nests them by level.
 */

export interface OutlineNode {
  /** Heading text as written. */
  text: string
  /** Markdown heading level, 1-6. */
  level: number
  /** Element id to scroll to, or null when nothing in the document carries one. */
  anchor: string | null
  /** True for `#### Artículo N`, the leaves the reader renders as segments. */
  isArticle: boolean
  children: OutlineNode[]
}

const HEADING_RE = /^(#{1,6})\s+(\S[^\n]*?)\s*$/gm

// Matches the article headings `segment()` recognises, so the anchor computed
// here is byte-identical to the `id="art-{slug}"` that ArticleSegment renders.
// Kept deliberately in step with lib/segment's MD_HEADING_RE: an outline entry
// that scrolls nowhere is worse than no entry.
const ARTICLE_RE = /^Art(?:[íi]culo|\.)\b\s+(\S.*)$/i

interface Flat {
  text: string
  level: number
  anchor: string | null
  isArticle: boolean
}

function parseFlat(text: string): Flat[] {
  const out: Flat[] = []
  for (const m of text.matchAll(HEADING_RE)) {
    const heading = m[2].trim()
    const art = ARTICLE_RE.exec(heading)
    out.push({
      text: heading,
      level: m[1].length,
      isArticle: !!art,
      anchor: art ? `art-${labelToSlug(normalizeLabel(`articulo ${art[1].trim()}`))}` : null,
    })
  }
  return out
}

/**
 * Build the heading tree.
 *
 * Structural headings (Título, Capítulo) are rendered by ReactMarkdown inside
 * an article's body and carry no id of their own, so they inherit the anchor of
 * the first article beneath them. Clicking "Título II" therefore lands on the
 * first article of Título II, which is where a reader wanted to go anyway, and
 * it needs no change to how the readers render.
 */
export function buildOutline(text: string): OutlineNode[] {
  const flat = parseFlat(text)
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const h of flat) {
    const node: OutlineNode = { ...h, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1].children.push(node)
    stack.push(node)
  }

  for (const r of roots) inheritAnchor(r)
  return roots
}

/** Give every anchorless node the first anchor found beneath it. */
function inheritAnchor(node: OutlineNode): string | null {
  for (const c of node.children) {
    const a = inheritAnchor(c)
    if (!node.anchor && a) node.anchor = a
  }
  return node.anchor
}

/** Total nodes in a tree — the sidebar uses it to decide whether to collapse. */
export function countNodes(nodes: OutlineNode[]): number {
  return nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0)
}
