import { cacheLife, cacheTag } from 'next/cache'
import { pool } from '@/lib/db'
import { getArticlesAsOf, getNorma, getVersions } from '@/lib/norma'

export async function loadNorma(tipo: string, numero: string, fecha: string) {
  'use cache'
  cacheLife('max')                       // a 1997 law's text as of 1997 never changes
  const norma = await getNorma(tipo, numero)
  if (!norma) return null
  cacheTag(`norma:${norma.idNorma}`)     // loader POSTs /api/revalidate -> revalidateTag
  const [versions, articles, mods] = await Promise.all([
    getVersions(norma.idNorma),
    getArticlesAsOf(norma.idNorma, fecha),
    pool.query('SELECT causa_id FROM modificacion WHERE target_id = $1', [norma.idNorma]),
  ])

  // The version whose validity window contains `fecha`, and its predecessor —
  // the predecessor's text is what the redline diffs this version against.
  const sorted = versions.filter((v) => v.desde <= fecha).sort((a, b) => a.desde.localeCompare(b.desde))
  const prevDesde = sorted.length >= 2 ? sorted[sorted.length - 2].desde : null
  const prevArticles = prevDesde ? await getArticlesAsOf(norma.idNorma, prevDesde) : []

  return {
    norma,
    versions,
    articles,
    prevArticles,
    mods: mods.rows.map((r) => r.causa_id as number),
  }
}
