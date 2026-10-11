/**
 * Local-only highlights + notes layer. Keyed by (idNorma, articleSlug, range),
 * persisted in localStorage so they survive page reloads but never leave the
 * device. Versions of the same law share annotations because they're anchored
 * by article slug, not by sha — when text shifts, the offset may drift; we
 * accept that for v1.
 */

export type HighlightColor = 'yellow' | 'moss' | 'ruby' | 'indigo'

export interface Highlight {
  id: string
  idNorma: number
  slug: string
  /** Offset within the article body (counted in unicode code points). */
  start: number
  end: number
  color: HighlightColor
  /** A copy of the highlighted text so the user can still see it if the
   *  offsets drift after a version change. */
  text: string
  createdAt: number
}

export interface Note {
  id: string
  idNorma: number
  slug: string
  /** Offset within the article body where the pin lives. */
  anchor: number
  body: string
  createdAt: number
  updatedAt: number
}

interface Store {
  highlights: Highlight[]
  notes: Note[]
}

const KEY = 'lc-annotations-v1'

function readStore(): Store {
  if (typeof window === 'undefined') return { highlights: [], notes: [] }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { highlights: [], notes: [] }
    const parsed = JSON.parse(raw) as Partial<Store>
    return {
      highlights: parsed.highlights ?? [],
      notes: parsed.notes ?? [],
    }
  } catch {
    return { highlights: [], notes: [] }
  }
}

function writeStore(s: Store): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
    window.dispatchEvent(new CustomEvent('lc-annotations-changed'))
  } catch {
    // QuotaExceeded etc. — silently swallow; user will see toast in v2
  }
}

