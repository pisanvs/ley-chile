/** Build a norma URL, encoding segments: `numero` can contain characters that
 *  are path-significant (e.g. "S/N" for sin número, or "3883 EXENTO"), which
 *  would otherwise split into extra route segments. Next decodes params, so
 *  getNorma() still receives the original value.
 *
 *  `base` lets callers build an absolute URL (e.g. `${SITE}`) instead of a
 *  root-relative path — used by the MCP tool responses and JSON-LD, which
 *  need fully-qualified URLs. */
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
