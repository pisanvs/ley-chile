import { ds } from './datasource'

export interface Commit {
  sha: string
  date: string
  causaId: number
  subject: string
  magnitude: number
}

export interface NormaMeta {
  idNorma: number
  numero: string
  tipo: string
  titulo: string
  organismo: string
  fechaPublicacion: string
}

export interface CommitsIndex {
  norma: NormaMeta
  commits: Commit[]
  relDir: string
}

interface RawCommit {
  sha: string; date: string; causa_id: number; subject: string; magnitude: number
}
interface RawNorma {
  id_norma: number; numero: string; tipo: string; titulo: string; organismo: string; fecha_publicacion: string
}
interface RawShard { norma: RawNorma; commits: RawCommit[]; rel_dir: string }

/**
 * Resolve a route param (an idNorma or a bare `numero`) to a numeric idNorma.
 * The commits endpoint resolves either form and returns the canonical id.
 */
export async function resolveToIdNorma(param: string): Promise<number | null> {
  try {
    const r = await fetch(ds.commitsUrl(param))
    if (!r.ok) return null
    const raw = (await r.json()) as RawShard
    return raw.norma.id_norma
  } catch {
    return null
  }
}

export async function fetchCommits(idNorma: number): Promise<CommitsIndex> {
  const r = await fetch(ds.commitsUrl(idNorma))
  if (!r.ok) throw new Error(`commits ${idNorma}: ${r.status}`)
  const raw = (await r.json()) as RawShard
  const sorted = [...raw.commits].sort((a, b) => a.date.localeCompare(b.date))
  return {
    norma: {
      idNorma: raw.norma.id_norma,
      numero: raw.norma.numero,
      tipo: raw.norma.tipo,
      titulo: raw.norma.titulo,
      organismo: raw.norma.organismo,
      fechaPublicacion: raw.norma.fecha_publicacion,
    },
    commits: sorted.map(c => ({
      sha: c.sha, date: c.date, causaId: c.causa_id, subject: c.subject, magnitude: c.magnitude,
    })),
    relDir: raw.rel_dir,
  }
}
