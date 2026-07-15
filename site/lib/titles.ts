import { searchUrl } from './datasource'

export interface TitleEntry {
  idNorma: number
  numero: string
  tipo: string
  titulo: string
  organismo: string
  fechaPublicacion: string
}

let _titles: TitleEntry[] | null = null
let _byDate: TitleEntry[] | null = null
let _loading: Promise<TitleEntry[]> | null = null

/**
 * Lazily fetches the full titles index and caches it process-wide. Multiple
 * concurrent callers de-dupe through `_loading`. The returned array is the
 * raw payload (sorted by idNorma in the build).
 */
export async function loadTitles(): Promise<TitleEntry[]> {
  if (_titles) return _titles
  if (_loading) return _loading
  _loading = (async () => {
    const r = await fetch(searchUrl())
    if (!r.ok) throw new Error(`titles fetch failed: ${r.status}`)
    _titles = (await r.json()) as TitleEntry[]
    return _titles
  })()
  return _loading
}

/** Titles sorted by `fechaPublicacion` ascending; missing dates float to end. */
export async function loadTitlesByDate(): Promise<TitleEntry[]> {
  if (_byDate) return _byDate
  const all = await loadTitles()
  _byDate = [...all].sort((a, b) => {
    const da = a.fechaPublicacion || '9999-99-99'
    const db = b.fechaPublicacion || '9999-99-99'
    if (da < db) return -1
    if (da > db) return 1
    return a.idNorma - b.idNorma
  })
  return _byDate
}

/**
 * ±k chronological neighbours around `centerId`. Returns the active law in
 * the middle when possible; clamped at corpus edges. The active entry is
 * included in the returned slice (the caller can find it by `idNorma`).
 */
export async function chronologicalNeighbours(
  centerId: number,
  k = 5,
): Promise<TitleEntry[]> {
  const sorted = await loadTitlesByDate()
  const idx = sorted.findIndex(t => t.idNorma === centerId)
  if (idx < 0) return []
  const start = Math.max(0, idx - k)
  const end = Math.min(sorted.length, idx + k + 1)
  return sorted.slice(start, end)
}
