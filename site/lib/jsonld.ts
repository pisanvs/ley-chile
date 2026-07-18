import { canonicalHref } from './href'
import { currentFecha, type Norma, type Version } from './norma'
import { SITE } from './site'

// Re-exported so the existing `@/lib/jsonld` importers (sitemap, robots,
// llms.txt, MCP, the reader routes) keep resolving to the one constant.
export { SITE }

/** `tipo` is the first path segment, so these names can never be a tipo.
 *
 *  Every new top-level route MUST be listed here. None of the content routes
 *  below collides with a tipo present in the corpus today (checked against
 *  `SELECT DISTINCT tipo FROM norma`), but a future BCN tipo named `guia` would
 *  otherwise shadow ~7.8k law URLs silently. */
export const RESERVED_TIPOS = new Set([
  'buscar', 'api', 'sitemap', 'robots', '_next',
  'guia', 'cambios', 'temas', 'blog', 'norma',
])

export function legislationJsonLd(
  n: Norma, fecha: string, versions: Version[], modifiedBy: number[],
): object {
  const isCurrent = fecha === currentFecha(versions)
  return {
    '@context': 'https://schema.org',
    '@type': 'Legislation',
    name: n.titulo,
    legislationIdentifier: n.numero,
    legislationType: n.tipo,
    legislationDate: n.fechaPublicacion,
    legislationDateVersion: fecha,
    legislationLegalForce: isCurrent && !n.derogado ? 'InForce' : 'NotInForce',
    legislationJurisdiction: 'CL',
    legislationPassedBy: n.organismo,
    legislationChanges: modifiedBy.map(id => ({
      '@type': 'Legislation',
      legislationIdentifier: String(id),
    })),
    url: canonicalHref(n, isCurrent ? undefined : fecha, undefined, SITE),
  }
}

export interface FaqEntry {
  q: string
  a: string
}

/** FAQPage for a guide. Callers build the entries from corpus facts only —
 *  a fabricated answer about Chilean law is worse than no rich result. */
export function faqJsonLd(entries: FaqEntry[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

export interface ArticleMeta {
  title: string
  description: string
  path: string
  published: string
  modified?: string
}

/** Article for an editorial post. */
export function articleJsonLd(m: ArticleMeta): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: m.title,
    description: m.description,
    datePublished: m.published,
    dateModified: m.modified ?? m.published,
    inLanguage: 'es-CL',
    author: { '@type': 'Organization', name: 'LeyChile' },
    publisher: { '@type': 'Organization', name: 'LeyChile' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${m.path}` },
    url: `${SITE}${m.path}`,
  }
}

/** BreadcrumbList — helps Google render the /temas → /guia → lector hierarchy
 *  instead of a bare URL. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE}${it.path}`,
    })),
  }
}

/** Render a JSON-LD blob. `JSON.stringify` escapes nothing HTML-significant, so
 *  a `</script>` inside a law title would break out of the tag — hence the
 *  replace. Law titles are BCN-authored, but they are still untrusted input. */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
