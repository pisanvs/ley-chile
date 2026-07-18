import { cambiosHref, guiaHref } from '@/lib/href'
import { SITE } from '@/lib/jsonld'
import { listCambiosUrls, listGuiaUrls } from '@/lib/seo'
import { listPosts } from '@/lib/blog'
import { TOPICS } from '@/lib/topics'

/** The content sitemap: guides, change pages, topic hubs and blog posts.
 *
 *  Deliberately a separate route rather than an extra shard of app/sitemap.ts.
 *  That file paginates a UNION with OFFSET/LIMIT across a fixed shard count and
 *  is load-bearing for ~333k law URLs; splicing a second row source into its
 *  ORDER BY would silently reshuffle which URLs land in which shard. This is
 *  ~13.2k URLs — one document, well under Google's 50k / 50MB limits.
 *
 *  Registered in robots.ts alongside /sitemap.xml.
 */
export const dynamic = 'force-dynamic'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

interface Entry { loc: string; lastmod?: string }

function urlTag({ loc, lastmod }: Entry): string {
  const lm = lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ''
  return `<url><loc>${esc(loc)}</loc>${lm}</url>`
}

export async function GET() {
  const [guias, cambios] = await Promise.all([listGuiaUrls(), listCambiosUrls()])

  const entries: Entry[] = [
    { loc: `${SITE}/guia` },
    { loc: `${SITE}/cambios` },
    { loc: `${SITE}/temas` },
    { loc: `${SITE}/blog` },
    ...TOPICS.map((t) => ({ loc: `${SITE}/temas/${t.slug}` })),
    ...listPosts().map((p) => ({
      loc: `${SITE}/blog/${p.slug}`,
      lastmod: p.modified ?? p.published,
    })),
    // encodeURIComponent, not raw concat: numero can be "S/N" or "3883 EXENTO",
    // which would otherwise split into extra path segments — the same trap
    // normaHref() exists to close for law URLs.
    ...guias.map((g) => ({
      loc: guiaHref(g, SITE),
      lastmod: g.lastmod ?? undefined,
    })),
    ...cambios.map((c) => ({
      loc: cambiosHref(c, SITE),
      lastmod: c.lastmod ?? undefined,
    })),
  ]

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    entries.map(urlTag).join('') +
    `</urlset>`

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
