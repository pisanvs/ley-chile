'use client'

import { useEffect, useState } from 'react'
import { annotations, type Highlight, type Note } from '@/lib/annotations'
import type { CommitsIndex } from '@/lib/commits'

interface Props { idx: CommitsIndex }

function SidebarHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-faint font-ui">
      {children}
    </h3>
  )
}

/** Lists every highlight + note the user has saved for the active law.
 *  Clicking jumps to the article. */
export function AnnotationsList({ idx }: Props) {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const onChange = () => setVersion(v => v + 1)
    window.addEventListener('lc-annotations-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('lc-annotations-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  // Pull the full store and filter to this law.
  const all = readAll()
  const lawHighlights = all.highlights.filter(h => h.idNorma === idx.norma.idNorma)
  const lawNotes = all.notes.filter(n => n.idNorma === idx.norma.idNorma)

  if (lawHighlights.length === 0 && lawNotes.length === 0) {
    return (
      <p className="text-[11px] text-ink-faint">
        Selecciona texto en el cuerpo para resaltar o añadir una nota. Todo se
        guarda solo en este dispositivo.
      </p>
    )
  }

  void version // re-render trigger

  return (
    <div className="space-y-4">
      {lawHighlights.length > 0 && (
        <section className="space-y-2">
          <SidebarHeading>Destacados ({lawHighlights.length})</SidebarHeading>
          <ul className="space-y-1.5 text-xs">
            {lawHighlights.map(h => (
              <li key={h.id} className="flex items-start gap-2">
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ background: `var(--lc-hl-${h.color})` }}
                />
                <a
                  href={`#art-${h.slug}`}
                  className="flex-1 min-w-0 text-ink-soft hover:text-ink"
                >
                  <span className="line-clamp-2 italic">«{h.text}»</span>
                </a>
                <button
                  onClick={() => annotations.removeHighlight(h.id)}
                  className="text-[10px] text-ink-faint hover:text-ruby"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {lawNotes.length > 0 && (
        <section className="space-y-2">
          <SidebarHeading>Notas ({lawNotes.length})</SidebarHeading>
          <ul className="space-y-2 text-xs">
            {lawNotes.map(n => (
              <li key={n.id} className="border border-rule rounded p-2 bg-paper-sunk/40">
                <a
                  href={`#art-${n.slug}`}
                  className="text-[10px] text-ink-faint hover:text-indigo block mb-1"
                >
                  → {n.slug}
                </a>
                <p className="text-ink-soft whitespace-pre-wrap line-clamp-4">{n.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function readAll(): { highlights: Highlight[]; notes: Note[] } {
  if (typeof window === 'undefined') return { highlights: [], notes: [] }
  try {
    const raw = window.localStorage.getItem('lc-annotations-v1')
    if (!raw) return { highlights: [], notes: [] }
    const parsed = JSON.parse(raw) as { highlights?: Highlight[]; notes?: Note[] }
    return { highlights: parsed.highlights ?? [], notes: parsed.notes ?? [] }
  } catch {
    return { highlights: [], notes: [] }
  }
}
