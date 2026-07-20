'use client'

import { useState, type ReactNode } from 'react'

interface Props {
  navigator?: ReactNode
  center: ReactNode
  rightRail?: ReactNode
  /** Max-width of the center column's content. Defaults to a comfortable
   *  reading measure; the Efectos view passes `max-w-none` to fill the column
   *  for its two side-by-side panes. */
  centerMaxWidth?: string
}

/**
 * Three-pane layout that collapses cleanly to single-pane on mobile.
 * Rails are sticky inside the viewport; the center column scrolls.
 */
export function IDEShell({ navigator, center, rightRail, centerMaxWidth = 'max-w-3xl' }: Props) {
  const [pane, setPane] = useState<'center' | 'nav' | 'right'>('center')

  return (
    <div className="flex-1 flex flex-col">
      {/* Mobile pane toggle — appears only on small screens */}
      <div className="md:hidden border-b border-rule flex items-center text-xs uppercase tracking-widest">
        {(['nav', 'center', 'right'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPane(p)}
            className={`flex-1 py-2 transition ${
              pane === p ? 'text-ink border-b-2 border-ruby' : 'text-ink-faint'
            }`}
          >
            {p === 'nav' ? 'Índice' : p === 'right' ? 'Detalle' : 'Texto'}
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)_320px] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside
          className={`${
            pane === 'nav' ? 'block' : 'hidden'
          } md:block border-r border-rule overflow-y-auto scrollbar-quiet p-4 bg-paper-sunk/40`}
        >
          {navigator ?? <NavPlaceholder />}
        </aside>

        <section
          className={`${
            pane === 'center' ? 'block' : 'hidden'
          } md:block overflow-y-auto scrollbar-quiet`}
        >
          <div className={`px-4 md:px-10 py-8 md:py-12 ${centerMaxWidth} mx-auto w-full`}>
            {center}
          </div>
        </section>

        <aside
          className={`${
            pane === 'right' ? 'block' : 'hidden'
          } md:block border-l border-rule overflow-y-auto scrollbar-quiet p-4 bg-paper-sunk/40`}
        >
          {rightRail ?? <RightPlaceholder />}
        </aside>
      </div>
    </div>
  )
}

function NavPlaceholder() {
  return (
    <div className="space-y-3">
      <SidebarHeading>Tipos de norma</SidebarHeading>
      <ul className="space-y-1.5 text-sm">
        {['ley', 'decreto', 'dfl', 'decreto ley', 'código', 'resolución'].map(t => (
          <li key={t} className="flex items-center justify-between text-ink-soft hover:text-ink transition cursor-default">
            <span className="capitalize">{t}</span>
            <span className="text-[10px] text-ink-faint font-mono">—</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-faint pt-4 border-t border-rule">
        Navegador completo: <span className="font-mono">Plan 5</span>.
      </p>
    </div>
  )
}

function RightPlaceholder() {
  return (
    <div className="space-y-3">
      <SidebarHeading>Relaciones</SidebarHeading>
      <p className="text-xs text-ink-faint">
        Mapa de modificaciones llega en <span className="font-mono">Plan 3</span>.
      </p>
    </div>
  )
}

export function SidebarHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-faint font-ui">
      {children}
    </h3>
  )
}
