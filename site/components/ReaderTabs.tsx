'use client'

import { useState } from 'react'

/** Segmented toggle between the clean text and the redline against the previous
 *  version. Both panels are server-rendered and passed in as children; we just
 *  flip which is visible so the clean text is always in the SSR HTML for SEO. */
export function ReaderTabs({
  clean,
  redline,
}: {
  clean: React.ReactNode
  redline: React.ReactNode | null
}) {
  const [mode, setMode] = useState<'clean' | 'redline'>('clean')

  if (!redline) return <>{clean}</>

  return (
    <div>
      <div className="mb-6 inline-flex rounded-lg border border-rule bg-paper-sunk p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode('clean')}
          className={`rounded-md px-3 py-1 transition-colors ${mode === 'clean' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
        >
          Texto
        </button>
        <button
          type="button"
          onClick={() => setMode('redline')}
          className={`rounded-md px-3 py-1 transition-colors ${mode === 'redline' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
        >
          Cambios
        </button>
      </div>
      <div className={mode === 'clean' ? '' : 'hidden'}>{clean}</div>
      <div className={mode === 'redline' ? '' : 'hidden'}>{redline}</div>
    </div>
  )
}
