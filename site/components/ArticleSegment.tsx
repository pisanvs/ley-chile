'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { annotations, type HighlightColor } from '@/lib/annotations'
import { SelectionToolbar } from '@/components/SelectionToolbar'
import { NotePopover } from '@/components/NotePopover'

type Status = 'unchanged' | 'modified' | 'added' | 'removed'

interface Props {
  idNorma: number
  slug: string
  heading: string
  status: Status
  /** Causa idNorma when this segment was modified — drives the blame badge. */
  causaId?: number
  monospace?: boolean
  children: ReactNode
}

/**
 * Wraps a single article segment with:
 *  - a stable DOM anchor (id="art-{slug}") for deep links & autoscroll
 *  - a permalink button that copies the canonical URL to clipboard
 *  - the status border (added/removed/modified/unchanged)
 *  - the blame badge linking to the causa
 *  - selection-driven highlight & note authoring (localStorage)
 *  - replay of saved highlights as inline <mark> wraps over the rendered body
 *  - a margin column on the right for note pins
 */
export function ArticleSegment({
  idNorma,
  slug,
  heading,
  status,
  causaId,
  monospace,
  children,
}: Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [version, setVersion] = useState(0) // re-render when annotations change
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [draftNoteAnchor, setDraftNoteAnchor] = useState<number | null>(null)
  const [toolbar, setToolbar] = useState<{
    rect: DOMRect
    range: { start: number; end: number; text: string }
  } | null>(null)

  // Listen for storage / custom event to refresh on changes from other components.
  useEffect(() => {
    const onChange = () => setVersion(v => v + 1)
    window.addEventListener('lc-annotations-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('lc-annotations-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const ann = annotations.for(idNorma, slug)

  // Apply highlights as inline marks after each render.
  useEffect(() => {
    if (!bodyRef.current) return
    applyHighlightMarks(bodyRef.current, ann.highlights)
  }, [ann.highlights, version, children])

  const onMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !bodyRef.current) {
      setToolbar(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!bodyRef.current.contains(range.commonAncestorContainer)) {
      setToolbar(null)
      return
    }
    const { start, end } = offsetsForRange(bodyRef.current, range)
    if (start === end) {
      setToolbar(null)
      return
    }
    const text = sel.toString().trim()
    if (!text) {
      setToolbar(null)
      return
    }
    const rect = range.getBoundingClientRect()
    setToolbar({ rect, range: { start, end, text } })
  }

  const onPickColor = (color: HighlightColor) => {
    if (!toolbar) return
    annotations.addHighlight({
      idNorma,
      slug,
      start: toolbar.range.start,
      end: toolbar.range.end,
      text: toolbar.range.text,
      color,
    })
    window.getSelection()?.removeAllRanges()
    setToolbar(null)
  }

  const onAddNote = () => {
    if (!toolbar) return
    setDraftNoteAnchor(toolbar.range.start)
    setToolbar(null)
    window.getSelection()?.removeAllRanges()
  }

  const onPermalink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#art-${slug}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // ignore
    }
  }

  const statusBorder =
    status === 'added' ? 'border-l-4 border-moss pl-4'
      : status === 'removed' ? 'border-l-4 border-ruby pl-4 opacity-70'
        : status === 'modified' ? 'border-l-2 border-ink/20 pl-4'
          : ''
  const monoBody = monospace ? 'font-mono text-[13.5px]' : ''

  return (
    <section
      id={`art-${slug}`}
      data-article-slug={slug}
      className={`relative scroll-mt-20 ${statusBorder}`}
    >
      {heading && (
        <header className="flex items-baseline gap-2 mb-2 group/header">
          <h2
            className={`font-display text-xl ${
              status === 'added' ? 'text-moss' :
              status === 'removed' ? 'text-ruby line-through' : ''
            }`}
          >
            {heading}
          </h2>
          <button
            onClick={onPermalink}
            title="Copiar enlace permanente"
            className="opacity-0 group-hover/header:opacity-100 transition text-[10px] text-ink-faint hover:text-indigo px-1.5 py-0.5 border border-rule rounded font-mono"
          >
            #
          </button>
          {causaId && causaId !== idNorma && (
            <Link
              href={`/ley/${causaId}`}
              className="ml-auto text-[10px] text-ink-faint hover:text-indigo border border-rule rounded px-1.5 py-0.5 transition shrink-0"
            >
              Modificado por →
            </Link>
          )}
        </header>
      )}

      <div className="flex gap-3">
        <div
          ref={bodyRef}
          onMouseUp={onMouseUp}
          className={`flex-1 min-w-0 ${monoBody}`}
        >
          {children}
        </div>

        {/* Note pin column */}
        {(ann.notes.length > 0 || draftNoteAnchor != null) && (
          <aside className="w-6 shrink-0 flex flex-col items-center gap-1 pt-1">
            {ann.notes.map(n => (
              <button
                key={n.id}
                onClick={() => setOpenNoteId(n.id === openNoteId ? null : n.id)}
                title="Abrir nota"
                className="w-5 h-5 rounded-full bg-gold/40 hover:bg-gold/70 border border-gold/60 transition text-[10px] font-mono"
              >
                ◆
              </button>
            ))}
            {draftNoteAnchor != null && (
              <span className="w-5 h-5 rounded-full bg-paper-sunk border border-rule animate-pulse" />
            )}
          </aside>
        )}
      </div>

      {/* Highlight counter footer */}
      {(ann.highlights.length > 0 || ann.notes.length > 0) && (
        <div className="mt-2 flex items-center gap-3 text-[10px] text-ink-faint">
          {ann.highlights.length > 0 && (
            <span>{ann.highlights.length} destacado{ann.highlights.length !== 1 && 's'}</span>
          )}
          {ann.notes.length > 0 && (
            <span>{ann.notes.length} nota{ann.notes.length !== 1 && 's'}</span>
          )}
        </div>
      )}

      {toolbar && (
        <SelectionToolbar
          rect={toolbar.rect}
          onPickColor={onPickColor}
          onAddNote={onAddNote}
          onDismiss={() => setToolbar(null)}
        />
      )}

      {openNoteId && (
        <NotePopover
          noteId={openNoteId}
          onClose={() => setOpenNoteId(null)}
        />
      )}

      {draftNoteAnchor != null && (
        <NotePopover
          idNorma={idNorma}
          slug={slug}
          draftAnchor={draftNoteAnchor}
          onClose={() => setDraftNoteAnchor(null)}
        />
      )}
    </section>
  )
}

