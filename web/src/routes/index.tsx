import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ds, landingUrl } from '@/lib/datasource'
import { useCmdK } from '@/components/CmdK'
import { YearRibbon } from '@/components/YearRibbon'
import { loadTitles, type TitleEntry } from '@/lib/titles'
import { TerminalDemo } from '@/components/TerminalDemo'
import '@/components/TerminalDemo.css'

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
  /** Added in a later build pass; gracefully missing on older indexes. */
  organismo?: string
}

interface LandingData {
  yearHistogram: { year: number; count: number }[]
  recentEvents: LandingEvent[]
  /** Tipos present in the corpus, sorted by frequency. Optional for back-compat. */
  tipos?: { tipo: string; count: number }[]
}

async function fetchLanding(): Promise<LandingData> {
  const r = await fetch(landingUrl())
  if (!r.ok) throw new Error(`landing ${r.status}`)
  return r.json()
}

async function fetchYearEvents(year: number): Promise<LandingEvent[]> {
  const r = await fetch(ds.yearUrl(year))
  if (r.status === 404) return []
  if (!r.ok) throw new Error(`year ${year} ${r.status}`)
  return (await r.json()) as LandingEvent[]
}

/** Promote a TitleEntry (from titles.json) into the LandingEvent shape the
 *  homepage event row already knows how to render. The `date` is the law's
 *  publication date so the row's anchor still navigates to a real version. */
function titleToEvent(t: TitleEntry): LandingEvent {
  return {
    sha: '',
    date: t.fechaPublicacion,
    causaId: t.idNorma,
    subject: '',
    idNorma: t.idNorma,
    numero: t.numero,
    tipo: t.tipo,
    titulo: t.titulo,
    organismo: t.organismo,
  }
}

