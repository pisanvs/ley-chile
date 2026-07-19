import { normaSlug, type SluggableNorma } from './slug'

/** Build a legacy key URL `/{tipo}/{numero}`, encoding segments: `numero` can
 *  contain path-significant characters (e.g. "S/N" for sin número, or "3883
 *  EXENTO") which would otherwise split into extra route segments.
 *
 *  This is NOT the canonical form — (tipo, numero) identifies 91.7% of the
 *  corpus ambiguously. It survives as the *key* address: unambiguous keys 301
 *  to canonical, ambiguous ones render a disambiguation hub. Use canonicalHref
 *  for anything that should point at one specific norma. */
export function normaHref(
  tipo: string,
  numero: string,
  fecha?: string,
  hash?: string,
  base = '',
): string {
  const path = `/${encodeURIComponent(tipo)}/${encodeURIComponent(numero)}`
  const fechaPart = fecha ? `/${encodeURIComponent(fecha)}` : ''
  const hashPart = hash ? `#${hash}` : ''
  return `${base}${path}${fechaPart}${hashPart}`
}

export interface IdentifiableNorma extends SluggableNorma {
  idNorma: number
}

/** The canonical URL of one specific norma: `/norma/{idNorma}/{slug}`.
 *
 *  idNorma resolves; the slug is decoration that 301s when stale (see
 *  ./slug.ts for why nothing readable can carry identity here). The slug is
 *  already `[a-z0-9-]` so it needs no encoding — unlike `numero`, which is why
 *  this form is safe for the ~48% of the corpus whose numero is not URL-clean.
 *
 *  `base` yields an absolute URL (e.g. `${SITE}`) for MCP responses, JSON-LD
 *  and the sitemap, which need fully-qualified links. */
export function canonicalHref(
  n: IdentifiableNorma,
  fecha?: string,
  hash?: string,
  base = '',
): string {
  const path = `/norma/${n.idNorma}/${normaSlug(n)}`
  const fechaPart = fecha ? `/${encodeURIComponent(fecha)}` : ''
  const hashPart = hash ? `#${hash}` : ''
  return `${base}${path}${fechaPart}${hashPart}`
}

/** The editorial surfaces are keyed by norma too, so they inherit the same
 *  identity rule: `/guia/{idNorma}/{slug}`, `/cambios/{idNorma}/{slug}`.
 *
 *  Legacy `/guia/{tipo}/{numero}` picked the "canonical" member of a colliding
 *  key exactly like the reader did — so /guia/dfl/1 wrote a guide about
 *  whichever DFL 1 sorted first. Both shapes are two segments, which is why the
 *  routes discriminate on the first segment being all-digits: no tipo in the
 *  corpus is numeric (checked across all 36). */
export function guiaHref(n: IdentifiableNorma, base = ''): string {
  return `${base}/guia/${n.idNorma}/${normaSlug(n)}`
}

export function cambiosHref(n: IdentifiableNorma, base = ''): string {
  return `${base}/cambios/${n.idNorma}/${normaSlug(n)}`
}
