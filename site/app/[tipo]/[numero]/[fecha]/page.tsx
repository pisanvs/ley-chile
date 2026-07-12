import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { NormaView } from '@/components/NormaView'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { canonicalPath } from '@/lib/norma'
import { loadNorma } from '@/lib/page-data'

interface Props { params: Promise<{ tipo: string; numero: string; fecha: string }> }

export async function generateMetadata({ params }: Props) {
  const { tipo, numero, fecha } = await params
  const data = await loadNorma(tipo, numero, fecha)
  if (!data) return {}
  return {
    title: `${data.norma.titulo} — texto al ${fecha}`,
    alternates: { canonical: `${SITE}${canonicalPath(data.norma, fecha, data.versions)}` },
  }
}

// This route has no generateStaticParams — every request reads dynamic route
// params and uncached DB state. With `cacheComponents` (next.config.ts),
// accessing dynamic data outside a <Suspense> boundary is a build error
// ("Uncached data was accessed outside of <Suspense>"): the framework needs a
// boundary to know where the static shell ends and the per-request stream
// begins. There's no meaningful static shell above this content, so the
// boundary wraps the whole page.
export default async function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <NormaPage params={params} />
    </Suspense>
  )
}

async function NormaPage({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()

  const data = await loadNorma(tipo, numero, fecha)
  if (!data || data.articles.length === 0) notFound()
  const { norma, versions, articles, mods } = data

  return <NormaView norma={norma} fecha={fecha} versions={versions} articles={articles} mods={mods} />
}
