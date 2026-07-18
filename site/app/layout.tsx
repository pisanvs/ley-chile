import './globals.css'
import type { Metadata } from 'next'
import { AppShell } from '@/components/AppShell'
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
  twitter: {
    card: 'summary_large_image',
    title: OG_TITLE,
    description: DESCRIPTION,
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
