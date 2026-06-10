import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'

/** A segment of legislative text keyed by its article-heading label. */
export interface Segment {
  /** Normalized label for alignment ("articulo 5 transitorio", "considerando", etc.). */
  label: string
  /** URL-safe deterministic slug. Used as anchor for permalinks, scrolls, and
   *  localStorage keys for highlights/notes. Stable across versions. */
  slug: string
  /** Original heading text the way it appeared. */
  rawHeading: string
  /** Body of the segment (after the heading). */
  body: string
}

/** Build a URL-safe slug from a normalized label.
 *  "articulo 5 bis"           → "art-5-bis"
 *  "articulo unico"           → "art-unico"
 *  "articulo 5 transitorio"   → "art-5-transitorio"
 *  "__preamble__"             → "preambulo"
 *  "__doc__"                  → "doc"
 */
export function labelToSlug(label: string): string {
  if (label === '__preamble__') return 'preambulo'
  if (label === '__doc__') return 'doc'
  return label
    .replace(/^articulo\s+/, 'art-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const HEADING_RE = new RegExp(
  // Beginning-of-line or beginning-of-string, then "Artículo|Art." with the
  // identifier (digits, ordinal markers, or words like "único"/"transitorio").
  // We use a non-anchored regex with a sliding window because much of the
  // corpus is single-line with inline article markers.
  '(^|\\s)(Art[íi]culo|Art\\.)\\s+([0-9]+°?(?:\\s+(?:bis|ter|quater|qu[íi]nquies))?|[úu]nico|primero|segundo|tercero|cuarto|quinto|sexto|s[ée]ptimo|octavo|noveno|d[ée]cimo|transitorio|final)(?:\\s+transitori[ao])?\\.?-',
  'gi'
)

// Post-renderer markdown form: `#### Artículo 5° bis` on its own line. The
// `\b` after `Artículo` keeps us from matching `Artículos transitorios`
// (plural section header). The capture group is the identifier *and any
// suffix* up to end-of-line, normalized via `normalizeLabel()`.
const MD_HEADING_RE = /^(#{2,4})\s+Art(?:[íi]culo|\.)\b\s+(\S[^\n]*?)\s*$/gim

/** Normalize a label so different spellings of the same article match. */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/\bart\./g, 'articulo')
    .replace(/[°º]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Segment a flowing markdown document into article-keyed chunks.
 *
 * Two source formats coexist in the corpus:
 *   - Post-renderer markdown (`scripts/render_texto.py`): each article is
 *     introduced by a real markdown heading on its own line, e.g.
 *     `#### Artículo 5° bis`. Structural headings (`## Título I`,
 *     `## Capítulo II`, `### Párrafo 1`, etc.) sit between articles but are
 *     not themselves split points — they ride along inside the previous
 *     article's body or the preamble.
 *   - Legacy inline: `Artículo 5°.-` embedded in flowing prose. Used by
 *     older texto.md files that haven't been re-rendered yet.
 *
 * If neither format is present we yield a single `__doc__` segment so the
 * reader still has something to show.
 */
export function segment(text: string): Segment[] {
  const mdMatches = [...text.matchAll(MD_HEADING_RE)]
  if (mdMatches.length > 0) return segmentMarkdownHeadings(text, mdMatches)

  const inlineMatches = [...text.matchAll(HEADING_RE)]
  if (inlineMatches.length === 0) {
    return [{ label: '__doc__', slug: labelToSlug('__doc__'), rawHeading: '', body: text.trim() }]
  }
  return segmentInlineMarkers(text, inlineMatches)
}

function segmentMarkdownHeadings(text: string, matches: RegExpMatchArray[]): Segment[] {
  const segments: Segment[] = []

  const firstStart = matches[0].index ?? 0
  const preamble = text.slice(0, firstStart).trim()
  if (preamble) {
    segments.push({
      label: '__preamble__',
      slug: labelToSlug('__preamble__'),
      rawHeading: '',
      body: preamble,
    })
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const headingStart = m.index ?? 0
    const headingEnd = headingStart + m[0].length
    const segEnd = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length
    const identifier = (m[2] || '').trim()
    const rawHeading = `Artículo ${identifier}`
    const body = text.slice(headingEnd, segEnd).trim()
    const label = normalizeLabel(`articulo ${identifier}`)
    segments.push({ label, slug: labelToSlug(label), rawHeading, body })
  }
  return segments
}

function segmentInlineMarkers(text: string, matches: RegExpMatchArray[]): Segment[] {
  const segments: Segment[] = []

  const firstStart = matches[0].index ?? 0
  const preamble = text.slice(0, firstStart).trim()
  if (preamble) {
    segments.push({
      label: '__preamble__',
      slug: labelToSlug('__preamble__'),
      rawHeading: '',
      body: preamble,
    })
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const start = (m.index ?? 0) + (m[1]?.length ?? 0)
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length
    const chunk = text.slice(start, end)
    const headingMatchLen = m[0].length - (m[1]?.length ?? 0)
    const rawHeading = chunk.slice(0, headingMatchLen).trim()
    const body = chunk.slice(headingMatchLen).trim()
    const identifier = (m[3] || '').trim()
    const kind = (m[2] || 'Artículo').trim().toLowerCase().startsWith('art') ? 'articulo' : m[2]
    const label = normalizeLabel(`${kind} ${identifier}`)
    segments.push({ label, slug: labelToSlug(label), rawHeading, body })
  }
  return segments
}

/**
 * Align two segment lists by label. Returns triples (prev?, curr?, status).
 * Order follows the *current* version (so additions land in place); deletions
 * appear at the position of their nearest surviving neighbor.
 */
export interface Aligned {
  prev: Segment | null
  curr: Segment | null
  status: 'unchanged' | 'modified' | 'added' | 'removed'
}

export function align(prev: Segment[], curr: Segment[]): Aligned[] {
  const prevByLabel = new Map<string, Segment>()
  prev.forEach(s => prevByLabel.set(s.label, s))

  const result: Aligned[] = []
  const usedPrev = new Set<string>()

  for (const c of curr) {
    const p = prevByLabel.get(c.label)
    if (!p) {
      result.push({ prev: null, curr: c, status: 'added' })
    } else {
      usedPrev.add(c.label)
      const status: Aligned['status'] = p.body === c.body ? 'unchanged' : 'modified'
      result.push({ prev: p, curr: c, status })
    }
  }
  // Removed segments (in prev but not in curr) — append at the end so the
  // reader sees what disappeared, with order preserved.
  for (const p of prev) {
    if (!usedPrev.has(p.label)) {
      result.push({ prev: p, curr: null, status: 'removed' })
    }
  }
  return result
}

/** A semantic chunk in a rendered diff segment. */
export type DiffOp =
  | { op: 'equal'; text: string }
  | { op: 'insert'; text: string }
  | { op: 'delete'; text: string }

/** Word-level diff between two strings, using diff-match-patch's word-mode. */
export function wordDiff(prev: string, curr: string): DiffOp[] {
  const dmp = new DiffMatchPatch()
  // Convert to word-level diff: tokenize via line-mode trick where each "line" is one word.
  const a = wordsAsLines(prev)
  const b = wordsAsLines(curr)
  const tokens = dmp.diff_linesToChars_(a.text, b.text)
  const raw = dmp.diff_main(tokens.chars1, tokens.chars2, false)
  dmp.diff_charsToLines_(raw, tokens.lineArray)
  dmp.diff_cleanupSemantic(raw)
  return raw.map(([op, text]) => ({
    op: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  })) as DiffOp[]
}

function wordsAsLines(text: string): { text: string } {
  // Split by whitespace boundaries but keep separators so reassembly is faithful.
  // diff-match-patch's char-based line trick needs newline separators.
  const tokens = text.match(/(\s+|[^\s]+)/g) ?? []
  return { text: tokens.join('\n') }
}

/** Reassemble word-tokens back into rendered text by joining without adding spaces. */
export function joinDiffText(s: string): string {
  return s.replace(/\n/g, '')
}
