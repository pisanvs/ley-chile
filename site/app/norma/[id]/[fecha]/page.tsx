import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { SITE } from '@/lib/jsonld'
import {
  canonicalPath, getCanonicalNorma, getKeySiblings, getNormaById, getVersions,
} from '@/lib/norma'
import { normaHref } from '@/lib/href'
import { LawView } from '@/components/LawView'

/** A specific norma (by idNorma) at a specific version date. Sibling of
 *  app/norma/[id]/page.tsx — see it for why idNorma addressing exists. */
interface Props { params: Promise<{ id: string; fecha: string }> }

function parseId(id: string): number | null {
  return /^\d+$/.test(id) ? Number(id) : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, fecha } = await params
  const nid = parseId(id)
  if (nid === null || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return {}
  const norma = await getNormaById(nid)
  if (!norma) return {}
  const versions = await getVersions(norma.idNorma)
  const canon = await getCanonicalNorma(norma.tipo, norma.numero)
  const isCanonical = canon?.norma.idNorma === norma.idNorma
  const canonical = isCanonical
    ? canonicalPath(norma, fecha, versions)
    : `/norma/${norma.idNorma}/${fecha}`
  return {
    title: `${norma.titulo} — texto al ${fecha}`,
    alternates: { canonical: `${SITE}${canonical}` },
  }
}

export default async function Page({ params }: Props) {
  const { id, fecha } = await params
  const nid = parseId(id)
  if (nid === null) notFound()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound()
  const norma = await getNormaById(nid)
  if (!norma) notFound()
  const canon = await getCanonicalNorma(norma.tipo, norma.numero)
  if (canon && canon.norma.idNorma === norma.idNorma) {
    permanentRedirect(normaHref(norma.tipo, norma.numero, fecha))
  }
  const total = canon?.total ?? 1
  const siblings = await getKeySiblings(norma.tipo, norma.numero, norma.idNorma)
  return (
    <LawView
      tipo={norma.tipo}
      numero={norma.numero}
      idNorma={norma.idNorma}
      fecha={fecha}
      siblings={siblings}
      siblingTotal={total}
      versionBase={`/norma/${norma.idNorma}`}
    />
  )
}