function TimeMachine() {
  const q = useQuery({ queryKey: ['landing'], queryFn: fetchLanding })
  const cmdk = useCmdK()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null)

  const histogram = q.data?.yearHistogram ?? []
  const yearMin = histogram[0]?.year ?? 1970
  const yearMax = histogram[histogram.length - 1]?.year ?? 2026

  // When a year is selected, fetch the full shard for that year. Falls back
  // gracefully to client-side filtering of recentEvents if the shard 404s
  // (older index builds).
  const yearQ = useQuery({
    queryKey: ['by-year', selectedYear],
    queryFn: () => fetchYearEvents(selectedYear!),
    enabled: selectedYear !== null,
    staleTime: Infinity,
  })

  // The recentEvents window only has the last ~500 commits (12 months or so).
  // That makes "filter by tipo" with no year look broken for low-frequency
  // tipos: tipo=cod yields 1 result because only one código happened to be
  // touched in that window, even though the corpus has 4 of them. When a tipo
  // is selected on its own, we promote to the full titles index so the result
  // pool is "every norma of this tipo", sorted by publication date desc.
  const titlesQ = useQuery({
    queryKey: ['titles'],
    queryFn: loadTitles,
    enabled: selectedTipo !== null && selectedYear === null,
    staleTime: Infinity,
  })

  const tipos = useMemo<{ tipo: string; count: number }[]>(() => {
    if (q.data?.tipos && q.data.tipos.length > 0) return q.data.tipos
    // Derive from recentEvents when the build hasn't populated tipos yet.
    const m = new Map<string, number>()
    for (const e of q.data?.recentEvents ?? []) {
      m.set(e.tipo, (m.get(e.tipo) ?? 0) + 1)
    }
    return Array.from(m, ([tipo, count]) => ({ tipo, count }))
      .sort((a, b) => b.count - a.count)
  }, [q.data])

  const filteredEvents = useMemo<LandingEvent[]>(() => {
    // Tipo-only path: pull from titles.json (the full corpus) so we see
    // every norma of that tipo, not just whatever's been modified recently.
    if (selectedTipo && selectedYear === null) {
      const all = titlesQ.data ?? []
      return all
        .filter(t => t.tipo.toLowerCase() === selectedTipo.toLowerCase())
        .sort((a, b) => {
          const da = a.fechaPublicacion || '9999-99-99'
          const db = b.fechaPublicacion || '9999-99-99'
          if (da !== db) return da < db ? 1 : -1
          return b.idNorma - a.idNorma
        })
        .slice(0, 80)
        .map<LandingEvent>(t => titleToEvent(t))
    }

    let pool: LandingEvent[]
    if (selectedYear !== null) {
      const shard = yearQ.data
      if (shard && shard.length > 0) pool = shard
      else pool = (q.data?.recentEvents ?? []).filter(e => e.date.startsWith(String(selectedYear)))
    } else {
      pool = q.data?.recentEvents ?? []
    }
    if (selectedTipo) {
      pool = pool.filter(e => e.tipo.toLowerCase() === selectedTipo.toLowerCase())
    }
    // The unfiltered "Publicaciones recientes" view shows the top 5 by
    // default — the demo section below it does the heavy lifting for
    // showing what the corpus IS. Explicit filters (year / tipo) keep a
    // wider window since the user is exploring at that point.
    const cap = selectedYear === null && selectedTipo === null ? 5 : 80
    return pool.slice(0, cap)
  }, [q.data, yearQ.data, titlesQ.data, selectedYear, selectedTipo])

  // Loading state used by the empty-state guard so we don't flash "no events"
  // while the titles index is still in flight.
  const isFetchingPool =
    (selectedYear !== null && yearQ.isLoading) ||
    (selectedTipo !== null && selectedYear === null && titlesQ.isLoading)

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
          El corpus jurídico chileno,
          <span className="text-ruby"> en formato amigable</span>.
        </h1>
        <p
          className="mt-4 font-display italic text-xl md:text-2xl text-ink-soft lc-fade-up"
          style={{ animationDelay: '110ms' }}
        >
          Para agentes y humanos.
        </p>
        <p
          className="mt-6 text-ink-soft max-w-2xl text-[15.5px] leading-relaxed lc-fade-up"
          style={{ animationDelay: '170ms' }}
        >
          Control de cambios para toda la historia de la ley chilena. Cada ley,
          decreto y resolución desde 1810, reconstruida desde la Biblioteca del
          Congreso como un repositorio git: una publicación, un commit.
        </p>
        <div
          className="mt-8 flex flex-wrap gap-3 lc-fade-up"
          style={{ animationDelay: '220ms' }}
        >
          <button
            onClick={cmdk.open}
            onMouseEnter={cmdk.prefetch}
            onFocus={cmdk.prefetch}
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

      <section className="px-6 md:px-12 max-w-5xl mx-auto pb-20">
        <TerminalDemo />
      </section>

      <section className="px-6 md:px-12 max-w-5xl mx-auto pb-24">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl">
            {selectedYear && selectedTipo
              ? `${selectedTipo.toUpperCase()} en ${selectedYear}`
              : selectedYear
                ? `Eventos en ${selectedYear}`
                : selectedTipo
                  ? `Todas las normas de tipo ${selectedTipo.toUpperCase()}`
                  : 'Publicaciones recientes'}
          </h2>
          {isFetchingPool && (
            <span className="text-xs text-ink-faint">
              {selectedYear && yearQ.isLoading ? 'cargando año…' : 'cargando índice…'}
            </span>
          )}
        </div>

        {tipos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            <TipoChip
              label="Todos"
              active={selectedTipo === null}
              onClick={() => setSelectedTipo(null)}
            />
            {tipos.map(({ tipo, count }) => (
              <TipoChip
                key={tipo}
                label={tipo}
                count={count}
                active={selectedTipo?.toLowerCase() === tipo.toLowerCase()}
                onHover={() => {
                  // Warm the titles cache on hover so the click resolves
                  // instantly even for the full-corpus tipo path.
                  if (selectedYear === null) loadTitles().catch(() => {})
                }}
                onClick={() =>
                  setSelectedTipo(
                    selectedTipo?.toLowerCase() === tipo.toLowerCase() ? null : tipo,
                  )
                }
              />
            ))}
          </div>
        )}

        {q.isError && <p className="text-ruby text-sm">No se pudo cargar el corpus.</p>}
        {!q.isError && filteredEvents.length === 0 && q.data && !isFetchingPool && (
          <p className="text-sm text-ink-faint">
            Sin eventos para los filtros seleccionados.
          </p>
        )}
        <ul className="divide-y divide-rule">
          {filteredEvents.map(e => (
            <EventRow key={`${e.sha}-${e.idNorma}`} ev={e} />
          ))}
        </ul>
        {selectedYear === null && selectedTipo === null && filteredEvents.length > 0 && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={cmdk.open}
              onMouseEnter={cmdk.prefetch}
              onFocus={cmdk.prefetch}
              className="text-xs text-ink-faint hover:text-indigo font-ui transition"
              title="Buscar en todo el corpus"
            >
              Ver todo el corpus →
            </button>
          </div>
        )}
      </section>

      <ResearchSection />

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

