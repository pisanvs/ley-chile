import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchModifications, type ModificationRow } from '@/lib/modifies'
import { fetchCommits } from '@/lib/commits'
import { RedlineReader } from '@/components/RedlineReader'
import { SidebarHeading } from '@/components/IDEShell'

interface Props {
  /** idNorma of the law currently in view — the law whose impact we trace. */
  causaId: number
}

/**
 * "Impacto" panel: the dual of "Modificadores". For each norma this law
 * modified, show a collapsible card that, when expanded, renders a mini
 * redline of the change this law applied to the target. Lets you see the
 * ripple of a single modifier in-place, without juggling tabs.
 */
export function ImpactPanel({ causaId }: Props) {
  const q = useQuery({
    queryKey: ['modifies', causaId],
    queryFn: () => fetchModifications(causaId),
    staleTime: Infinity,
  })

  if (q.isLoading) return <p className="text-xs text-ink-faint">Cargando impacto…</p>
  if (q.isError) return <p className="text-xs text-ruby">No se pudo cargar.</p>
  const rows = q.data ?? []
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-ink-faint">
        Esta norma no modificó a otras — no hay impacto que trazar.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <SidebarHeading>
        Impacto en {rows.length} {rows.length === 1 ? 'norma' : 'normas'}
      </SidebarHeading>
      <p className="text-[10.5px] text-ink-faint -mt-1.5 leading-snug">
        Expandí un objetivo para ver el redline del cambio que esta norma aplicó.
      </p>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <ImpactRow key={`${r.idNorma}-${r.sha}-${i}`} row={r} />
        ))}
      </ul>
    </div>
  )
}

function ImpactRow({ row }: { row: ModificationRow }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded border border-rule bg-paper-raised/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-2.5 py-2 hover:bg-paper-sunk/60 transition rounded"
      >
        <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-widest text-ink-faint mb-0.5">
          <span className="truncate">{row.tipo} · N° {row.numero}</span>
          <span className="font-mono normal-case tracking-normal ml-auto text-ink-soft shrink-0">
            {row.date}
          </span>
          <span className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
            ›
          </span>
        </div>
        <div className="text-[12px] text-ink-soft line-clamp-2 text-balance">
          {row.titulo || <em className="text-ink-faint">(sin título)</em>}
        </div>
      </button>
      {open && (
        <div className="border-t border-rule p-2.5">
          <ImpactDiff row={row} />
          <div className="mt-2 text-right">
            <Link
              to="/ley/$numero/$fecha"
              params={{ numero: String(row.idNorma), fecha: row.date }}
              className="text-[10px] text-indigo hover:underline font-ui"
            >
              Abrir en vista completa →
            </Link>
          </div>
        </div>
      )}
    </li>
  )
}

function ImpactDiff({ row }: { row: ModificationRow }) {
  // Pull the target's commits index to find the version that comes *before*
  // the one this row points at; without that, there's nothing to diff against.
  const idx = useQuery({
    queryKey: ['commits', row.idNorma],
    queryFn: () => fetchCommits(row.idNorma),
    staleTime: Infinity,
  })

  if (idx.isLoading) {
    return <p className="text-[11px] text-ink-faint italic">Cargando contexto…</p>
  }
  if (idx.isError || !idx.data) {
    return <p className="text-[11px] text-ruby">No se pudo cargar el contexto.</p>
  }

  const commits = idx.data.commits
  const hereIdx = commits.findIndex(c => c.sha === row.sha)
  const here = hereIdx >= 0 ? commits[hereIdx] : null
  const prev = hereIdx > 0 ? commits[hereIdx - 1] : null

  if (!here) {
    return (
      <p className="text-[11px] text-ink-faint italic">
        Este commit ya no está en el índice — pudo haberse reescrito en una
        reconstrucción posterior del historial.
      </p>
    )
  }
  if (!prev) {
    return (
      <p className="text-[11px] text-ink-faint italic">
        Este cambio coincide con la publicación original — no hay versión previa
        contra la cual hacer redline.
      </p>
    )
  }

  return (
    <div className="text-[13px]">
      <RedlineReader
        idNorma={row.idNorma}
        sha={here.sha}
        prevSha={prev.sha}
        prevDate={prev.date}
        prevCausaId={here.causaId}
        relDir={idx.data.relDir}
        mode="redline"
        monospace={false}
        collapseUnchanged
      />
    </div>
  )
}
