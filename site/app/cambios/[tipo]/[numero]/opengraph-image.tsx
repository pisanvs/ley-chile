import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getModifiedBy, getVersions } from '@/lib/norma'
import { getGuiaStats, getSeoNorma, qualifiesForCambios } from '@/lib/seo'
import { loadOgFonts } from '@/lib/og/fonts'
import { buildLawCardProps } from '@/lib/og/card'
import { renderLawCard } from '@/lib/og/render'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Vista previa del historial de cambios'

interface Props { params: Promise<{ tipo: string; numero: string }> }

export default async function Image({ params }: Props) {
  const { tipo, numero } = await params
  const norma = await getSeoNorma(tipo, numero)
  if (!norma) notFound()
  const versions = await getVersions(norma.idNorma)
  const modifiedBy = await getModifiedBy(norma.idNorma)
  if (!qualifiesForCambios(versions, modifiedBy.length)) notFound()
  const [stats, fonts] = await Promise.all([getGuiaStats(norma.idNorma), loadOgFonts()])
  const props = buildLawCardProps({
    norma,
    versions: versions.length,
    versionDates: versions.map((v) => v.desde),
    articles: stats.articles,
  })
  return new ImageResponse(renderLawCard(props), { ...size, fonts })
}