function id(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export const annotations = {
  /** All highlights + notes for a given (idNorma, slug). */
  for(idNorma: number, slug: string): { highlights: Highlight[]; notes: Note[] } {
    const s = readStore()
    return {
      highlights: s.highlights.filter(h => h.idNorma === idNorma && h.slug === slug),
      notes: s.notes.filter(n => n.idNorma === idNorma && n.slug === slug),
    }
  },

  /** Counts per (idNorma, slug) — used by the right rail. */
  counts(idNorma: number): Map<string, { highlights: number; notes: number }> {
    const s = readStore()
    const out = new Map<string, { highlights: number; notes: number }>()
    for (const h of s.highlights) {
      if (h.idNorma !== idNorma) continue
      const cur = out.get(h.slug) ?? { highlights: 0, notes: 0 }
      cur.highlights++
      out.set(h.slug, cur)
    }
    for (const n of s.notes) {
      if (n.idNorma !== idNorma) continue
      const cur = out.get(n.slug) ?? { highlights: 0, notes: 0 }
      cur.notes++
      out.set(n.slug, cur)
    }
    return out
  },

  addHighlight(h: Omit<Highlight, 'id' | 'createdAt'>): Highlight {
    const s = readStore()
    const full: Highlight = { ...h, id: id(), createdAt: Date.now() }
    s.highlights.push(full)
    writeStore(s)
    return full
  },

  removeHighlight(hid: string): void {
    const s = readStore()
    s.highlights = s.highlights.filter(h => h.id !== hid)
    writeStore(s)
  },

  addNote(n: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Note {
    const s = readStore()
    const now = Date.now()
    const full: Note = { ...n, id: id(), createdAt: now, updatedAt: now }
    s.notes.push(full)
    writeStore(s)
    return full
  },

  updateNote(nid: string, body: string): void {
    const s = readStore()
    const idx = s.notes.findIndex(n => n.id === nid)
    if (idx < 0) return
    s.notes[idx] = { ...s.notes[idx], body, updatedAt: Date.now() }
    writeStore(s)
  },

  removeNote(nid: string): void {
    const s = readStore()
    s.notes = s.notes.filter(n => n.id !== nid)
    writeStore(s)
  },
}


// ---------------------------------------------------------------------------
// Articles that used to share a slug
// ---------------------------------------------------------------------------

/** Minimum length of a stored text before it can locate a highlight. A short
 *  fragment occurs all over a law; eight characters make the "exactly once"
 *  rule below mean something. */
const MIN_LOCATABLE_TEXT = 8

/** For a lettered article slug, the slug its series used to share.
 *
 *  "art-16-b" -> "art-16", "art-16" -> null. Word suffixes are left alone
 *  ("art-10-bis" -> null): those always rendered with their own identifier,
 *  so their annotations were never ambiguous.
 */
export function legacySlugFor(slug: string): string | null {
  const m = /^(.+)-([a-zñ])$/.exec(slug)
  return m ? m[1] : null
}

/** Offset of `text` in `body` when it appears exactly once, else -1. */
function locateOnce(body: string, text: string): number {
  if (!text || text.length < MIN_LOCATABLE_TEXT) return -1
  const first = body.indexOf(text)
  if (first < 0) return -1
  if (body.indexOf(text, first + 1) >= 0) return -1
  return first
}

/** Which highlights belong to this rendered article body, and where.
 *
 * Until article letters survived rendering, "Artículo 16 A" .. "16 E" all
 * carried the slug "art-16": a highlight made in 16 B was stored under
 * "art-16" and replayed in every article of the series, at whatever those
 * offsets happened to hit. Now that each article has its own slug, the stored
 * `text` can place it — if it occurs exactly once in this body, it is here.
 *
 * Three rules, in order of preference:
 *   1. The text still sits at its offsets: keep it untouched.
 *   2. The text occurs exactly once in this body: keep it, offsets refreshed.
 *      This also repairs ordinary drift after a version change.
 *   3. The text is not here. If the article has lettered siblings the
 *      highlight was almost certainly made in one of them, so leave it for
 *      that segment instead of painting it over unrelated words. Without
 *      siblings there is nowhere else for it to go, so it stays as it was —
 *      the behaviour before this function existed.
 *
 * Nothing is written back: this resolves at render time, so annotations are
 * never rewritten and a reader on an older build still sees them.
 *
 * Notes are not resolvable this way — they store an offset and a body, with
 * no copy of the text they point at.
 */
export function resolveHighlights(params: {
  /** Rendered text of the article body — the basis the offsets are counted in. */
  body: string
  /** Highlights stored under this article's own slug. */
  stored: Highlight[]
  /** Highlights stored under the slug the series used to share, if any. */
  legacy?: Highlight[]
  /** Whether another article in this series carries a letter. */
  hasLetteredSiblings?: boolean
  /** This article's slug, applied to the legacy highlights it claims. */
  slug?: string
}): Highlight[] {
  const { body, stored, legacy = [], hasLetteredSiblings = false, slug } = params
  const out: Highlight[] = []

  for (const h of stored) {
    if (body.slice(h.start, h.end) === h.text) {
      out.push(h)
      continue
    }
    const at = locateOnce(body, h.text)
    if (at >= 0) {
      out.push({ ...h, start: at, end: at + h.text.length })
      continue
    }
    if (!hasLetteredSiblings) out.push(h)
  }

  for (const l of legacy) {
    const at = locateOnce(body, l.text)
    if (at >= 0) {
      out.push({ ...l, slug: slug ?? l.slug, start: at, end: at + l.text.length })
    }
  }

  return out
}

/** Reader preferences — also localStorage but a separate namespace so they're
 *  not exported with annotations. */

export type ReaderMode = 'redline' | 'clean' | 'source' | 'side-by-side'
export interface ReaderPrefs {
  mode: ReaderMode
  monospace: boolean
  collapseUnchanged: boolean
}

const PREFS_KEY = 'lc-reader-prefs-v1'

export const defaultPrefs: ReaderPrefs = {
  mode: 'redline',
  monospace: false,
  collapseUnchanged: true,
}

export function readPrefs(): ReaderPrefs {
  if (typeof window === 'undefined') return defaultPrefs
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPrefs
    return { ...defaultPrefs, ...(JSON.parse(raw) as Partial<ReaderPrefs>) }
  } catch {
    return defaultPrefs
  }
}

export function writePrefs(p: Partial<ReaderPrefs>): ReaderPrefs {
  const next = { ...readPrefs(), ...p }
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  return next
}
