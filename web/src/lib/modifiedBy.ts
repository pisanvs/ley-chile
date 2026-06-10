import { ds } from './datasource'

export interface ModifierRow {
  modifierId: number
  modifierTipo: string
  modifierNumero: string
  modifierTitulo: string
  firstDate: string
  lastDate: string
  count: number
  touchedDates: string[]
}

/**
 * For a given target law, list each *distinct modifier* law that has edited
 * it, aggregated across all of that modifier's commits. Sorted by most-recent
 * touch first. Returns [] when the law was never modified (the build emits no
 * file in that case, so 404s are normal).
 */
export async function fetchModifiedBy(targetId: number): Promise<ModifierRow[]> {
  const url = ds.modifiedByUrl(targetId)
  const res = await fetch(url)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as ModifierRow[]
}