/** Walk the container's text nodes counting code-units to map a Range to char
 *  offsets within textContent. */
function offsetsForRange(container: HTMLElement, range: Range): { start: number; end: number } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let acc = 0
  let start = -1
  let end = -1
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length
    if (node === range.startContainer) start = acc + range.startOffset
    if (node === range.endContainer) end = acc + range.endOffset
    if (start >= 0 && end >= 0) break
    acc += len
    node = walker.nextNode() as Text | null
  }
  if (start < 0) start = 0
  if (end < 0) end = acc
  if (start > end) [start, end] = [end, start]
  return { start, end }
}

/** Wrap saved highlight ranges in <mark> tags by walking text nodes. Mutates
 *  the DOM directly because reconciling highlights via React inside markdown
 *  output is hostile. Idempotent: unwraps any prior marks first. */
function applyHighlightMarks(container: HTMLElement, highlights: { start: number; end: number; color: string; id: string }[]) {
  // Unwrap previously applied marks.
  container.querySelectorAll('mark[data-lc-mark]').forEach(m => {
    const parent = m.parentNode
    if (!parent) return
    while (m.firstChild) parent.insertBefore(m.firstChild, m)
    parent.removeChild(m)
  })
  // Normalize so adjacent text nodes coalesce — important for stable offsets.
  container.normalize()

  for (const h of highlights) {
    if (h.end <= h.start) continue
    const range = rangeForOffsets(container, h.start, h.end)
    if (!range) continue
    const mark = document.createElement('mark')
    mark.dataset.lcMark = h.id
    mark.dataset.lcColor = h.color
    mark.style.background = `var(--lc-hl-${h.color}, transparent)`
    mark.style.padding = '0 2px'
    mark.style.borderRadius = '2px'
    try {
      range.surroundContents(mark)
    } catch {
      // Range spans multiple element boundaries — extract & wrap manually
      const frag = range.extractContents()
      mark.appendChild(frag)
      range.insertNode(mark)
    }
  }
}

function rangeForOffsets(container: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let acc = 0
  let startNode: Text | null = null, startOff = 0
  let endNode: Text | null = null, endOff = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length
    if (!startNode && acc + len >= start) {
      startNode = node
      startOff = start - acc
    }
    if (!endNode && acc + len >= end) {
      endNode = node
      endOff = end - acc
      break
    }
    acc += len
    node = walker.nextNode() as Text | null
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOff)
  range.setEnd(endNode, endOff)
  return range
}
