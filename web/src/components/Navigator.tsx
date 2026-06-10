import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { SidebarHeading } from '@/components/IDEShell'
import { chronologicalNeighbours, type TitleEntry } from '@/lib/titles'
import { fetchModifications, type ModificationRow } from '@/lib/modifies'
import { fetchModifiedBy } from '@/lib/modifiedBy'

interface Props {
  /** idNorma of the law currently on screen — the center of the view. */
  activeId: number
}

/**
 * Left-rail navigator built for *exploration*. Two stacked groups:
 *
 *   1. "Cronología" — ±5 laws around the active one by publication date,
 *      with the active row highlighted in the middle. Lets you walk the
 *      corpus by historical context.
 *
 *   2. "Sugeridas" — 2-hop relational graph from the active law. The 1st
 *      hop shows everything this law modifies and everything that has
 *      modified it; under each neighbour we eagerly fetch *its* modifiers
 *      so you can see "who else touched this lineage". This is the seed
 *      for the future similarity-based suggestion algorithm.
 */
export function Navigator({ activeId }: Props) {
  return (
    <div className="space-y-6">
      <ChronologyGroup activeId={activeId} />
      <SuggestedGroup activeId={activeId} />
    </div>
  )
}

function ChronologyGroup({ activeId }: { activeId: number }) {
  const q = useQuery({
    queryKey: ['nav', 'chrono', activeId],
    queryFn: () => chronologicalNeighbours(activeId, 5),
    staleTime: Infinity,
  })

  return (
    <section className="space-y-2">
      <SidebarHeading>Cronología</SidebarHeading>
      <p className="text-[10px] text-ink-faint -mt-1">
        ±5 normas publicadas alrededor de ésta.
      </p>
      {q.isLoading && <ListSkeleton />}
      {q.isError && <p className="text-[11px] text-ruby">No se pudo cargar.</p>}
      {q.data && q.data.length === 0 && (
        <p className="text-[11px] text-ink-faint">Esta norma no aparece en el índice.</p>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="space-y-0.5 -mx-1.5">
          {q.data.map(t => <ChronoRow key={t.idNorma} entry={t} active={t.idNorma === activeId} />)}
        </ul>
      )}
    </section>
  )
}

function ChronoRow({ entry, active }: { entry: TitleEntry; active: boolean }) {
  return (
    <li>
      <Link
        to="/ley/$numero"
        params={{ numero: String(entry.idNorma) }}
        className={`group/row block px-1.5 py-1.5 rounded text-[12px] leading-snug transition ${
          active
            ? 'bg-ink text-paper'
            : 'text-ink-soft hover:bg-paper-sunk hover:text-ink'
        }`}
        title={entry.titulo}
      >
        <div className={`flex items-baseline gap-1.5 text-[9.5px] uppercase tracking-widest ${active ? 'text-paper/70' : 'text-ink-faint'}`}>
          <span className="font-mono normal-case tracking-normal">{entry.fechaPublicacion || '—'}</span>
          <span className="ml-auto truncate">{entry.tipo} · N° {entry.numero}</span>
        </div>
        <div className={`mt-0.5 line-clamp-2 text-balance ${active ? '' : 'group-hover/row:text-ink'}`}>
          {entry.titulo || <em className="opacity-60">(sin título)</em>}
        </div>
      </Link>
    </li>
  )
}

function SuggestedGroup({ activeId }: { activeId: number }) {
  const modifiers = useQuery({
    queryKey: ['nav', 'modified_by', activeId],
    queryFn: () => fetchModifiedBy(activeId),
    staleTime: Infinity,
  })
  const modifies = useQuery({
    queryKey: ['nav', 'modifies', activeId],
    queryFn: () => fetchModifications(activeId),
    staleTime: Infinity,
  })

  return (
    <section className="space-y-3">
      <SidebarHeading>Sugeridas</SidebarHeading>
      <p className="text-[10px] text-ink-faint -mt-1">
        Vecindad relacional (2 saltos). Similaridad por contenido llega pronto.
      </p>

      <NeighbourBlock
        label="Modificadores"
        empty="Ninguna otra norma ha modificado a ésta."
        loading={modifiers.isLoading}
        error={modifiers.isError}
        rows={(modifiers.data ?? []).map<NeighbourSeed>(r => ({
          id: r.modifierId,
          tipo: r.modifierTipo,
          numero: r.modifierNumero,
          titulo: r.modifierTitulo,
          accent: 'ruby',
          subtitle: r.count > 1 ? `${r.count} veces · ${r.lastDate}` : r.lastDate,
        }))}
      />

      <NeighbourBlock
        label="Modifica a"
        empty="Esta norma no modificó a otras."
        loading={modifies.isLoading}
        error={modifies.isError}
        rows={dedupeModifies(modifies.data ?? []).map<NeighbourSeed>(r => ({
          id: r.idNorma,
          tipo: r.tipo,
          numero: r.numero,
          titulo: r.titulo,
          accent: 'moss',
          subtitle: r.date,
        }))}
      />
    </section>
  )
}

