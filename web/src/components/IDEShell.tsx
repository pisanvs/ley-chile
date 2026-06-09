import type { ReactNode } from 'react'

interface Props {
  navigator?: ReactNode
  center: ReactNode
  rightRail?: ReactNode
}

export function IDEShell({ navigator, center, rightRail }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)_320px] min-h-[calc(100vh-3.5rem)]">
      <aside className="border-r border-ink/10 p-4 hidden md:block">
        {navigator ?? <Placeholder label="Navigator (Plan 5)" />}
      </aside>
      <section className="px-6 py-8 max-w-3xl mx-auto w-full">{center}</section>
      <aside className="border-l border-ink/10 p-4 hidden md:block">
        {rightRail ?? <Placeholder label="Graph + lineage (Plan 3)" />}
      </aside>
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="text-xs uppercase tracking-widest opacity-40">{label}</div>
  )
}
