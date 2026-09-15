'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { SidebarHeading } from '@/components/IDEShell'
import { fetchRawText } from '@/lib/rawtext'
import { buildOutline, countNodes, type OutlineNode } from '@/lib/outline'

/**
 * The law's own structure, in the left rail: Libro → Título → Párrafo →
 * Artículo, as the pipeline's headings describe it.
 *
 * The rail's other groups navigate *between* laws; this one navigates within
 * the one on screen, which for a code is the only tractable way in — the
 * Código Penal is 579 articles and no flat list of those is a map.
 *
 * The text comes from the same query key RedlineReader uses, so React Query
 * serves it from cache and the outline costs no extra request.
 */
export function Outline({ sha, relDir }: { sha: string; relDir: string }) {
  const q = useQuery({
    queryKey: ['rawtext', sha, relDir],
    queryFn: () => fetchRawText({ sha, relDir }),
    staleTime: Infinity,
  })

  const tree = useMemo(() => (q.data ? buildOutline(q.data) : []), [q.data])
  const active = useActiveAnchor(!!q.data)

  if (q.isLoading) {
    return (
      <section className="space-y-2">
        <SidebarHeading>Contenido</SidebarHeading>
        <ul className="space-y-1.5 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-4 bg-paper-sunk/60 rounded" />
          ))}
        </ul>
      </section>
    )
  }
  if (q.isError || tree.length === 0) return null

  return (
    <section className="space-y-2">
      <SidebarHeading>Contenido</SidebarHeading>
      <p className="text-[10px] text-ink-faint -mt-1">
        {countNodes(tree)} secciones de esta versión.
      </p>
      <Branch nodes={tree} depth={0} active={active} />
    </section>
  )
}

/**
 * Collapse anything deep by default.
 *
 * Open, a code's outline is thousands of rows and the rail becomes a second
 * document to scroll. Títulos stay open so the shape is visible at a glance;
 * the article lists under them open on demand.
 */
const OPEN_THROUGH_DEPTH = 1

function Branch({
  nodes,
  depth,
  active,
}: {
  nodes: OutlineNode[]
  depth: number
  active: string | null
}) {
  return (
    <ul className={depth > 0 ? 'ml-2 pl-2 border-l border-rule space-y-0.5' : 'space-y-0.5 -mx-1'}>
      {nodes.map((n, i) => (
        <Row key={`${n.text}:${i}`} node={n} depth={depth} active={active} />
      ))}
    </ul>
  )
}

function Row({ node, depth, active }: { node: OutlineNode; depth: number; active: string | null }) {
  const hasChildren = node.children.length > 0
  const [open, setOpen] = useState(depth < OPEN_THROUGH_DEPTH)
  const isActive = !!node.anchor && node.anchor === active

  // A structural heading is the shape of the law; an article is its content.
  // Weighting them the same makes the rail unreadable at a glance.
  const tone = node.isArticle
    ? 'text-[11.5px] text-ink-soft'
    : 'text-[11.5px] font-medium text-ink'

  return (
    <li>
      <div className="flex items-start gap-0.5">
        {hasChildren ? (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Contraer' : 'Expandir'}
            aria-expanded={open}
            className="mt-[3px] w-3.5 shrink-0 text-[9px] text-ink-faint hover:text-ink transition"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
        {node.anchor ? (
          <a
            href={`#${node.anchor}`}
            className={`block min-w-0 flex-1 rounded px-1 py-0.5 leading-snug transition ${tone} ${
              isActive ? 'bg-ink text-paper' : 'hover:bg-paper-sunk hover:text-ink'
            }`}
            title={node.text}
          >
            <span className="line-clamp-2">{node.text}</span>
          </a>
        ) : (
          <span className={`block min-w-0 flex-1 px-1 py-0.5 leading-snug ${tone}`}>
            <span className="line-clamp-2">{node.text}</span>
          </span>
        )}
      </div>
      {hasChildren && open && <Branch nodes={node.children} depth={depth + 1} active={active} />}
    </li>
  )
}

/**
 * The id of the article currently nearest the top of the reading column.
 *
 * Observed against the articles the reader has already rendered, rather than
 * tracked from scroll offsets, so it stays correct when a version change
 * replaces the whole document. `enabled` gates it until the text has arrived,
 * since there is nothing to observe before then.
 */
function useActiveAnchor(enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const nodes = document.querySelectorAll<HTMLElement>('[data-article-slug]')
    if (nodes.length === 0) return

    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id
          if (!id) continue
          if (e.isIntersecting) visible.set(id, e.boundingClientRect.top)
          else visible.delete(id)
        }
        let best: string | null = null
        let bestTop = Infinity
        for (const [id, top] of visible) {
          if (top < bestTop) {
            bestTop = top
            best = id
          }
        }
        if (best) setActive(best)
      },
      // Ignore the bottom two-thirds: the heading a reader considers "current"
      // is the one just under the top edge, not whatever else is on screen.
      { rootMargin: '0px 0px -66% 0px' },
    )
    nodes.forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [enabled])

  return active
}