function TipoChip({
  label,
  count,
  active,
  onClick,
  onHover,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  onHover?: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={`text-[11px] font-ui uppercase tracking-widest px-2.5 py-1 rounded-full border transition ${
        active
          ? 'bg-ink text-paper border-ink'
          : 'text-ink-soft hover:text-ink border-rule hover:border-ink/40'
      }`}
    >
      {label}
      {typeof count === 'number' && (
        <span className={`ml-1.5 font-mono normal-case tracking-normal ${active ? 'opacity-70' : 'opacity-50'}`}>
          {count}
        </span>
      )}
    </button>
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
          {ev.organismo && (
            <div className="text-[11.5px] text-ink-faint mt-0.5 italic truncate">
              {ev.organismo}
            </div>
          )}
        </div>
      </Link>
    </li>
  )
}

function ResearchSection() {
  return (
    <section className="px-6 md:px-12 max-w-5xl mx-auto pb-24">
      <div className="border-t border-rule pt-12">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-3">
          Frente abierto
        </p>
        <h2 className="font-display text-2xl md:text-3xl leading-tight text-balance mb-3">
          Investigación activa y caminos abiertos
        </h2>
        <p className="text-ink-soft text-[14.5px] leading-relaxed max-w-2xl mb-8">
          La infraestructura está en marcha; sobre ella construimos. Si algo
          te interesa, escribenos un issue en GitHub o abrí un PR.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <ResearchCard
            status="explorando"
            statusColor="indigo"
            title="LLMs para detectar contradicciones lógicas"
            body="Buscar resquicios, antinomias y redundancias en el corpus usando modelos. ¿Bounty para quien encuentre uno reproducible? En diseño."
          />
          <ResearchCard
            status="activo"
            statusColor="moss"
            title="Trazabilidad completa de autoría"
            body="Reconstruir quién promovió cada norma — autor, ministerio, tramitación, votación nominal — y exponerlo como otra dimensión navegable."
          />
        </div>
      </div>
    </section>
  )
}

function ResearchCard({
  status,
  statusColor,
  title,
  body,
}: {
  status: string
  statusColor: 'moss' | 'indigo' | 'ruby'
  title: string
  body: string
}) {
  const dot =
    statusColor === 'moss' ? 'bg-moss' : statusColor === 'indigo' ? 'bg-indigo' : 'bg-ruby'
  const ring =
    statusColor === 'moss'
      ? 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-moss)_30%,transparent)]'
      : statusColor === 'indigo'
        ? 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-indigo)_30%,transparent)]'
        : 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-ruby)_30%,transparent)]'
  return (
    <article
      className={`relative bg-paper-raised rounded-lg p-5 border border-rule ${ring} transition hover:-translate-y-0.5`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
        <span className="text-[10px] uppercase tracking-[0.18em] font-ui text-ink-soft">
          {status}
        </span>
      </div>
      <h3 className="font-display text-[1.05rem] leading-snug mb-1.5 text-balance">
        {title}
      </h3>
      <p className="text-[13px] text-ink-soft leading-relaxed">{body}</p>
    </article>
  )
}
