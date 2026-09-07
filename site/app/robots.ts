import type { MetadataRoute } from 'next'
import { SITE, MAX_SITEMAP_SHARDS } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    // Two sitemaps: the sharded law-URL index (app/sitemap.ts), and the
    // content sitemap (guides / cambios / temas / blog, see
    // app/sitemap-contenido.xml). Next.js's generateSitemaps() convention
    // serves shards at /sitemap/{id}.xml — there is NO index at the bare
    // /sitemap.xml (that path 404s), so every shard must be listed here
    // explicitly for crawlers to discover them from robots.txt.
    sitemap: [
      ...Array.from({ length: MAX_SITEMAP_SHARDS }, (_, i) => `${SITE}/sitemap/${i}.xml`),
      `${SITE}/sitemap-contenido.xml`,
    ],
  }
}
