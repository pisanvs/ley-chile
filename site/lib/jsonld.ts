import { normaHref } from './href'
import { currentFecha, type Norma, type Version } from './norma'

export const SITE = process.env.SITE_URL ?? 'https://leychile.dev'

/** `tipo` is the first path segment, so these names can never be a tipo. */
export const RESERVED_TIPOS = new Set(['buscar', 'api', 'sitemap', 'robots', '_next'])

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
    url: normaHref(n.tipo, n.numero, isCurrent ? undefined : fecha, undefined, SITE),
  }
}
