import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { canonicalPath, getNorma, getVersions } from '@/lib/norma'
import { LawView } from '@/components/LawView'

interface Props { params: Promise<{ tipo: string; numero: string; fecha: string }> }

export async function generateMetadata({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return {}
  const norma = await getNorma(tipo, numero)
  if (!norma) return {}
  const versions = await getVersions(norma.idNorma)
  return {
    title: `${norma.titulo} — texto al ${fecha}`,
    alternates: { canonical: `${SITE}${canonicalPath(norma, fecha, versions)}` },
  }
}

export default async function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Resolve params={params} />
    </Suspense>
  )
}

async function Resolve({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound()
  const norma = await getNorma(tipo, numero)
  if (!norma) notFound()
  return <LawView tipo={tipo} numero={numero} idNorma={norma.idNorma} fecha={fecha} />
}
