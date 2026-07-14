/** A segment of legislative text keyed by its article-heading label. */
export interface Segment {
  label: string
  slug: string
  rawHeading: string
  body: string
}

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

/** Normalize a label so different spellings of the same article match.
 *
 *  Ordinal markers are stripped BEFORE NFKD. 'º' (U+00BA) has a compatibility
 *  decomposition to 'o', so stripping after NFKD would leave "articulo 1o"
 *  while "1°" yields "articulo 1" — one article, two slugs. See spec §6.3.
 */
export function normalizeLabel(s: string): string {
  return s
    .replace(/[°º]/g, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bart\./g, 'articulo')
    .replace(/\s+/g, ' ')
    .trim()
}

const HEADING_RE = new RegExp(
  '(^|\\s)(Art[íi]culo|Art\\.)\\s+([0-9]+[°º]?(?:\\s+(?:bis|ter|quater|qu[íi]nquies))?|[úu]nico|primero|segundo|tercero|cuarto|quinto|sexto|s[ée]ptimo|octavo|noveno|d[ée]cimo|transitorio|final)(?:\\s+transitori[ao])?\\.?-',
  'gi'
)

// NOTE: the `\b` after `Art(?:ículo|\.)` means the `Art.` abbreviation can never
// match here — `.` and the following space are both non-word characters, so no
// boundary exists. Preserved deliberately: render_texto.py:286 always emits
// `#### Artículo {num}`, and changing this would re-slug committed text.
const MD_HEADING_RE = /^(#{2,4})\s+Art(?:[íi]culo|\.)\b\s+(\S[^\n]*?)\s*$/gim

export function segment(text: string): Segment[] {
  const mdMatches = [...text.matchAll(MD_HEADING_RE)]
  if (mdMatches.length > 0) return segmentMarkdownHeadings(text, mdMatches)

  const inlineMatches = [...text.matchAll(HEADING_RE)]
  if (inlineMatches.length === 0) {
    return [{ label: '__doc__', slug: labelToSlug('__doc__'), rawHeading: '', body: text.trim() }]
  }
  return segmentInlineMarkers(text, inlineMatches)
}

function preambleOf(text: string, firstStart: number): Segment[] {
  const preamble = text.slice(0, firstStart).trim()
  if (!preamble) return []
  return [{ label: '__preamble__', slug: labelToSlug('__preamble__'), rawHeading: '', body: preamble }]
}

function segmentMarkdownHeadings(text: string, matches: RegExpMatchArray[]): Segment[] {
  const segments: Segment[] = preambleOf(text, matches[0].index ?? 0)
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const headingEnd = (m.index ?? 0) + m[0].length
    const segEnd = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length
    const identifier = (m[2] || '').trim()
    const label = normalizeLabel(`articulo ${identifier}`)
    segments.push({
      label,
      slug: labelToSlug(label),
      rawHeading: `Artículo ${identifier}`,
      body: text.slice(headingEnd, segEnd).trim(),
    })
  }
  return segments
}

function segmentInlineMarkers(text: string, matches: RegExpMatchArray[]): Segment[] {
  const segments: Segment[] = preambleOf(text, matches[0].index ?? 0)
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const lead = m[1]?.length ?? 0
    const start = (m.index ?? 0) + lead
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length
    const chunk = text.slice(start, end)
    const headingMatchLen = m[0].length - lead
    const identifier = (m[3] || '').trim()
    const kind = (m[2] || 'Artículo').trim().toLowerCase().startsWith('art') ? 'articulo' : m[2]
    const label = normalizeLabel(`${kind} ${identifier}`)
    segments.push({
      label,
      slug: labelToSlug(label),
      rawHeading: chunk.slice(0, headingMatchLen).trim(),
      body: chunk.slice(headingMatchLen).trim(),
    })
  }
  return segments
}

/** Order-, heading- and body-sensitive; whitespace-insensitive. The validation
 *  gate (spec §8.1) compares sha256 of this, not of the raw texto.md. */
export function canonicalText(segs: Segment[]): string {
  return segs.map(s => (s.rawHeading ? `${s.rawHeading}\n${s.body}` : s.body)).join('\n\n')
}
