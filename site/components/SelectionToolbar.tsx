'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { HighlightColor } from '@/lib/annotations'

interface Props {
  rect: DOMRect
  onPickColor: (c: HighlightColor) => void
  onAddNote: () => void
  onDismiss: () => void
}

const COLORS: { id: HighlightColor; label: string; cssVar: string }[] = [
  { id: 'yellow', label: 'Resaltar amarillo', cssVar: 'var(--lc-hl-yellow)' },
  { id: 'moss', label: 'Resaltar verde', cssVar: 'var(--lc-hl-moss)' },
  { id: 'ruby', label: 'Resaltar rojo', cssVar: 'var(--lc-hl-ruby)' },
  { id: 'indigo', label: 'Resaltar azul', cssVar: 'var(--lc-hl-indigo)' },
]

export function SelectionToolbar({ rect, onPickColor, onAddNote, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Dismiss when clicking outside the toolbar
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onDismiss])

  const x = rect.left + rect.width / 2
  const y = rect.top + window.scrollY - 48

  return createPortal(
    <div
      ref={ref}
      className="fixed z-40 -translate-x-1/2 bg-paper-raised border border-rule rounded-lg shadow-lg flex items-center gap-1 p-1 lc-modal-pop"
      style={{ left: x, top: y - window.scrollY }}
      role="toolbar"
    >
      {COLORS.map(c => (
        <button
          key={c.id}
          onClick={() => onPickColor(c.id)}
          title={c.label}
          className="w-6 h-6 rounded transition hover:scale-110"
          style={{ background: c.cssVar }}
        />
      ))}
      <span className="w-px h-5 bg-rule mx-1" />
      <button
        onClick={onAddNote}
        className="text-xs px-2 py-1 hover:bg-paper-sunk rounded transition"
      >
        + Nota
      </button>
    </div>,
    document.body,
  )
}
