import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getVersions } from '@/lib/norma'
import { getGuiaStats, getSeoNorma, qualifiesForGuia } from '@/lib/seo'
import { loadOgFonts } from '@/lib/og/fonts'
import { buildLawCardProps } from '@/lib/og/card'
import { renderLawCard } from '@/lib/og/render'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Vista previa de la guía'

interface Props { params: Promise<{ tipo: string; numero: string }> }

export default async function Image({ params }: Props) {
  const { tipo, numero } = await params
  const norma = await getSeoNorma(tipo, numero)
  if (!norma) notFound()
  const stats = await getGuiaStats(norma.idNorma)
  if (!qualifiesForGuia(norma, stats)) notFound()
  const [versions, fonts] = await Promise.all([getVersions(norma.idNorma), loadOgFonts()])
  const props = buildLawCardProps({
    norma,
    versions: versions.length,
    versionDates: versions.map((v) => v.desde),
    articles: stats.articles,
  })
  return new ImageResponse(renderLawCard(props), { ...size, fonts })
}
