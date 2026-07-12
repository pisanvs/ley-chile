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

export default async function Page({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()

  const data = await loadNorma(tipo, numero, fecha)
  if (!data || data.articles.length === 0) notFound()
  const { norma, versions, articles, mods } = data

  return <NormaView norma={norma} fecha={fecha} versions={versions} articles={articles} mods={mods} />
}
