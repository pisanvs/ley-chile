import { notFound, permanentRedirect } from 'next/navigation'
import { RESERVED_TIPOS } from '@/lib/jsonld'
import { getKeyPage, resolveAlias } from '@/lib/norma'
import { canonicalHref, normaHref } from '@/lib/href'

/**
 * The dated legacy key address `/{tipo}/{numero}/{fecha}` — always a redirect.
 *
 * A version date is only meaningful once you know *which* norma you are
 * reading, and (tipo, numero) does not settle that for 91.7% of the corpus.
 * So: a unique key keeps the date and 301s to the canonical dated URL; an
 * ambiguous one drops the date and 301s to the hub, because there is no honest
 * way to pick whose version history the date refers to.
 */
interface Props { params: Promise<{ tipo: string; numero: string; fecha: string }> }

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// No generateMetadata: every path through this route redirects, so metadata is
// never rendered.
export default async function Page({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()
  if (!FECHA_RE.test(fecha)) notFound()

  const { members, total } = await getKeyPage(tipo, numero, 1)
  if (total === 0) {
    const alias = await resolveAlias(numero)
    if (alias) permanentRedirect(canonicalHref(alias, fecha))
    notFound()
  }
  if (total === 1) permanentRedirect(canonicalHref(members[0], fecha))
  permanentRedirect(normaHref(members[0].tipo, members[0].numero))
}
