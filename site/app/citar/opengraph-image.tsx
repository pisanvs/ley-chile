import { ImageResponse } from 'next/og'

import { CITE_FORMATS } from '@/lib/cite'
import { loadOgFonts } from '@/lib/og/fonts'
import { renderCitarCard } from '@/lib/og/citarCard'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// Counted, not spelled out: the card's chips come from CITE_FORMATS, so a
// hardcoded number goes stale the moment a format is added — which it was.
export const alt =
  `Cómo citar una ley chilena — generador de citas en ${CITE_FORMATS.length} formatos`

/**
 * `/citar`'s share card, via the `opengraph-image` file convention.
 *
 * The norma cards go through `/api/og` because there are ~333k of them and
 * each needs a database read, which is why that route carries an LRU cache.
 * This one is a single static image with no data dependency, so Next renders
 * it once during `next build` and serves it as a file — no cache to size, no
 * Postgres query on the path a crawler hits, and no exposure to the
 * `meta-externalagent` hammering that made the cache on `/api/og` necessary.
 *
 * It sits beside a `force-dynamic` page, which does not affect it: route
 * segment config declared in `page.tsx` binds that page's route, not its
 * sibling metadata routes.
 */
export default async function Image() {
  return new ImageResponse(renderCitarCard(), { ...size, fonts: await loadOgFonts() })
}
