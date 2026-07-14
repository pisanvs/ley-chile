import { ds } from './datasource'

export interface ModificationRow {
  idNorma: number
  date: string
  sha: string
  titulo: string
  tipo: string
  numero: string
}

/**
 * For a given causa law (the one currently in view), list every (other law,
 * version) whose commits were caused by it. Returns [] when the law has no
 * outgoing modifications — the build emits no file in that case, so 404s
 * are normal.
 */
export async function fetchModifications(causaId: number): Promise<ModificationRow[]> {
  const url = ds.modifiesUrl(causaId)
  const res = await fetch(url)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as ModificationRow[]
}
