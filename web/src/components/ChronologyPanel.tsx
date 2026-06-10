import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { computeChronology, type SlugEvent } from '@/lib/blame'
import type { CommitsIndex } from '@/lib/commits'
import { SidebarHeading } from '@/components/IDEShell'

interface Props {
  idx: CommitsIndex
  /** Slug the user is currently viewing — auto-select in the picker. */
  activeSlug?: string | null
}

/**
 * Right-rail panel: "show me the full history of one article". Lazy-loads all
 * versions of the law, walks them, and emits a per-article event log.
 */
export function ChronologyPanel({ idx, activeSlug }: Props) {
  const [picked, setPicked] = useState<string | null>(activeSlug ?? null)
  const q = useQuery({
    queryKey: ['chronology', idx.norma.idNorma],
    queryFn: () => computeChronology({ commits: idx.commits, relDir: idx.relDir }),
    staleTime: Infinity,
  })

  if (q.isLoading) return <p className="text-xs text-ink-faint">Calculando…</p>
  if (q.isError) return <p className="text-xs text-ruby">No se pudo calcular.</p>
  const chronology = q.data ?? {}
  const slugs = Object.keys(chronology).sort()

  return (
    <div className="space-y-4">
      <SidebarHeading>Cronología por artículo</SidebarHeading>
      <select
        value={picked ?? ''}
        onChange={e => setPicked(e.target.value || null)}
        className="w-full bg-paper-sunk border border-rule rounded px-2 py-1 text-xs font-mono"
      >
        <option value="">Elige un artículo…</option>
        {slugs.map(s => (
          <option key={s} value={s}>
            {prettySlug(s)} ({chronology[s].length})
          </option>
        ))}
      </select>
      {picked && (
        <ol className="space-y-2 text-xs">
          {chronology[picked].map((ev, i) => (
            <EventRow key={i} ev={ev} idNorma={idx.norma.idNorma} />
          ))}
        </ol>
      )}
      {!picked && (
        <p className="text-[11px] text-ink-faint">
          Elige un artículo para ver cada commit que lo tocó.
        </p>
      )}
    </div>
  )
}

function EventRow({ ev, idNorma }: { ev: SlugEvent; idNorma: number }) {
  const colorByKind = {
    introduced: 'text-moss',
    modified: 'text-ink-soft',
    removed: 'text-ruby line-through',
  }[ev.kind]
  return (
    <li className="flex items-baseline gap-2">
      <Link
        to="/ley/$numero/$fecha"
        params={{ numero: String(idNorma), fecha: ev.date }}
        className={`font-mono hover:underline ${colorByKind}`}
      >
        {ev.date}
      </Link>
      <span className="text-ink-faint">{ev.kind}</span>
      {ev.causaId !== idNorma && (
        <Link
          to="/ley/$numero"
          params={{ numero: String(ev.causaId) }}
          className="ml-auto text-[10px] text-ink-faint hover:text-indigo"
        >
          causa →
        </Link>
      )}
    </li>
  )
}

function prettySlug(s: string): string {
  if (s === 'doc') return 'documento'
  if (s === 'preambulo') return 'preámbulo'
  if (s.startsWith('art-')) {
    const rest = s.slice(4)
    return `Art. ${rest.replace(/-/g, ' ')}`
  }
  return s
}
