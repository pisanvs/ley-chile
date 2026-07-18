import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getNormaById, getVersions } from '@/lib/norma'
import { getGuiaStats } from '@/lib/seo'
import { loadOgFonts } from '@/lib/og/fonts'
import { buildLawCardProps } from '@/lib/og/card'
import { renderLawCard } from '@/lib/og/render'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Vista previa de la norma'

interface Props { params: Promise<{ id: string }> }

function parseId(id: string): number | null {
  return /^\d+$/.test(id) ? Number(id) : null
}

export default async function Image({ params }: Props) {
  const { id } = await params
  const nid = parseId(id)
  if (nid === null) notFound()
  const norma = await getNormaById(nid)
  if (!norma) notFound()
  const [versions, stats, fonts] = await Promise.all([
    getVersions(norma.idNorma),
    getGuiaStats(norma.idNorma),
    loadOgFonts(),
  ])
  const props = buildLawCardProps({
    norma,
    versions: versions.length,
    versionDates: versions.map((v) => v.desde),
    articles: stats.articles,
  })
  return new ImageResponse(renderLawCard(props), { ...size, fonts })
}
