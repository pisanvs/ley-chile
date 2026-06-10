/**
 * In-IDE tab session — VS-Code-style horizontal tabs for the laws the user is
 * exploring. Persisted in sessionStorage so a reload keeps state but closing
 * the browser tab clears it. Lives outside React for global access from the
 * modal, the route, the keyboard handler — UI components subscribe via
 * `useTabs()`.
 */

export interface Tab {
  idNorma: number
  /** YYYY-MM-DD of the version this tab is anchored to. */
  date: string
  titulo: string
  tipo: string
  numero: string
}

interface State {
  tabs: Tab[]
}

const KEY = 'lc-tabs-v1'
const EVT = 'lc-tabs-changed'

function readState(): State {
  if (typeof window === 'undefined') return { tabs: [] }
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return { tabs: [] }
    const parsed = JSON.parse(raw) as Partial<State>
    return { tabs: parsed.tabs ?? [] }
  } catch {
    return { tabs: [] }
  }
}

function writeState(s: State): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s))
    window.dispatchEvent(new CustomEvent(EVT))
  } catch {
    // ignore
  }
}

function tabId(t: Pick<Tab, 'idNorma' | 'date'>): string {
  return `${t.idNorma}@${t.date}`
}

export const tabs = {
  list(): Tab[] {
    return readState().tabs
  },

  /** Adds a tab if not present. Returns the canonical Tab (existing or new). */
  add(t: Tab): Tab {
    const s = readState()
    const id = tabId(t)
    const existing = s.tabs.find(x => tabId(x) === id)
    if (existing) return existing
    s.tabs.push(t)
    writeState(s)
    return t
  },

  /** Add several at once (used by "Abrir todas en pestañas"). */
  addMany(list: Tab[]): void {
    const s = readState()
    const seen = new Set(s.tabs.map(tabId))
    for (const t of list) {
      const id = tabId(t)
      if (seen.has(id)) continue
      s.tabs.push(t)
      seen.add(id)
    }
    writeState(s)
  },

  close(idNorma: number, date: string): void {
    const s = readState()
    s.tabs = s.tabs.filter(t => tabId(t) !== tabId({ idNorma, date }))
    writeState(s)
  },

  closeAll(): void {
    writeState({ tabs: [] })
  },

  closeOthers(idNorma: number, date: string): void {
    const s = readState()
    s.tabs = s.tabs.filter(t => tabId(t) === tabId({ idNorma, date }))
    writeState(s)
  },

  has(idNorma: number, date: string): boolean {
    return readState().tabs.some(t => tabId(t) === tabId({ idNorma, date }))
  },

  /** Index in the open tab list — used to pick a neighbour after close. */
  indexOf(idNorma: number, date: string): number {
    return readState().tabs.findIndex(t => tabId(t) === tabId({ idNorma, date }))
  },

  subscribe(cb: () => void): () => void {
    const handler = () => cb()
    window.addEventListener(EVT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVT, handler)
      window.removeEventListener('storage', handler)
    }
  },
}

import { useEffect, useState } from 'react'

/** React hook — returns the live list, re-rendering on changes. */
export function useTabs(): Tab[] {
  const [list, setList] = useState<Tab[]>(() => tabs.list())
  useEffect(() => tabs.subscribe(() => setList(tabs.list())), [])
  return list
}
