import type { MetadataRoute } from 'next'
import { pool } from '@/lib/db'
import { SITE } from '@/lib/jsonld'

const PER_SITEMAP = 50_000   // Google's hard limit

export async function generateSitemaps() {
  // Indexable URLs: one per norma, plus one per *non-current* version of a
  // multi-version norma. Single-version dated URLs are canonicalised away.
  const { rows } = await pool.query(`
    SELECT count(*)::int AS n FROM (
      SELECT id_norma FROM norma
      UNION ALL
      SELECT v.id_norma FROM version v
       WHERE v.hasta IS NOT NULL
         AND (SELECT count(*) FROM version w WHERE w.id_norma = v.id_norma) > 1
    ) t`)
  const total = rows[0].n as number
  return Array.from({ length: Math.ceil(total / PER_SITEMAP) }, (_, id) => ({ id }))
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id)
  const { rows } = await pool.query(
    `SELECT url, lastmod FROM (
       SELECT '/' || tipo || '/' || numero AS url, fecha_publicacion AS lastmod, id_norma, 0 AS k
         FROM norma
       UNION ALL
       SELECT '/' || n.tipo || '/' || n.numero || '/' || v.desde, v.desde, v.id_norma, 1
         FROM version v JOIN norma n ON n.id_norma = v.id_norma
        WHERE v.hasta IS NOT NULL
          AND (SELECT count(*) FROM version w WHERE w.id_norma = v.id_norma) > 1
     ) t ORDER BY id_norma, k, url OFFSET $1 LIMIT $2`,
    [id * PER_SITEMAP, PER_SITEMAP],
  )
  return rows.map(r => ({ url: `${SITE}${r.url}`, lastModified: r.lastmod ?? undefined }))
}
