import { notFound, permanentRedirect } from 'next/navigation'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { canonicalPath, currentFecha, getNorma, getVersions, resolveAlias } from '@/lib/norma'
import { normaHref } from '@/lib/href'
import { LawView } from '@/components/LawView'

interface Props { params: Promise<{ tipo: string; numero: string }> }

export async function generateMetadata({ params }: Props) {
  const { tipo, numero } = await params
  if (RESERVED_TIPOS.has(tipo)) return {}
  const norma = await getNorma(tipo, numero)
  if (!norma) return {}
  const versions = await getVersions(norma.idNorma)
  const fecha = currentFecha(versions)
  return {
    title: norma.titulo,
    alternates: { canonical: `${SITE}${canonicalPath(norma, fecha, versions)}` },
  }
}

// Deliberately NOT wrapped in <Suspense>: resolve BEFORE anything streams.
// Streaming the shell first sends headers (HTTP 200), after which notFound()
// can no longer change the status — a request for a nonexistent norma would
// return 200 with 404 content. Across ~333k pages that soft-404 is exactly the
// SEO failure this port exists to avoid. (The boundary was only needed under
// `cacheComponents`, which is now disabled.)
export default async function Page({ params }: Props) {
  const { tipo, numero } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()
  const norma = await getNorma(tipo, numero)
  if (!norma) {
    // 308 rather than 404 when the norma exists but was addressed by idNorma or
    // under the wrong tipo. See resolveAlias.
    const alias = await resolveAlias(numero)
    if (alias) permanentRedirect(normaHref(alias.tipo, alias.numero))
    notFound()
  }
  return <LawView tipo={tipo} numero={numero} idNorma={norma.idNorma} />
}
