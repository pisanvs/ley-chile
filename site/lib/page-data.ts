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
  return { norma, versions, articles, mods: mods.rows.map(r => r.causa_id as number) }
}
