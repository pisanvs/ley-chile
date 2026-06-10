import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { fetchModifiedBy, type ModifierRow } from '@/lib/modifiedBy'
import { SidebarHeading } from '@/components/IDEShell'

interface Props {
  /** idNorma of the law currently in view (the modified target). */
  targetId: number
}

/**
 * Right-rail panel: lists every law that has modified the one in view,
 * deduped to one row per modifier with first/last touch dates and a count.
 *
 * Two click targets per row:
 *   - The row itself: open the *modifier* law in a tab and jump there.
 *   - "ver cambio →": stay in the current law, jump to the in-history date
 *     when that modifier touched it (most-recent touch).
 */
export function ModifiedByPanel({ targetId }: Props) {
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['modified_by', targetId],
    queryFn: () => fetchModifiedBy(targetId),
    staleTime: Infinity,
  })

  if (q.isLoading) {
    return <p className="text-xs text-ink-faint">Cargando modificadores…</p>
  }
  if (q.isError) {
    return <p className="text-xs text-ruby">No se pudo cargar el índice.</p>
  }
  const rows = q.data ?? []
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-ink-faint">
        Ninguna otra norma ha modificado a ésta.
      </p>
    )
  }

  // The modifier's own publication date isn't in the row payload, so we route
  // to the bare /ley/:numero — `ley.$numero.index.tsx` redirects to that law's
  // latest version, and the new IDE route registers the tab on mount.
  const openModifier = (row: ModifierRow) => {
    navigate({
      to: '/ley/$numero',
      params: { numero: String(row.modifierId) },
    })
  }

  const jumpToTouchHere = (row: ModifierRow) => {
    const date = row.touchedDates[row.touchedDates.length - 1] ?? row.lastDate
    navigate({
      to: '/ley/$numero/$fecha',
      params: { numero: String(targetId), fecha: date },
    })
  }

  return (
    <div className="space-y-3">
      <SidebarHeading>
        {rows.length} {rows.length === 1 ? 'modificador' : 'modificadores'}
      </SidebarHeading>
      <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto scrollbar-quiet pr-1 -mr-1">
        {rows.map(r => (
          <ModifierRowItem
            key={r.modifierId}
            row={r}
            openModifier={openModifier}
            jumpToTouchHere={jumpToTouchHere}
          />
        ))}
      </ul>
    </div>
  )
}

function ModifierRowItem({
  row,
  openModifier,
  jumpToTouchHere,
}: {
  row: ModifierRow
  openModifier: (row: ModifierRow) => void
  jumpToTouchHere: (row: ModifierRow) => void
}) {
  const range =
    row.firstDate === row.lastDate
      ? row.lastDate
      : `${row.firstDate} — ${row.lastDate}`
  return (
    <li
      onClick={() => openModifier(row)}
      className="group cursor-pointer rounded border border-transparent hover:border-rule hover:bg-paper-sunk/60 transition px-2 py-1.5"
      title="Abrir norma modificadora en pestaña activa"
    >
      <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-widest text-ink-faint mb-0.5">
        <span className="truncate">
          {row.modifierTipo} · N° {row.modifierNumero}
        </span>
        {row.count > 1 && (
          <span className="ml-auto shrink-0 px-1 rounded bg-paper-sunk text-ink-soft normal-case tracking-normal">
            ×{row.count}
          </span>
        )}
      </div>
      <div className="text-[12px] text-ink-soft group-hover:text-ink line-clamp-2 text-balance">
        {row.modifierTitulo || <em className="text-ink-faint">(sin título)</em>}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-ink-faint">{range}</span>
        <button
          onClick={e => {
            e.stopPropagation()
            jumpToTouchHere(row)
          }}
          className="text-[10px] text-ink-faint opacity-0 group-hover:opacity-100 hover:text-indigo transition"
          title="Saltar a la versión donde este modificador tocó esta ley"
        >
          ver cambio →
        </button>
      </div>
    </li>
  )
}
