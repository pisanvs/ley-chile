import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { canonicalPath, currentFecha, getNorma, getVersions } from '@/lib/norma'
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

export default async function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Resolve params={params} />
    </Suspense>
  )
}

async function Resolve({ params }: Props) {
  const { tipo, numero } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()
  return <LawView tipo={tipo} numero={numero} />
}
