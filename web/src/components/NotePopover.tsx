import { useEffect, useRef, useState } from 'react'
import { annotations } from '@/lib/annotations'

/**
 * Two modes:
 *  - View / edit an existing note: pass `noteId`.
 *  - Author a new note draft: pass `idNorma`, `slug`, `draftAnchor`.
 */
interface Props {
  noteId?: string
  idNorma?: number
  slug?: string
  draftAnchor?: number
  onClose: () => void
}

export function NotePopover({ noteId, idNorma, slug, draftAnchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const isDraft = noteId === undefined

  // Look up the active note when editing
  const note = !isDraft
    ? annotations
        .for(0, '__none__') // returns [] — we re-read below from full set
        .notes.find(n => n.id === noteId) ??
      // Fall back to reading the whole store via a lazy filter
      (() => {
        try {
          const raw = window.localStorage.getItem('lc-annotations-v1')
          if (!raw) return undefined
          const parsed = JSON.parse(raw) as { notes?: { id: string; body: string }[] }
          return parsed.notes?.find(n => n.id === noteId)
        } catch { return undefined }
      })()
    : undefined

  const [body, setBody] = useState(note?.body ?? '')

  // Dismiss on outside click + Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const onSave = () => {
    if (isDraft) {
      if (!body.trim() || idNorma == null || !slug || draftAnchor == null) {
        onClose()
        return
      }
      annotations.addNote({
        idNorma,
        slug,
        anchor: draftAnchor,
        body: body.trim(),
      })
    } else if (noteId) {
      if (!body.trim()) {
        annotations.removeNote(noteId)
      } else {
        annotations.updateNote(noteId, body.trim())
      }
    }
    onClose()
  }

  const onDelete = () => {
    if (noteId) annotations.removeNote(noteId)
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 z-40 w-72 bg-paper-raised border border-rule rounded-lg shadow-xl p-3 lc-fade-up"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-ink-faint">
          {isDraft ? 'Nueva nota' : 'Nota'}
        </span>
        <div className="flex gap-1">
          {!isDraft && (
            <button
              onClick={onDelete}
              className="text-[11px] text-ruby hover:underline"
            >
              eliminar
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[11px] text-ink-faint hover:text-ink"
          >
            ✕
          </button>
        </div>
      </div>
      <textarea
        autoFocus
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Tu nota privada (solo en este dispositivo)…"
        className="w-full h-28 bg-paper-sunk text-[13px] font-ui p-2 rounded border border-rule focus:border-indigo focus:outline-none resize-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="text-[11px] text-ink-faint px-2 py-1 hover:text-ink"
        >
          cancelar
        </button>
        <button
          onClick={onSave}
          className="text-[11px] bg-indigo text-paper px-3 py-1 rounded hover:opacity-90"
        >
          guardar
        </button>
      </div>
    </div>
  )
}
