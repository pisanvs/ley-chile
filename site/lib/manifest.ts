export interface Manifest {
  repo: string
  normasCount: number
  versionsCount: number
  yearMin: number | null
  yearMax: number | null
}

interface RawManifest {
  repo: string
  normas_count: number
  versions_count: number
  year_min: number | null
  year_max: number | null
}

export async function fetchManifest(url: string): Promise<Manifest> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`)
  const raw = (await r.json()) as RawManifest
  return {
    repo: raw.repo,
    normasCount: raw.normas_count,
    versionsCount: raw.versions_count,
    yearMin: raw.year_min,
    yearMax: raw.year_max,
  }
}
