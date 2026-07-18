export const dynamic = 'force-dynamic'

import type { MetadataRoute } from 'next'
import { pool } from '@/lib/db'
import { SITE } from '@/lib/jsonld'
import { canonicalHref, normaHref } from '@/lib/href'

const PER_SITEMAP = 50_000   // Google's hard limit

// Railway (and this repo's Docker build, verified in CI) builds the image
// with no DATABASE_URL reachable — the DB only exists at container runtime.
// generateSitemaps() runs unconditionally at build time (that's how Next.js
// determines how many /sitemap/N.xml files to register), so it cannot query
// Postgres for the shard count the way the original design did: that made
// `next build` hard-fail with ECONNREFUSED in every environment that builds
// this image, not just local testing.
//
// Fixed instead: pick a shard count with headroom over corpus size (~357k
// normas per scripts/export_snapshot.py's failure-rate comment, easily
// doubled by non-current versions) and over-provision. Shards beyond the
// real data just return zero rows at request time (OFFSET past the end of a
// result set, not an error) — Google gets a valid, empty sitemap for those,
// which is harmless. Bump MAX_SITEMAP_SHARDS if the corpus outgrows it.
const MAX_SITEMAP_SHARDS = 32

export async function generateSitemaps() {
  return Array.from({ length: MAX_SITEMAP_SHARDS }, (_, id) => ({ id }))
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id)
  // Emits canonical /norma/{id}/{slug} URLs, which need id_norma + titulo to
  // slug — the legacy /{tipo}/{numero} form named 91.7% of the corpus
  // ambiguously, so submitting it told Google that 320k+ distinct normas were
  // the same handful of pages.
  //
  // k=2 rows are the disambiguation hubs: one per ambiguous key, a real page
  // worth indexing (someone searching "DFL 4" wants the list, not a guess).
  // The raw-concatenated `sort_url` only feeds ORDER BY, never the output.
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo, fecha, lastmod, k FROM (
       SELECT id_norma, tipo, numero, titulo, NULL::date AS fecha,
              fecha_publicacion AS lastmod, 0 AS k,
              '/' || tipo || '/' || numero AS sort_url
         FROM norma
       UNION ALL
       SELECT n.id_norma, n.tipo, n.numero, n.titulo, v.desde AS fecha, v.desde AS lastmod, 1,
              '/' || n.tipo || '/' || n.numero || '/' || v.desde AS sort_url
         FROM version v JOIN norma n ON n.id_norma = v.id_norma
        WHERE v.hasta IS NOT NULL
          AND (SELECT count(*) FROM version w WHERE w.id_norma = v.id_norma) > 1
       UNION ALL
       SELECT min(id_norma) AS id_norma, tipo, numero, NULL AS titulo, NULL::date AS fecha,
              max(fecha_publicacion) AS lastmod, 2 AS k,
              '/' || tipo || '/' || numero AS sort_url
         FROM norma GROUP BY tipo, numero HAVING count(*) > 1
     ) t ORDER BY id_norma, k, sort_url OFFSET $1 LIMIT $2`,
    [id * PER_SITEMAP, PER_SITEMAP],
  )
  return rows.map(r => ({
    url: r.k === 2
      ? normaHref(r.tipo, r.numero, undefined, undefined, SITE)
      : canonicalHref(
          { idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo ?? '' },
          r.fecha ?? undefined, undefined, SITE,
        ),
    lastModified: r.lastmod ?? undefined,
  }))
}