interface NeighbourSeed {
  id: number
  tipo: string
  numero: string
  titulo: string
  accent: 'ruby' | 'moss'
  subtitle: string
}

function NeighbourBlock({
  label,
  rows,
  loading,
  error,
  empty,
}: {
  label: string
  rows: NeighbourSeed[]
  loading: boolean
  error: boolean
  empty: string
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] uppercase tracking-[0.18em] text-ink-soft font-ui">{label}</h4>
      {loading && <ListSkeleton />}
      {error && <p className="text-[11px] text-ruby">No se pudo cargar.</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-[10.5px] text-ink-faint italic">{empty}</p>
      )}
      <ul className="space-y-1.5">
        {rows.map(r => <NeighbourRow key={`${label}-${r.id}`} seed={r} />)}
      </ul>
    </div>
  )
}

function NeighbourRow({ seed }: { seed: NeighbourSeed }) {
  // Eager fetch of the 2nd hop. React Query dedupes if any of these neighbours
  // also appears elsewhere in the navigator (or in other components).
  const hop2 = useQuery({
    queryKey: ['nav', 'modified_by', seed.id],
    queryFn: () => fetchModifiedBy(seed.id),
    staleTime: Infinity,
  })
  const sub = hop2.data ?? []
  const accentBorder = seed.accent === 'ruby' ? 'border-l-ruby/60' : 'border-l-moss/60'

  return (
    <li className={`border-l-2 ${accentBorder} pl-2`}>
      <Link
        to="/ley/$numero"
        params={{ numero: String(seed.id) }}
        className="group/neigh block py-0.5 text-[12px] leading-snug text-ink-soft hover:text-ink transition"
        title={seed.titulo}
      >
        <div className="flex items-baseline gap-1.5 text-[9.5px] uppercase tracking-widest text-ink-faint">
          <span className="truncate">{seed.tipo} · N° {seed.numero}</span>
          <span className="ml-auto font-mono normal-case tracking-normal shrink-0">{seed.subtitle}</span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-balance group-hover/neigh:text-ink">
          {seed.titulo || <em className="text-ink-faint">(sin título)</em>}
        </div>
      </Link>
      {sub.length > 0 && (
        <ul className="mt-1 mb-1.5 ml-1.5 pl-2 border-l border-rule space-y-0.5">
          {sub.slice(0, 4).map(s => (
            <li key={s.modifierId}>
              <Link
                to="/ley/$numero"
                params={{ numero: String(s.modifierId) }}
                className="block text-[10.5px] text-ink-faint hover:text-ink truncate transition"
                title={s.modifierTitulo}
              >
                ↳ {s.modifierTipo} {s.modifierNumero} <span className="opacity-60">· {s.lastDate}</span>
              </Link>
            </li>
          ))}
          {sub.length > 4 && (
            <li className="text-[10px] text-ink-faint italic pl-1">+{sub.length - 4} más</li>
          )}
        </ul>
      )}
    </li>
  )
}

/** Outgoing modifications can list the same target across multiple commits.
 *  The navigator only wants one row per target, picking the most recent. */
function dedupeModifies(rows: ModificationRow[]): ModificationRow[] {
  const byId = new Map<number, ModificationRow>()
  for (const r of rows) {
    const prev = byId.get(r.idNorma)
    if (!prev || r.date > prev.date) byId.set(r.idNorma, r)
  }
  return Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
}

function ListSkeleton() {
  return (
    <ul className="space-y-1.5 animate-pulse">
      {[0, 1, 2].map(i => (
        <li key={i} className="h-8 bg-paper-sunk/60 rounded" />
      ))}
    </ul>
  )
}

