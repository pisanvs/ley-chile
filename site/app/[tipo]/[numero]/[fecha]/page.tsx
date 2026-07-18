import { notFound, permanentRedirect } from 'next/navigation'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import {
  canonicalPath, getCanonicalNorma, getKeySiblings, getVersions, resolveAlias,
} from '@/lib/norma'
import { normaHref } from '@/lib/href'
import { LawView } from '@/components/LawView'

interface Props { params: Promise<{ tipo: string; numero: string; fecha: string }> }

export async function generateMetadata({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return {}
  const resolved = await getCanonicalNorma(tipo, numero)
  if (!resolved) return {}
  const versions = await getVersions(resolved.norma.idNorma)
  return {
    title: `${resolved.norma.titulo} — texto al ${fecha}`,
    alternates: { canonical: `${SITE}${canonicalPath(resolved.norma, fecha, versions)}` },
  }
}

// See the sibling [numero]/page.tsx: deliberately NOT wrapped in <Suspense>, so
// notFound() can still set a real 404 status. Streaming a shell first commits
// HTTP 200 and turns every miss into a soft-404.
export default async function Page({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound()
  const resolved = await getCanonicalNorma(tipo, numero)
  if (!resolved) {
    const alias = await resolveAlias(numero)
    if (alias) permanentRedirect(normaHref(alias.tipo, alias.numero, fecha))
    notFound()
  }
  const { norma, total } = resolved
  const siblings = total > 1 ? await getKeySiblings(norma.tipo, norma.numero, norma.idNorma) : []
  return (
    <LawView
      tipo={tipo}
      numero={numero}
      idNorma={norma.idNorma}
      fecha={fecha}
      siblings={siblings}
      siblingTotal={total}
    />
  )
}
