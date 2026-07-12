import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { NormaView } from '@/components/NormaView'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { canonicalPath, currentFecha, getNorma, getVersions } from '@/lib/norma'
import { loadNorma } from '@/lib/page-data'

interface Props { params: Promise<{ tipo: string; numero: string }> }

async function resolveCurrent(tipo: string, numero: string) {
  const norma = await getNorma(tipo, numero)
  if (!norma) return null
  const fecha = currentFecha(await getVersions(norma.idNorma))
  return loadNorma(tipo, numero, fecha)
}

export async function generateMetadata({ params }: Props) {
  const { tipo, numero } = await params
  const data = await resolveCurrent(tipo, numero)
  if (!data) return {}
  const fecha = currentFecha(data.versions)
  return {
    title: data.norma.titulo,
    alternates: { canonical: `${SITE}${canonicalPath(data.norma, fecha, data.versions)}` },
  }
}

// See the sibling [fecha]/page.tsx comment: no generateStaticParams here
// either, so this needs a <Suspense> boundary under `cacheComponents`.
export default async function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <CurrentNormaPage params={params} />
    </Suspense>
  )
}

async function CurrentNormaPage({ params }: Props) {
  const { tipo, numero } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()
  const data = await resolveCurrent(tipo, numero)
  if (!data || data.articles.length === 0) notFound()
  return <NormaView {...data} fecha={currentFecha(data.versions)} />
}
