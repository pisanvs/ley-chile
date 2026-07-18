import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { getKeyPage, resolveAlias } from '@/lib/norma'
import { canonicalHref, normaHref } from '@/lib/href'
import { KeyHub } from '@/components/KeyHub'

/**
 * The legacy *key* address `/{tipo}/{numero}` — no longer a norma page.
 *
 * (tipo, numero) is a query, not an identifier: 91.7% of the corpus shares its
 * key with another norma, so this URL cannot name one. It now does the only two
 * honest things:
 *
 *   - exactly one match  → 301 to that norma's canonical /norma/{id}/{slug}
 *   - more than one      → render the disambiguation hub, listing all of them
 *
 * It never guesses. The previous behaviour — serve whichever norma sorted
 * first, by "most reformed" — is what sent a reader looking for the Ley de
 * Partidos Políticos (DFL 4 de Segpres, 2017) to the Ley General de Servicios
 * Eléctricos (DFL 4 de Economía, 2007) instead.
 */
interface Props { params: Promise<{ tipo: string; numero: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo, numero } = await params
  if (RESERVED_TIPOS.has(tipo)) return {}
  // limit 1: metadata only needs the total and, for the single-match case,
  // nothing at all — that request 301s before it renders.
  const { members, total } = await getKeyPage(tipo, numero, 1)
  if (total <= 1) return {}
  const m = members[0]
  const label = `${m.tipo.toUpperCase()} ${m.numero}`
  return {
    title: `${label} — ${total} normas con esta clave`,
    description:
      `${total} normas chilenas comparten la clave ${label}, de distintos organismos y años. ` +
      'Elige la que buscas: cada una tiene su propia dirección permanente.',
    // Self-canonical: the hub is a real page about the key, not a stand-in for
    // any single norma, so it must not point at one of its members.
    alternates: { canonical: `${SITE}${normaHref(m.tipo, m.numero)}` },
  }
}

// Deliberately NOT wrapped in <Suspense> — see the canonical route: streaming
// commits HTTP 200 and turns every miss into a soft-404.
export default async function Page({ params }: Props) {
  const { tipo, numero } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()

  const { members, total } = await getKeyPage(tipo, numero)
  if (total === 0) {
    // The norma exists but was addressed by idNorma or under the wrong tipo.
    const alias = await resolveAlias(numero)
    if (alias) permanentRedirect(canonicalHref(alias))
    notFound()
  }
  if (total === 1) permanentRedirect(canonicalHref(members[0]))

  // tipo/numero from the DB rather than the route params: params arrive
  // percent-encoded ("S%2FN"), and these are for display.
  return (
    <KeyHub
      tipo={members[0].tipo}
      numero={members[0].numero}
      members={members}
      total={total}
    />
  )
}
