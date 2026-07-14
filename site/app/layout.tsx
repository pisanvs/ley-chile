import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'LeyChile — cada versión de cada ley chilena',
    template: '%s · LeyChile',
  },
  description: 'Cada versión de cada ley chilena, desde 1810. Texto vigente e histórico, con búsqueda.',
}

// Set the theme class before first paint to avoid a flash of the wrong palette.
const noFlashTheme = `
try {
  var t = localStorage.getItem('theme');
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
      <body className="min-h-screen bg-paper text-ink antialiased font-ui">
        {children}
      </body>
    </html>
  )
}
