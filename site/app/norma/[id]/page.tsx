import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { SITE } from '@/lib/jsonld'
import {
  canonicalPath, currentFecha, getCanonicalNorma, getKeySiblings, getNormaById, getVersions,
} from '@/lib/norma'
import { normaHref } from '@/lib/href'
import { LawView } from '@/components/LawView'

/**
 * Address a norma by its unique idNorma. Needed because (tipo, numero) is NOT
 * unique — ~7 "DFL 1", thousands of "res 1" — so the clean /{tipo}/{numero} URL
 * can only ever point at ONE of them (the canonical, most-reformed). Every other
 * sibling is reachable only here. Organismo is the human label; idNorma the key.
 *
 * SEO: the canonical norma lives at the clean /{tipo}/{numero}, so a request for
 * /norma/{canonicalId} 308-redirects there rather than duplicating it. Only the
 * non-canonical siblings actually render at /norma/{id}, each self-canonical.
 */
interface Props { params: Promise<{ id: string }> }

function parseId(id: string): number | null {
  return /^\d+$/.test(id) ? Number(id) : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const nid = parseId(id)
  if (nid === null) return {}
  const norma = await getNormaById(nid)
  if (!norma) return {}
  const versions = await getVersions(norma.idNorma)
  const canon = await getCanonicalNorma(norma.tipo, norma.numero)
  const isCanonical = canon?.norma.idNorma === norma.idNorma
  const canonical = isCanonical
    ? canonicalPath(norma, currentFecha(versions), versions)
    : `/norma/${norma.idNorma}`
  return {
    title: norma.organismo ? `${norma.titulo} — ${norma.organismo}` : norma.titulo,
    alternates: { canonical: `${SITE}${canonical}` },
  }
}

// Resolve before returning JSX, never under <Suspense> — same soft-404 rule as
// the /{tipo}/{numero} routes.
export default async function Page({ params }: Props) {
  const { id } = await params
  const nid = parseId(id)
  if (nid === null) notFound()
  const norma = await getNormaById(nid)
  if (!norma) notFound()
  const canon = await getCanonicalNorma(norma.tipo, norma.numero)
  // This IS the canonical of its key → send it to the clean semantic URL.
  if (canon && canon.norma.idNorma === norma.idNorma) {
    permanentRedirect(normaHref(norma.tipo, norma.numero))
  }
  const total = canon?.total ?? 1
  const siblings = await getKeySiblings(norma.tipo, norma.numero, norma.idNorma)
  return (
    <LawView
      tipo={norma.tipo}
      numero={norma.numero}
      idNorma={norma.idNorma}
      siblings={siblings}
      siblingTotal={total}
      versionBase={`/norma/${norma.idNorma}`}
    />
  )
}
