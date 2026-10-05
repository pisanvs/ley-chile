/**
 * Local-only highlights + notes layer, persisted in localStorage so they
 * survive page reloads but never leave the device.
 *
 * Keyed by (idNorma, parte): LeyChile's idParte for the article, which stays
 * the same across versions while the article is amended and survives heading
 * changes (16 → 16 B, 1757 → 1757 (art. 2)). Entries saved before parte
 * existed carry only the slug; they are matched by slug and placed by their
 * saved text (see resolveHighlight). Offsets may still drift within an article
 * between versions; highlights are re-found by their saved text when they do.
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
  /** LeyChile idParte of the article. Absent on entries saved before it. */
  parte?: number
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
  /** LeyChile idParte of the article. Absent on entries saved before it. */
  parte?: number
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

/** Could an entry saved under `saved` belong to the article now at `slug`?
 *  Exact match, or the article's slug grew a suffix since: a letter
 *  (art-16 → art-16-b, the series used to share one heading), "transitorio",
 *  or a nested-article qualifier (art-1757 → art-1757-art-2). */
export function legacySlugMatches(saved: string, slug: string): boolean {
  if (saved === slug) return true
  if (!slug.startsWith(saved + '-')) return false
  return /^-(?:[a-z]{1,2}|nn|transitorio|art-.+)$/.test(slug.slice(saved.length))
}

/** Shorter text shows up anywhere, so "exactly once" means nothing. */
const MIN_ANCHOR = 8

/** Where a highlight goes in this article's text, or null if its text isn't
 *  here. Kept at its offsets when the text is still there; moved when the
 *  text appears exactly once (offsets drift between versions); otherwise not
 *  placed, so it isn't painted over unrelated words (the series 16,
 *  16 A..16 E used to share art-16). */
export function resolveHighlight<T extends { start: number; end: number; text: string }>(
  h: T,
  text: string,
): T | null {
  const want = h.text.trim()
  if (!want) return null
  if (text.slice(h.start, h.end).trim() === want) return h
  if (want.length < MIN_ANCHOR) return null
  const at = text.indexOf(want)
  if (at < 0 || text.indexOf(want, at + 1) >= 0) return null
  return { ...h, start: at, end: at + want.length }
}

export const annotations = {
  /** Highlights + notes for one article. With `parte`, entries saved under it
   *  plus legacy (slug-only) entries that match the slug; without it (text
   *  rendered without LeyChile's tree), by slug as before. */
  for(
    idNorma: number,
    slug: string,
    parte?: number,
  ): { highlights: Highlight[]; notes: Note[]; legacyHighlights: Highlight[] } {
    const s = readStore()
    const mine = <A extends { idNorma: number; slug: string; parte?: number }>(a: A) =>
      a.idNorma === idNorma && (parte != null ? a.parte === parte : a.slug === slug)
    const legacy = <A extends { idNorma: number; slug: string; parte?: number }>(a: A) =>
      parte != null && a.idNorma === idNorma && a.parte == null
    return {
      highlights: s.highlights.filter(mine),
      // Notes keep no copy of their text, so a legacy note can only follow
      // an exact slug.
      notes: s.notes.filter(n => mine(n) || (legacy(n) && n.slug === slug)),
      // Placed by the caller against the rendered text (resolveHighlight).
      legacyHighlights: s.highlights.filter(h => legacy(h) && legacySlugMatches(h.slug, slug)),
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

/** Reader preferences — also localStorage but a separate namespace so they're
 *  not exported with annotations. */

export type ReaderMode = 'redline' | 'clean' | 'source' | 'side-by-side' | 'efectos'
export interface ReaderPrefs {
  mode: ReaderMode
  monospace: boolean
  collapseUnchanged: boolean
}

const PREFS_KEY = 'lc-reader-prefs-v1'

export const defaultPrefs: ReaderPrefs = {
  mode: 'redline',
  monospace: false,
  collapseUnchanged: false,
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
