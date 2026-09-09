import './globals.css'
import type { Metadata } from 'next'
import { AppShell } from '@/components/AppShell'
import { SiteAlert } from '@/components/SiteAlert'
import { SITE } from '@/lib/site'

// Aligned to the landing hero copy. Reused across the base metadata, OG, and
// Twitter so they never drift. The og:image is app/opengraph-image.png, which
// Next wires into og:image automatically (Twitter falls back to it too).
const OG_TITLE = 'El corpus jurídico chileno, en formato amigable'
const DESCRIPTION =
  'Control de cambios para toda la historia de la ley chilena: cada ley, decreto y ' +
  'resolución desde 1810, reconstruida como un repositorio git. Para agentes y humanos.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'LeyChile — el corpus jurídico chileno, en formato amigable',
    template: '%s · LeyChile',
  },
  description: DESCRIPTION,
  applicationName: 'LeyChile',
  openGraph: {
    type: 'website',
    siteName: 'LeyChile',
    locale: 'es_CL',
    url: SITE,
    title: OG_TITLE,
    description: DESCRIPTION,
  },
  // No title/description here: Next.js auto-fills unset twitter fields from
  // openGraph (see resolve-metadata.js's postProcessMetadata) — but only
  // when the *merged* twitter object has no title/description at all. If we
  // set them here, every route that defines its own per-page openGraph
  // (norma, guia, cambios, temas, blog — everywhere but this generic
  // fallback) inherits this literal object unchanged instead, since none of
  // them define their own `twitter` field. That silently pinned the Twitter
  // Card preview to the sitewide homepage blurb on every page, while
  // og:title/og:description were correctly per-page all along.
  twitter: {
    card: 'summary_large_image',
  },
}

// Match the theme before first paint (web/ uses the `lc-theme` localStorage key).
const noFlashTheme = `
try {
  var t = localStorage.getItem('lc-theme');
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="antialiased">
        <SiteAlert />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
