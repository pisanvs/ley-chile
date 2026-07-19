import { ImageResponse } from 'next/og'
import { getNormaById, getVersions } from '@/lib/norma'
import { getGuiaStats } from '@/lib/seo'
import { loadOgFonts } from '@/lib/og/fonts'
import { buildLawCardProps } from '@/lib/og/card'
import { renderLawCard } from '@/lib/og/render'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Shared OG card image, addressed by `?id={idNorma}`.
 *
 *  The `/guia` and `/cambios` routes live under a single catch-all segment
 *  (`[...rest]`), and Next disallows an `opengraph-image` file convention
 *  inside a catch-all — there's no fixed parent segment to attach it to the
 *  way `/norma/[id]/opengraph-image.tsx` does. Those two routes point their
 *  `generateMetadata`'s `openGraph.images` at this fixed-path endpoint
 *  instead. The card itself is identical regardless of which route linked
 *  here — it only ever depends on the norma's own data — so one endpoint
 *  serves both, and could equally replace the norma route's own image later
 *  if that route's segment shape ever changes. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const nid = Number(searchParams.get('id'))
  if (!Number.isFinite(nid)) return new Response('Bad Request', { status: 400 })
  const norma = await getNormaById(nid)
  if (!norma) return new Response('Not Found', { status: 404 })
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
