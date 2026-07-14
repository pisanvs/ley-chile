import { Suspense } from 'react'
import Link from 'next/link'
import { pool } from '@/lib/db'
import { TopBar } from '@/components/TopBar'

const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley', dl: 'Decreto Ley', dfl: 'DFL', dto: 'Decreto', cod: 'Código', res: 'Resolución',
}

export default function Home() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Hero */}
        <section className="lc-fade-up py-16 text-center md:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-ink-faint">
            La ley chilena, versión por versión
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink text-balance md:text-6xl">
            Cada texto de cada ley,<br className="hidden sm:inline" /> desde <span className="text-ruby">1810</span> hasta hoy.
          </h1>
          <p className="mx-auto mt-5 max-w-xl font-body text-lg leading-relaxed text-ink-soft">
            Lee cualquier ley, decreto o código chileno tal como estaba redactado en cualquier fecha
            — con su historial de cambios y búsqueda sobre todo el corpus.
          </p>

          <form action="/buscar" method="get" className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-xl border border-rule bg-paper-raised p-2 shadow-sm focus-within:border-indigo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="ml-2 shrink-0 text-ink-faint">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              name="q"
              autoFocus
              placeholder="Ej. arrendamiento, ley 20330, subsidio…"
              className="w-full bg-transparent px-1 py-2 text-ink outline-none placeholder:text-ink-faint"
            />
            <button type="submit" className="rounded-lg bg-indigo px-4 py-2 text-sm font-medium text-paper-raised transition-opacity hover:opacity-90">
              Buscar
            </button>
          </form>
        </section>

        {/* Explore */}
        <section className="border-t border-rule py-12">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Explora</h2>
          <Suspense fallback={<p className="mt-4 text-sm text-ink-faint">Cargando…</p>}>
            <ExampleLaws />
          </Suspense>
        </section>
      </main>

      <footer className="mx-auto max-w-4xl px-4 py-10 text-sm text-ink-faint sm:px-6">
        <span>LeyChile — texto derivado de fuentes públicas de la BCN.</span>
      </footer>
    </>
  )
}

async function ExampleLaws() {
  const { rows } = await pool.query(
    `SELECT tipo, numero, titulo FROM norma
      WHERE titulo <> '' ORDER BY id_norma DESC LIMIT 6`,
  )
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-ink-faint">Aún no hay leyes cargadas.</p>
  }
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {rows.map((r) => {
        const tipo = TIPO_LABEL[r.tipo] ?? String(r.tipo).toUpperCase()
        return (
          <li key={`${r.tipo}-${r.numero}`}>
            <Link
              href={`/${r.tipo}/${r.numero}`}
              className="block rounded-xl border border-rule bg-paper-raised p-4 transition-colors hover:border-indigo/60"
            >
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">{tipo} {r.numero}</div>
              <div className="mt-1 line-clamp-2 font-display text-base font-semibold leading-snug text-ink">{r.titulo}</div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
