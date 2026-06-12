import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { landingUrl } from '@/lib/datasource'
import { useCmdK } from '@/components/CmdK'
import { YearRibbon } from '@/components/YearRibbon'

export const Route = createFileRoute('/')({
  component: TimeMachine,
})

interface LandingEvent {
  sha: string
  date: string
  causaId: number
  subject: string
  idNorma: number
  numero: string
  tipo: string
  titulo: string
}

interface LandingData {
  yearHistogram: { year: number; count: number }[]
  recentEvents: LandingEvent[]
}

async function fetchLanding(): Promise<LandingData> {
  const r = await fetch(landingUrl())
  if (!r.ok) throw new Error(`landing ${r.status}`)
  return r.json()
}

function TimeMachine() {
  const q = useQuery({ queryKey: ['landing'], queryFn: fetchLanding })
  const cmdk = useCmdK()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  const histogram = q.data?.yearHistogram ?? []
  const yearMin = histogram[0]?.year ?? 1970
  const yearMax = histogram[histogram.length - 1]?.year ?? 2026

  const filteredEvents = useMemo(() => {
    const all = q.data?.recentEvents ?? []
    if (!selectedYear) return all.slice(0, 60)
    return all.filter(e => e.date.startsWith(String(selectedYear))).slice(0, 60)
  }, [q.data, selectedYear])

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <section className="px-6 md:px-12 pt-16 md:pt-24 pb-12 max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-5 lc-fade-up">
          Una máquina del tiempo legislativa
        </p>
        <h1
          className="font-display text-4xl md:text-[3.6rem] leading-[1.04] tracking-tight text-balance lc-fade-up"
          style={{ animationDelay: '60ms' }}
        >
          Para agentes y humanos.
        </h1>
        <p
          className="mt-6 text-ink-soft max-w-2xl text-[15.5px] leading-relaxed lc-fade-up"
          style={{ animationDelay: '140ms' }}
        >
          Cada ley, decreto y resolución desde 1810, navegable en cada una de
          sus versiones históricas. Reconstruido desde la Biblioteca del Congreso
          como un repositorio git: una publicación, un commit.
        </p>
        <div
          className="mt-8 flex flex-wrap gap-3 lc-fade-up"
          style={{ animationDelay: '220ms' }}
        >
          <button
            onClick={cmdk.open}
            className="group inline-flex items-center gap-3 border border-ink/80 hover:border-ruby text-ink hover:text-ruby transition px-4 py-2.5 rounded-md"
          >
            <span className="text-sm">Buscar una ley o decreto…</span>
            <kbd className="font-mono text-[10px] bg-paper-sunk text-ink-soft px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
          <Link
            to="/ley/$numero"
            params={{ numero: '20330' }}
            className="inline-flex items-center gap-2 text-sm text-indigo hover:underline px-4 py-2.5"
          >
            o explora una ley de ejemplo →
          </Link>
        </div>
      </section>

      <section className="px-6 md:px-12 max-w-5xl mx-auto pb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-xl">Densidad legislativa por año</h2>
          {q.isLoading && <span className="text-xs text-ink-faint">cargando…</span>}
          {selectedYear && (
            <button
              onClick={() => setSelectedYear(null)}
              className="text-xs text-ink-faint hover:text-ink"
            >
              limpiar filtro ({selectedYear}) ✕
            </button>
          )}
        </div>
        <YearRibbon
          data={histogram}
          yearMin={yearMin}
          yearMax={yearMax}
          selected={selectedYear}
          onSelect={setSelectedYear}
        />
      </section>

      <section className="px-6 md:px-12 max-w-5xl mx-auto pb-24">
        <h2 className="font-display text-xl mb-4">
          {selectedYear ? `Eventos en ${selectedYear}` : 'Publicaciones recientes'}
        </h2>
        {q.isError && <p className="text-ruby text-sm">No se pudo cargar el corpus.</p>}
        {!q.isError && filteredEvents.length === 0 && q.data && (
          <p className="text-sm text-ink-faint">Sin eventos para este año en el subset cargado.</p>
        )}
        <ul className="divide-y divide-rule">
          {filteredEvents.map(e => (
            <EventRow key={`${e.sha}-${e.idNorma}`} ev={e} />
          ))}
        </ul>
      </section>

      <footer className="px-6 md:px-12 max-w-5xl mx-auto pb-16 text-xs text-ink-faint border-t border-rule pt-8">
        <p>
          Datos: Biblioteca del Congreso Nacional · Build:{' '}
          <a
            href="https://github.com/pisanvs/ley-chile"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink"
          >
            github.com/pisanvs/ley-chile
          </a>
        </p>
      </footer>
    </div>
  )
}

function EventRow({ ev }: { ev: LandingEvent }) {
  return (
    <li>
      <Link
        to="/ley/$numero/$fecha"
        params={{ numero: String(ev.idNorma), fecha: ev.date }}
        className="group flex flex-col md:flex-row md:items-baseline gap-1 md:gap-6 py-3 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
      >
        <div className="text-xs text-ink-faint font-mono w-24 shrink-0">{ev.date}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-ink-faint">
            {ev.tipo} · Nº {ev.numero}
          </div>
          <div className="font-display text-[1.05rem] leading-snug text-ink group-hover:text-ruby transition line-clamp-2">
            {ev.titulo}
          </div>
        </div>
      </Link>
    </li>
  )
}
