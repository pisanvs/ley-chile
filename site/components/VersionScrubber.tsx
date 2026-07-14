'use client'

import { useRouter } from 'next/navigation'
import type { Version } from '@/lib/norma'

/** Git-log-style timeline of every version as clickable ticks under the title. */
export function VersionScrubber({
  tipo,
  numero,
  versions,
  activeDesde,
  currentDesde,
}: {
  tipo: string
  numero: string
  versions: Version[]
  activeDesde: string
  currentDesde: string
}) {
  const router = useRouter()

  function go(v: Version) {
    const path =
      v.desde === currentDesde ? `/${tipo}/${numero}` : `/${tipo}/${numero}/${v.desde}`
    router.push(path)
  }

  return (
    <div className="scrollbar-quiet flex items-center gap-1 overflow-x-auto py-1">
      {versions.map((v) => {
        const active = v.desde === activeDesde
        return (
          <button
            key={v.desde}
            type="button"
            onClick={() => go(v)}
            title={`${v.desde}${v.subject ? ` — ${v.subject}` : ''}`}
            aria-label={`Versión del ${v.desde}`}
            className={
              'shrink-0 rounded-full transition-all ' +
              (active
                ? 'h-7 w-1.5 bg-indigo'
                : 'h-5 w-1.5 bg-ink-faint/40 hover:bg-indigo/60')
            }
          />
        )
      })}
    </div>
  )
}
