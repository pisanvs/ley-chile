export const metadata = {
  title: 'ley-chile',
  description: 'Cada versión de cada ley chilena, desde 1810.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
