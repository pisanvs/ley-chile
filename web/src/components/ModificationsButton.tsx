import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchModifications, type ModificationRow } from '@/lib/modifies'
import { tabs } from '@/lib/tabs'

interface Props {
  causaId: number
  causaTitulo: string
}

/**
 * "Aperturar modificaciones" — given a modifier law, lists every other law it
 * touched (with the date of that touch), and either opens the chosen target
 * in a new tab or fans out and opens all in tabs at once.
 *
 * The data is pre-built by scripts/build_web_indexes.py into
 * `/idx/modifies/{causaId}.json`. Empty array means this law never modified
 * anything (initial publications, errata, etc.).
 */
export function ModificationsButton({ causaId, causaTitulo }: Props) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['modifies', causaId],
    queryFn: () => fetchModifications(causaId),
    staleTime: Infinity,
  })

  useEffect(() => { void q.data }, [q.data])
  const rows = q.data ?? []

  const openInTab = (row: ModificationRow, { focus }: { focus: boolean }) => {
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
      setOpen(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={q.isLoading}
        className="text-[10px] text-ink-soft hover:text-indigo border border-rule rounded px-1.5 py-0.5 transition font-ui disabled:opacity-50"
        title="Ver y abrir cada norma que esta ley modificó"
      >
        {q.isLoading ? 'Cargando…' : `Modificaciones · ${rows.length}`}
      </button>
      {open && (
        <ModificationsModal
          rows={rows}
          causaTitulo={causaTitulo}
          openInTab={openInTab}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ModificationsModal({
  rows,
  causaTitulo,
  openInTab,
  onClose,
}: {
  rows: ModificationRow[]
  causaTitulo: string
  openInTab: (row: ModificationRow, opts: { focus: boolean }) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openAllBackground = () => {
    rows.forEach(r => openInTab(r, { focus: false }))
    onClose()
  }
  const openAllAndFocusFirst = () => {
    if (rows.length === 0) return
    rows.slice(1).forEach(r => openInTab(r, { focus: false }))
    openInTab(rows[0], { focus: true })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-paper-raised border border-rule rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col lc-modal-pop"
      >
        <header className="px-5 py-4 border-b border-rule flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-ink-faint mb-1">
              Modificaciones de esta norma
            </div>
            <h2 className="font-display text-lg leading-tight text-balance">
              {causaTitulo}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink text-lg leading-none"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </header>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-ink-faint">
            Esta norma no modificó a otras.
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-rule flex items-center gap-3 bg-paper-sunk/40">
              <span className="text-xs text-ink-soft">
                {rows.length} {rows.length === 1 ? 'norma afectada' : 'normas afectadas'}
              </span>
              <button
                onClick={openAllBackground}
                className="ml-auto text-[11px] text-ink-soft hover:text-ink border border-rule rounded px-2 py-1 font-ui transition"
                title="Abrir todas en pestañas del IDE sin cambiar de vista"
              >
                Abrir en segundo plano
              </button>
              <button
                onClick={openAllAndFocusFirst}
                className="text-[11px] bg-indigo text-paper px-3 py-1 rounded hover:opacity-90 font-ui"
                title="Abrir todas y saltar a la primera"
              >
                Abrir todas →
              </button>
            </div>
            <ul className="overflow-y-auto divide-y divide-rule scrollbar-quiet">
              {rows.map((r, i) => (
                <ModificationRowItem key={i} row={r} openInTab={openInTab} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function ModificationRowItem({
  row,
  openInTab,
}: {
  row: ModificationRow
  openInTab: (row: ModificationRow, opts: { focus: boolean }) => void
}) {
  return (
    <li
      className="px-5 py-3 hover:bg-paper-sunk/60 transition group cursor-pointer"
      onClick={() => openInTab(row, { focus: true })}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-widest text-ink-faint mb-1">
            <span>{row.tipo} · N° {row.numero}</span>
            <span className="font-mono normal-case tracking-normal text-ink-soft">
              {row.date}
            </span>
          </div>
          <span className="text-sm text-ink group-hover:text-indigo line-clamp-2 text-balance">
            {row.titulo || <em className="text-ink-faint">(sin título)</em>}
          </span>
        </div>
        <button
          onClick={e => {
            e.stopPropagation()
            openInTab(row, { focus: false })
          }}
          className="shrink-0 text-[10px] text-ink-faint hover:text-ink border border-rule rounded px-2 py-1 font-ui transition"
          title="Abrir en segundo plano (sin saltar)"
        >
          Pestaña
        </button>
      </div>
    </li>
  )
}
