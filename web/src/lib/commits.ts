import { ds, byNumeroUrl } from './datasource'

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

let _byNumero: Record<string, number[]> | null = null
async function loadByNumero(): Promise<Record<string, number[]>> {
  if (_byNumero) return _byNumero
  try {
    const r = await fetch(byNumeroUrl())
    if (r.ok) _byNumero = (await r.json()) as Record<string, number[]>
    else _byNumero = {}
  } catch { _byNumero = {} }
  return _byNumero
}

/**
 * Resolve a route param (which may be either an idNorma or a real `numero`
 * like "20.330") to a numeric idNorma. Direct numeric input is tried first,
 * then falls back to the numero index. Returns null when the law isn't known.
 */
export async function resolveToIdNorma(param: string): Promise<number | null> {
  const direct = Number(param)
  if (Number.isFinite(direct) && direct > 0) {
    // Test shard exists. HEAD avoids downloading body.
    try {
      const probe = await fetch(ds.commitsUrl(direct), { method: 'HEAD' })
      if (probe.ok) return direct
    } catch {}
  }
  const idx = await loadByNumero()
  const candidates = idx[param] ?? idx[param.replace(/\./g, '')] ?? idx[String(direct)]
  if (candidates && candidates.length > 0) return candidates[0]
  return Number.isFinite(direct) && direct > 0 ? direct : null
}

export async function fetchCommits(idNorma: number): Promise<CommitsIndex> {
  const r = await fetch(ds.commitsUrl(idNorma))
  if (!r.ok) throw new Error(`commits ${idNorma}: ${r.status}`)
  const raw = (await r.json()) as RawShard
  // Multiple causa-norms can modify a single target on the same date. The
  // pipeline emits one git commit per (causa_fecha, causa_id) pair, so the
  // shard can contain >1 entry sharing a date. We need a deterministic
  // total order for `prev = commits[activeIdx - 1]` to mean "the version
  // immediately before this one". Stable sort by date alone preserves
  // shard order, which is git-log order (newest-first) — that puts same-date
  // ties backwards. Break ties by SHA ascending: not semantically tied to
  // build order, but stable across renders and reproducible across clients.
  const sorted = [...raw.commits].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.sha.localeCompare(b.sha)
  })
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
