import { NextResponse } from 'next/server'

// Never prerendered, never cached: the whole point is that changing the
// environment variable changes what users see on their next page view, with no
// rebuild and no deploy.
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** The site-wide banner, read at request time.
 *
 *  This lives behind an API route rather than being rendered straight into
 *  layout.tsx because the layout is statically prerendered — reading
 *  process.env there captures the value at BUILD time, which is how the first
 *  version of this shipped an empty banner while the variable was set
 *  correctly all along. Fetching it client-side keeps every page static and
 *  cacheable while still letting the message change instantly.
 */
export function GET() {
  const message = (process.env.SITE_ALERT ?? '').trim()
  const level = (process.env.SITE_ALERT_LEVEL ?? 'warn').trim().toLowerCase()
  return NextResponse.json(
    { message, level },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
