/** A segment of legislative text keyed by its article-heading label. */
export interface Segment {
  label: string
  slug: string
  rawHeading: string
  body: string
  /** LeyChile's idParte, from the `<!-- parte:N -->` line render_texto.py
   *  writes under each article heading. Stable while the article is amended,
   *  new when it is replaced. Absent for text rendered without the tree. */
  parte?: number
}

const PARTE_RE = /^<!-- parte:(\d+) -->\s*/

/** Remove the idParte markers from text shown to people (source view). */
export function stripParteMarkers(text: string): string {
  return text.replace(/^<!-- parte:\d+ -->\n?\n?/gm, '')
}

export function labelToSlug(label: string): string {
  if (label === '__preamble__') return 'preambulo'
  if (label === '__doc__') return 'doc'
  return label
    .replace(/^articulo\s+/, 'art-')
    // Ñ is its own letter: "183 Ñ" follows "183 N" in the Código del Trabajo.
    .replace(/ñ/g, 'nn')
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
 *
 *  Ñ is kept: NFKD would turn it into N plus a tilde, and "183 Ñ" would
 *  collide with "183 N".
 */
export function normalizeLabel(s: string): string {
  return s
    .replace(/[°º]/g, '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/ñ/g, '\uE000')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\uE000/g, 'ñ')
    // Only a leading "Art." is the label word; "(art. 2)" later in the
    // label is a nested-law qualifier and stays short in the slug.
    .replace(/^art\./, 'articulo')
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
    const body = text.slice(headingEnd, segEnd).trim()
    const parte = PARTE_RE.exec(body)
    segments.push({
      label,
      slug: labelToSlug(label),
      rawHeading: `Artículo ${identifier}`,
      body: parte ? body.slice(parte[0].length) : body,
      ...(parte ? { parte: Number(parte[1]) } : {}),
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

/** Find an article by what a person or an LLM would type: "Artículo 16 B",
 *  "art. 16 B", "articulo 16 b" or the slug "art-16-b". Exact label first,
 *  then slug, then a label containing the query. */
export function findArticle<T extends { label: string; slug: string }>(
  articles: T[],
  query: string,
): T | undefined {
  const q = query.trim()
  const label = normalizeLabel(/^art(?:[íi]culo|\.)?\s/i.test(q) ? q : `articulo ${q}`)
  const slug = /^art-/i.test(q) ? q.toLowerCase() : labelToSlug(label)
  return (
    articles.find((a) => a.label === label) ??
    articles.find((a) => a.slug === slug) ??
    articles.find((a) => a.label.includes(label))
  )
}
