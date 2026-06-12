import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchCommits } from '@/lib/commits'
import { fetchRawText } from '@/lib/rawtext'
import { fetchModifications, type ModificationRow } from '@/lib/modifies'
import { segment, align, type Aligned } from '@/lib/diff'
import { orderByMention, type OrderedMod } from '@/lib/effectsOrder'
import { ArticleSegment } from '@/components/ArticleSegment'
import { EffectCard } from '@/components/EffectCard'

interface Props {
  causaId: number
  sha: string
  relDir: string
}

type DisplayMode = 'split' | 'effects-only' | 'text-only'

const LABEL_PX = 44
const GROUP_GAP = 12

export function EffectsView({ causaId, sha, relDir }: Props) {
  const [mode, setMode] = useState<DisplayMode>('effects-only')
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)

  const modQ = useQuery({
    queryKey: ['modifies', causaId],
    queryFn: () => fetchModifications(causaId),
    staleTime: Infinity,
  })
  const textQ = useQuery({
    queryKey: ['rawtext', sha, relDir],
    queryFn: () => fetchRawText({ sha, relDir }),
    staleTime: Infinity,
  })

  const mods = modQ.data ?? []

  const commitQueries = useQueries({
    queries: mods.map(mod => ({
      queryKey: ['commits', mod.idNorma],
      queryFn: () => fetchCommits(mod.idNorma),
      staleTime: Infinity,
    })),
  })

  const enrichedMods = useMemo<(ModificationRow & { prevSha: string | null; affectedRelDir: string })[]>(
    () => mods.map((mod, i) => {
      const idx = commitQueries[i]?.data
      if (!idx) return { ...mod, prevSha: null, affectedRelDir: '' }
      const ci = idx.commits.findIndex(c => c.sha === mod.sha)
      return {
        ...mod,
        prevSha: ci > 0 ? idx.commits[ci - 1].sha : null,
        affectedRelDir: idx.relDir,
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mods, ...commitQueries.map(q => q.data)],
  )

  const orderedMods = useMemo<(OrderedMod & { prevSha: string | null; affectedRelDir: string })[]>(
    () => {
      if (!textQ.data) return enrichedMods.map(m => ({ ...m, artSlug: null }))
      const segs = segment(textQ.data)
      const ordered = orderByMention(mods, segs)
      return ordered.map(om => {
        const enriched = enrichedMods.find(e => e.idNorma === om.idNorma)
        return { ...om, prevSha: enriched?.prevSha ?? null, affectedRelDir: enriched?.affectedRelDir ?? '' }
      })
    },
    [mods, enrichedMods, textQ.data],
  )

  const leftRef  = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  const runAlign = useCallback(() => {
    const left  = leftRef.current
    const right = rightRef.current
    if (!left || !right) return

    let cursor = LABEL_PX

    for (const mod of orderedMods) {
      if (!mod.artSlug) continue
      const leftEl  = left.querySelector<HTMLElement>(`#art-${mod.artSlug}`)
      const groupEl = right.querySelector<HTMLElement>(`[data-group-id="${mod.idNorma}"]`)
      if (!leftEl || !groupEl) continue

      const articleTop =
        leftEl.getBoundingClientRect().top -
        left.getBoundingClientRect().top +
        left.scrollTop -
        LABEL_PX

      const desired = Math.max(cursor, articleTop)
      groupEl.style.marginTop = desired > cursor ? `${desired - cursor}px` : '0'
      cursor = desired + groupEl.offsetHeight + GROUP_GAP
    }
  }, [orderedMods])

  useEffect(() => {
    const l = leftRef.current
    const r = rightRef.current
    if (!l || !r) return
    runAlign()
    l.addEventListener('scroll', runAlign, { passive: true })
    r.addEventListener('scroll', runAlign, { passive: true })
    const ro = new ResizeObserver(runAlign)
    ro.observe(l)
    ro.observe(r)
    return () => {
      l.removeEventListener('scroll', runAlign)
      r.removeEventListener('scroll', runAlign)
      ro.disconnect()
    }
  }, [runAlign])

  const modifierText = textQ.data ?? ''
  const modifierSegs = useMemo(() => segment(modifierText), [modifierText])

  const slugToMod = useMemo(() => {
    const map = new Map<string, typeof orderedMods[0]>()
    for (const m of orderedMods) if (m.artSlug) map.set(m.artSlug, m)
    return map
  }, [orderedMods])

  const scrollToGroup = useCallback((artSlug: string) => {
    const mod = slugToMod.get(artSlug)
    if (!mod || !rightRef.current) return
    const el = rightRef.current.querySelector<HTMLElement>(`[data-group-id="${mod.idNorma}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [slugToMod])

  const scrollToArticle = useCallback((idNorma: number) => {
    const mod = orderedMods.find(m => m.idNorma === idNorma)
    if (!mod?.artSlug || !leftRef.current) return
    const el = leftRef.current.querySelector<HTMLElement>(`#art-${mod.artSlug}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [orderedMods])

  if (modQ.isLoading || textQ.isLoading) {
    return <div className="p-10 text-sm text-ink-faint">Cargando efectos…</div>
  }
  if (mods.length === 0) {
    return (
      <div className="p-10 text-sm text-ink-faint">
        Esta norma no modificó a otras.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 py-2 border-b border-rule bg-paper shrink-0">
        <ModeBtn active={mode === 'split'}        onClick={() => setMode('split')}>Texto + efectos</ModeBtn>
        <ModeBtn active={mode === 'effects-only'} onClick={() => setMode('effects-only')}>Solo efectos</ModeBtn>
        <ModeBtn active={mode === 'text-only'}    onClick={() => setMode('text-only')}>Solo texto</ModeBtn>
        <span className="ml-auto text-[10px] text-ink-faint uppercase tracking-widest font-ui">
          {mods.length} {mods.length === 1 ? 'norma afectada' : 'normas afectadas'}
        </span>
      </div>

      <div className={`flex-1 overflow-hidden grid ${
        mode === 'split'
          ? 'grid-cols-2'
          : mode === 'effects-only'
            ? 'grid-cols-[0px_1fr]'
            : 'grid-cols-[1fr_0px]'
      }`}>
        {/* Left pane — stays in DOM so grid tracks are preserved; content gated */}
        <div ref={leftRef} className="overflow-hidden overflow-y-auto scrollbar-quiet border-r-2 border-rule">
          {mode !== 'effects-only' && (
            <>
              <PaneLabel dot="indigo">Ley modificadora — texto íntegro</PaneLabel>
              <div className="px-8 pb-20 prose-reader text-[14px] leading-relaxed">
                {modifierSegs.map(s => {
                  const hasDiff = slugToMod.has(s.slug)
                  const isHovered = hoveredSlug === s.slug
                  return (
                    <div
                      key={s.slug}
                      onMouseEnter={() => {
                        setHoveredSlug(s.slug)
                        if (hasDiff) scrollToGroup(s.slug)
                      }}
                      onMouseLeave={() => setHoveredSlug(null)}
                      className={`rounded-sm transition-colors ${
                        hasDiff
                          ? isHovered
                            ? 'bg-indigo/8 cursor-pointer'
                            : 'hover:bg-indigo/5 cursor-pointer'
                          : ''
                      }`}
                    >
                      <ArticleSegment
                        idNorma={causaId}
                        slug={s.slug}
                        heading={s.rawHeading}
                        status="unchanged"
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.body}</ReactMarkdown>
                      </ArticleSegment>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Right pane — stays in DOM so grid tracks are preserved; content gated */}
        <div ref={rightRef} className="overflow-hidden overflow-y-auto scrollbar-quiet bg-paper-sunk/40">
          {mode !== 'text-only' && (
            <>
              <PaneLabel dot="moss">
                Cambios en otras normas
                <span className="ml-auto text-[9px] bg-rule rounded-full px-2 py-0.5 text-ink-soft normal-case tracking-normal">
                  {orderedMods.length}
                </span>
              </PaneLabel>
              <div className="px-4 pb-20">
                {orderedMods.map(mod => (
                  <EffectGroup
                    key={mod.idNorma}
                    mod={mod}
                    highlighted={mod.artSlug !== null && mod.artSlug === hoveredSlug}
                    onHover={() => {
                      setHoveredSlug(mod.artSlug)
                      if (mode === 'split') scrollToArticle(mod.idNorma)
                    }}
                    onLeave={() => setHoveredSlug(null)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PaneLabel({ dot, children }: { dot: 'indigo' | 'moss'; children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-inherit border-b border-rule text-[9.5px] uppercase tracking-[0.09em] font-ui text-ink-faint">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot === 'indigo' ? 'bg-indigo' : 'bg-moss'}`} />
      {children}
    </div>
  )
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] uppercase tracking-[0.06em] font-ui px-3 py-1.5 rounded transition ${
        active
          ? 'bg-paper-sunk text-ink shadow-sm border border-rule'
          : 'text-ink-faint hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function EffectGroup({
  mod,
  highlighted,
  onHover,
  onLeave,
}: {
  mod: OrderedMod & { prevSha: string | null; affectedRelDir: string }
  highlighted?: boolean
  onHover?: () => void
  onLeave?: () => void
}) {
  const currQ = useQuery({
    queryKey: ['rawtext', mod.sha, mod.affectedRelDir],
    queryFn: () => fetchRawText({ sha: mod.sha, relDir: mod.affectedRelDir }),
    staleTime: Infinity,
    enabled: !!mod.affectedRelDir,
  })
  const prevQ = useQuery({
    queryKey: ['rawtext', mod.prevSha ?? 'none', mod.affectedRelDir],
    queryFn: () => fetchRawText({ sha: mod.prevSha!, relDir: mod.affectedRelDir }),
    staleTime: Infinity,
    enabled: !!mod.prevSha && !!mod.affectedRelDir,
  })

  const aligned = useMemo<Aligned[] | null>(() => {
    if (!currQ.data) return null
    if (!mod.prevSha || !prevQ.data) {
      return segment(currQ.data).map(s => ({ status: 'added' as const, prev: null, curr: s }))
    }
    return align(segment(prevQ.data), segment(currQ.data))
  }, [currQ.data, prevQ.data, mod.prevSha])

  const changed = aligned?.filter(a => a.status !== 'unchanged') ?? []
  const lawLabel = `${mod.tipo} N° ${mod.numero}`

  return (
    <div
      data-group-id={mod.idNorma}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`mb-2 rounded transition-colors ${highlighted ? 'bg-indigo/5 ring-1 ring-inset ring-indigo/20' : ''}`}
    >
      <div className="text-[9px] uppercase tracking-[0.09em] text-ink-faint font-ui py-2.5 border-b border-rule mb-2 flex items-center gap-2">
        <span className="font-semibold text-ink-soft">{lawLabel}</span>
        {currQ.isLoading && (
          <span className="text-ink-faint">cargando…</span>
        )}
        {changed.length > 0 && (
          <span className="ml-auto bg-rule rounded-full px-1.5 py-0.5 text-ink-soft normal-case tracking-normal">
            {changed.length} {changed.length === 1 ? 'cambio' : 'cambios'}
          </span>
        )}
      </div>

      {changed.map((a, i) => (
        <EffectCard key={i} aligned={a} />
      ))}

      {changed.length === 0 && !currQ.isLoading && (
        <p className="text-[11px] text-ink-faint italic py-2">
          Sin diferencias detectadas en el texto.
        </p>
      )}
    </div>
  )
}
