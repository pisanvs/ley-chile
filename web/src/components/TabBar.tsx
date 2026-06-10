import { useEffect, useRef } from 'react'
import { useMatches, useNavigate } from '@tanstack/react-router'
import { tabs, useTabs, type Tab } from '@/lib/tabs'

/**
 * In-IDE horizontal tab bar. Lives in the root layout so it persists across
 * navigations. Each tab represents an (idNorma, date) pair the user wants
 * quick access to. Clicking activates (navigates URL); middle-click or the
 * × button closes; closing the active tab jumps to its right-hand neighbour.
 *
 * The active tab is whatever the URL currently points to — there's no
 * separate "activeIdx" to keep in sync.
 */
export function TabBar() {
  const open = useTabs()
  const navigate = useNavigate()
  const matches = useMatches()
  const scroller = useRef<HTMLDivElement | null>(null)

  // Figure out the active (idNorma, date) from the current route.
  const active = (() => {
    for (const m of matches) {
      const p = m.params as { numero?: string; fecha?: string }
      if (p.numero && p.fecha) {
        return { idNorma: Number(p.numero), date: p.fecha }
      }
    }
    return null
  })()

  // Scroll active tab into view on navigation.
  useEffect(() => {
    if (!active || !scroller.current) return
    const el = scroller.current.querySelector<HTMLElement>(`[data-tab-id="${active.idNorma}@${active.date}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [active?.idNorma, active?.date])

  if (open.length === 0) return null

  const onClose = (t: Tab, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const wasActive = active && active.idNorma === t.idNorma && active.date === t.date
    const idx = tabs.indexOf(t.idNorma, t.date)
    tabs.close(t.idNorma, t.date)
    if (!wasActive) return
    const next = tabs.list()
    if (next.length === 0) {
      navigate({ to: '/' })
    } else {
      const fallback = next[Math.min(idx, next.length - 1)]
      navigate({
        to: '/ley/$numero/$fecha',
        params: { numero: String(fallback.idNorma), fecha: fallback.date },
      })
    }
  }

  return (
    <div
      className="sticky top-14 z-20 bg-paper-sunk/80 backdrop-blur-md border-b border-rule"
      role="tablist"
    >
      <div
        ref={scroller}
        className="flex items-stretch overflow-x-auto scrollbar-quiet"
      >
        {open.map(t => {
          const isActive = active && t.idNorma === active.idNorma && t.date === active.date
          return (
            <button
              key={`${t.idNorma}@${t.date}`}
              data-tab-id={`${t.idNorma}@${t.date}`}
              role="tab"
              aria-selected={!!isActive}
              onClick={() =>
                navigate({
                  to: '/ley/$numero/$fecha',
                  params: { numero: String(t.idNorma), fecha: t.date },
                })
              }
              onAuxClick={e => e.button === 1 && onClose(t, e)}
              title={t.titulo || `${t.tipo} ${t.numero}`}
              className={`group/tab relative flex items-center gap-2 max-w-[260px] min-w-[120px] px-3 py-1.5 text-[12px] border-r border-rule shrink-0 transition ${
                isActive
                  ? 'bg-paper text-ink'
                  : 'bg-paper-sunk/60 text-ink-soft hover:bg-paper-sunk hover:text-ink'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 left-0 right-0 h-[2px] bg-ruby" />
              )}
              <span className="flex-1 min-w-0 text-left truncate">
                {t.titulo ? truncate(t.titulo, 36) : `${t.tipo.toUpperCase()} ${t.numero}`}
              </span>
              <span className="font-mono text-[9.5px] text-ink-faint shrink-0">
                {t.date.slice(0, 7)}
              </span>
              <span
                onClick={e => onClose(t, e)}
                className="w-4 h-4 inline-flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-paper-sunk text-[12px] leading-none shrink-0"
                title="Cerrar pestaña"
                role="button"
                aria-label="Cerrar pestaña"
              >
                ×
              </span>
            </button>
          )
        })}
        <button
          onClick={() => tabs.closeAll()}
          className="text-[10px] font-ui text-ink-faint hover:text-ruby px-3 py-1.5 ml-auto sticky right-0 bg-paper-sunk/80 backdrop-blur-md border-l border-rule"
          title="Cerrar todas las pestañas"
        >
          Cerrar todo
        </button>
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}
