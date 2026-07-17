import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/jsonld'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    // Two sitemaps: the sharded law-URL index, and the content sitemap
    // (guides / cambios / temas / blog). See app/sitemap-contenido.xml.
    sitemap: [`${SITE}/sitemap.xml`, `${SITE}/sitemap-contenido.xml`],
  }
}
