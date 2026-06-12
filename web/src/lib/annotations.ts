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

/** Reader preferences — also localStorage but a separate namespace so they're
 *  not exported with annotations. */

export type ReaderMode = 'redline' | 'clean' | 'source' | 'side-by-side' | 'effects'
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
