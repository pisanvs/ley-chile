import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { fetchModifications, type ModificationRow } from '@/lib/modifies'
import { tabs } from '@/lib/tabs'
import { SidebarHeading } from '@/components/IDEShell'

interface Props {
  /** idNorma of the law currently in view (the modifier). */
  causaId: number
}

/**
 * Right-rail panel: lists every norma this law modified. Click a row to open
 * it as a tab in the IDE; "Abrir todas" fans them out into the tab bar.
 * Empty / loading / error states all render in-place — no modal.
 */
export function ModificationsPanel({ causaId }: Props) {
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['modifies', causaId],
    queryFn: () => fetchModifications(causaId),
    staleTime: Infinity,
  })

  if (q.isLoading) {
    return <p className="text-xs text-ink-faint">Cargando modificaciones…</p>
  }
  if (q.isError) {
    return <p className="text-xs text-ruby">No se pudo cargar el índice.</p>
  }
  const rows = q.data ?? []
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-ink-faint">
        Esta norma no modificó a otras.
      </p>
    )
  }

  const openInTab = (row: ModificationRow, focus: boolean) => {
    tabs.add({
      idNorma: row.idNorma,
      date: row.date,
      titulo: row.titulo,
      tipo: row.tipo,
      numero: row.numero,
    })
    if (focus) {
      navigate({
        to: '/ley/$numero/$fecha',
        params: { numero: String(row.idNorma), fecha: row.date },
      })
    }
  }

  const openAllBackground = () => {
    rows.forEach(r => openInTab(r, false))
  }
  const openAllAndFocusFirst = () => {
    rows.slice(1).forEach(r => openInTab(r, false))
    openInTab(rows[0], true)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SidebarHeading>{rows.length} {rows.length === 1 ? 'norma modificada' : 'normas modificadas'}</SidebarHeading>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={openAllBackground}
          className="text-[10px] text-ink-soft hover:text-ink border border-rule rounded px-2 py-1 font-ui transition"
          title="Cargar todas como pestañas sin saltar"
        >
          Abrir todas en pestañas
        </button>
        <button
          onClick={openAllAndFocusFirst}
          className="text-[10px] bg-indigo text-paper px-2 py-1 rounded hover:opacity-90 font-ui"
          title="Cargar todas y saltar a la primera"
        >
          Abrir + saltar →
        </button>
      </div>
      <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto scrollbar-quiet pr-1 -mr-1">
        {rows.map((r, i) => (
          <ModRow key={i} row={r} openInTab={openInTab} />
        ))}
      </ul>
    </div>
  )
}

function ModRow({
  row,
  openInTab,
}: {
  row: ModificationRow
  openInTab: (row: ModificationRow, focus: boolean) => void
}) {
  return (
    <li
      onClick={() => openInTab(row, true)}
      className="group cursor-pointer rounded border border-transparent hover:border-rule hover:bg-paper-sunk/60 transition px-2 py-1.5"
      title="Abrir en pestaña activa"
    >
      <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-widest text-ink-faint mb-0.5">
        <span className="truncate">{row.tipo} · N° {row.numero}</span>
        <span className="font-mono normal-case tracking-normal ml-auto text-ink-soft shrink-0">
          {row.date}
        </span>
      </div>
      <div className="text-[12px] text-ink-soft group-hover:text-ink line-clamp-2 text-balance">
        {row.titulo || <em className="text-ink-faint">(sin título)</em>}
      </div>
      <div className="mt-1 flex justify-end">
        <button
          onClick={e => {
            e.stopPropagation()
            openInTab(row, false)
          }}
          className="text-[9.5px] text-ink-faint opacity-0 group-hover:opacity-100 hover:text-ink transition"
          title="Abrir en pestaña sin saltar"
        >
          ⤴ segundo plano
        </button>
      </div>
    </li>
  )
}
