import './globals.css'
import type { Metadata } from 'next'
import { AppShell } from '@/components/AppShell'

export const metadata: Metadata = {
  title: {
    default: 'LeyChile — cada versión de cada ley chilena',
    template: '%s · LeyChile',
  },
  description: 'Cada versión de cada ley chilena, desde 1810. Texto vigente e histórico, con búsqueda.',
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
