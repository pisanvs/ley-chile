import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchRawText } from '@/lib/rawtext'
import { segment, align, wordDiff, joinDiffText, type Aligned } from '@/lib/diff'
import { ArticleSegment } from '@/components/ArticleSegment'

export type ReaderViewMode = 'redline' | 'clean' | 'source' | 'side-by-side'

interface Props {
  idNorma: number
  sha: string
  prevSha: string | null
  prevDate: string | null
  prevCausaId: number
  relDir: string
  mode: ReaderViewMode
  monospace: boolean
  collapseUnchanged: boolean
}

export function RedlineReader(props: Props) {
  const { idNorma, sha, prevSha, prevDate, prevCausaId, relDir, mode } = props
  const curr = useQuery({
    queryKey: ['rawtext', sha, relDir],
    queryFn: () => fetchRawText({ sha, relDir }),
    staleTime: Infinity,
  })
  const prev = useQuery({
    queryKey: ['rawtext', prevSha ?? 'none', relDir],
    queryFn: () => fetchRawText({ sha: prevSha!, relDir }),
    staleTime: Infinity,
    enabled: !!prevSha,
  })

  if (curr.isLoading) return <Loader />
  if (curr.isError) return <ErrorBox label="No se pudo cargar el texto." />
  const currText = curr.data!

  if (mode === 'source') return <SourceView text={currText} monospace={props.monospace} />
  if (mode === 'clean' || !prevSha) {
    return (
      <CleanView
        idNorma={idNorma}
        text={currText}
        monospace={props.monospace}
      />
    )
  }

  if (prev.isLoading) return <Loader />
  if (prev.isError) return <ErrorBox label="No se pudo cargar la versión anterior." />

  if (mode === 'side-by-side') {
    return (
      <SideBySideView
        idNorma={idNorma}
        prevText={prev.data!}
        currText={currText}
        prevDate={prevDate}
        prevCausaId={prevCausaId}
        monospace={props.monospace}
        collapseUnchanged={props.collapseUnchanged}
      />
    )
  }

  return (
    <RedlineView
      idNorma={idNorma}
      prevText={prev.data!}
      currText={currText}
      prevCausaId={prevCausaId}
      monospace={props.monospace}
      collapseUnchanged={props.collapseUnchanged}
    />
  )
}

function CleanView({
  idNorma,
  text,
  monospace,
}: {
  idNorma: number
  text: string
  monospace: boolean
}) {
  const segments = useMemo(() => segment(text), [text])
  return (
    <article
      className={`prose-reader leading-relaxed text-[15.5px] space-y-2 ${
        monospace ? 'font-mono text-[13.5px]' : ''
      }`}
    >
      {segments.map(s => (
        <ArticleSegment
          key={s.slug}
          idNorma={idNorma}
          slug={s.slug}
          heading={s.rawHeading}
          status="unchanged"
          monospace={monospace}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {s.body}
          </ReactMarkdown>
        </ArticleSegment>
      ))}
    </article>
  )
}

function SourceView({ text, monospace }: { text: string; monospace: boolean }) {
  return (
    <pre
      className={`font-mono leading-relaxed bg-paper-sunk p-5 rounded-md whitespace-pre-wrap border border-rule ${
        monospace ? 'text-[13px]' : 'text-[12.5px]'
      }`}
    >
      {text}
    </pre>
  )
}

function RedlineView({
  idNorma,
  prevText,
  currText,
  prevCausaId,
  monospace,
  collapseUnchanged,
}: {
  idNorma: number
  prevText: string
  currText: string
  prevCausaId: number
  monospace: boolean
  collapseUnchanged: boolean
}) {
  const aligned = useMemo(() => align(segment(prevText), segment(currText)), [prevText, currText])
  const wrapperRef = useFirstDiffAutoScroll(aligned)

  return (
    <article
      ref={wrapperRef}
      className={`prose-reader redline leading-relaxed text-[15.5px] space-y-6 ${
        monospace ? 'font-mono text-[13.5px]' : ''
      }`}
    >
      <DiffSummary aligned={aligned} />
      <CollapsibleSegmentList
        aligned={aligned}
        idNorma={idNorma}
        prevCausaId={prevCausaId}
        monospace={monospace}
        collapseUnchanged={collapseUnchanged}
        render={a => <RedlineSegment aligned={a} idNorma={idNorma} prevCausaId={prevCausaId} monospace={monospace} />}
      />
    </article>
  )
}

function SideBySideView({
  idNorma,
  prevText,
  currText,
  prevDate,
  prevCausaId,
  monospace,
  collapseUnchanged,
}: {
  idNorma: number
  prevText: string
  currText: string
  prevDate: string | null
  prevCausaId: number
  monospace: boolean
  collapseUnchanged: boolean
}) {
  const aligned = useMemo(() => align(segment(prevText), segment(currText)), [prevText, currText])
  const wrapperRef = useFirstDiffAutoScroll(aligned)

  return (
    <article ref={wrapperRef} className="redline">
      <DiffSummary aligned={aligned} />
      <div className="grid grid-cols-2 gap-4 mt-4 text-[13.5px] leading-relaxed">
        <div className="text-[10px] uppercase tracking-widest text-ink-faint pb-2 border-b border-rule">
          Antes {prevDate && <span>· {prevDate}</span>}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-ink-faint pb-2 border-b border-rule">
          Después
        </div>
      </div>
      <CollapsibleSegmentList
        aligned={aligned}
        idNorma={idNorma}
        prevCausaId={prevCausaId}
        monospace={monospace}
        collapseUnchanged={collapseUnchanged}
        render={a => (
          <div className={`grid grid-cols-2 gap-4 ${monospace ? 'font-mono' : 'prose-reader'} text-[13.5px] leading-relaxed`}>
            <SideBySidePane side="prev" aligned={a} />
            <SideBySidePane side="curr" aligned={a} />
          </div>
        )}
      />
    </article>
  )
}

function SideBySidePane({ side, aligned }: { side: 'prev' | 'curr'; aligned: Aligned }) {
  if (aligned.status === 'unchanged' && aligned.curr) {
    return (
      <div className="border-l-2 border-rule pl-3 prose-reader opacity-70">
        {aligned.curr.rawHeading && <h3 className="font-display text-lg mb-1">{aligned.curr.rawHeading}</h3>}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {aligned.curr.body}
        </ReactMarkdown>
      </div>
    )
  }
  if (aligned.status === 'added') {
    if (side === 'prev') return <div className="opacity-40 italic text-sm border-l-2 border-rule pl-3">— sin contraparte —</div>
    return (
      <div className="border-l-4 border-moss bg-moss-soft/40 pl-3 py-1 prose-reader">
        {aligned.curr!.rawHeading && <h3 className="font-display text-lg mb-1 text-moss">{aligned.curr!.rawHeading}</h3>}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {aligned.curr!.body}
        </ReactMarkdown>
      </div>
    )
  }
  if (aligned.status === 'removed') {
    if (side === 'curr') return <div className="opacity-40 italic text-sm border-l-2 border-rule pl-3">— eliminado —</div>
    return (
      <div className="border-l-4 border-ruby bg-ruby-soft/40 pl-3 py-1 line-through opacity-70 prose-reader">
        {aligned.prev!.rawHeading && <h3 className="font-display text-lg mb-1 text-ruby">{aligned.prev!.rawHeading}</h3>}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {aligned.prev!.body}
        </ReactMarkdown>
      </div>
    )
  }
  // modified — word-diff is inherently inline, so paragraph structure inside
  // an article body is collapsed here. The redline mode keeps full markdown
  // for added/removed segments; users who need block-level structure on
  // modified ones can switch back.
  if (!aligned.prev || !aligned.curr) return null
  const ops = wordDiff(aligned.prev.body, aligned.curr.body)
  const heading = aligned.curr.rawHeading || aligned.prev.rawHeading
  return (
    <div className="border-l-2 border-rule pl-3">
      {heading && <h3 className="font-display text-lg mb-1">{heading}</h3>}
      <p className="my-2 whitespace-pre-wrap">
        {ops.map((o, i) => {
          const text = joinDiffText(o.text)
          if (o.op === 'equal') return <span key={i}>{text}</span>
          if (side === 'prev') {
            if (o.op === 'delete') return <del key={i}>{text}</del>
            return null
          } else {
            if (o.op === 'insert') return <ins key={i}>{text}</ins>
            return null
          }
        })}
      </p>
    </div>
  )
}

function CollapsibleSegmentList({
  aligned,
  collapseUnchanged,
  render,
}: {
  aligned: Aligned[]
  idNorma: number
  prevCausaId: number
  monospace: boolean
  collapseUnchanged: boolean
  render: (a: Aligned) => React.ReactNode
}) {
  // Group consecutive unchanged segments so we can collapse them.
  const groups = useMemo(() => {
    const out: { kind: 'changed' | 'unchanged'; items: Aligned[] }[] = []
    for (const a of aligned) {
      const kind = a.status === 'unchanged' ? 'unchanged' : 'changed'
      const last = out[out.length - 1]
      if (last && last.kind === kind) last.items.push(a)
      else out.push({ kind, items: [a] })
    }
    return out
  }, [aligned])

  return (
    <>
      {groups.map((g, gi) => {
        if (g.kind === 'changed' || !collapseUnchanged) {
          return (
            <div key={gi} className="space-y-6">
              {g.items.map((a, ai) => <div key={ai}>{render(a)}</div>)}
            </div>
          )
        }
        return <CollapsedGroup key={gi} items={g.items} render={render} />
      })}
    </>
  )
}

function CollapsedGroup({
  items,
  render,
}: {
  items: Aligned[]
  render: (a: Aligned) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <div className="space-y-6">
        {items.map((a, i) => <div key={i}>{render(a)}</div>)}
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-ink-faint hover:text-ink underline underline-offset-4"
        >
          colapsar {items.length} sin cambios
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={() => setOpen(true)}
      className="block w-full text-left text-xs text-ink-faint hover:text-ink border border-dashed border-rule rounded-md py-2 px-3 transition hover:border-ink-soft"
    >
      <span className="font-ui">↕ Mostrar {items.length} {items.length === 1 ? 'sección' : 'secciones'} sin cambios</span>
    </button>
  )
}

function DiffSummary({ aligned }: { aligned: Aligned[] }) {
  const added = aligned.filter(a => a.status === 'added').length
  const removed = aligned.filter(a => a.status === 'removed').length
  const modified = aligned.filter(a => a.status === 'modified').length
  if (added + removed + modified === 0) {
    return (
      <p className="text-xs text-ink-faint border-l-2 border-rule pl-3">
        Sin cambios estructurales entre versiones.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-3 text-[11px] font-ui uppercase tracking-widest border-l-2 border-rule pl-3">
      {modified > 0 && <span><b className="text-ink">{modified}</b> modificad{modified !== 1 ? 'os' : 'o'}</span>}
      {added > 0 && <span className="text-moss">+{added} añadid{added !== 1 ? 'os' : 'o'}</span>}
      {removed > 0 && <span className="text-ruby">−{removed} eliminad{removed !== 1 ? 'os' : 'o'}</span>}
    </div>
  )
}

function RedlineSegment({
  aligned,
  idNorma,
  prevCausaId,
  monospace,
}: {
  aligned: Aligned
  idNorma: number
  prevCausaId: number
  monospace: boolean
}) {
  if (aligned.status === 'added' && aligned.curr) {
    return (
      <ArticleSegment
        idNorma={idNorma}
        slug={aligned.curr.slug}
        heading={aligned.curr.rawHeading}
        status="added"
        monospace={monospace}
      >
        <ins className="bg-moss-soft border-b-2 border-moss px-1 py-0.5 inline-block">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {aligned.curr.body}
          </ReactMarkdown>
        </ins>
      </ArticleSegment>
    )
  }
  if (aligned.status === 'removed' && aligned.prev) {
    return (
      <ArticleSegment
        idNorma={idNorma}
        slug={aligned.prev.slug}
        heading={aligned.prev.rawHeading}
        status="removed"
        monospace={monospace}
      >
        <del className="bg-ruby-soft px-1 py-0.5 inline-block">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {aligned.prev.body}
          </ReactMarkdown>
        </del>
      </ArticleSegment>
    )
  }
  if (aligned.status === 'unchanged' && aligned.curr) {
    return (
      <ArticleSegment
        idNorma={idNorma}
        slug={aligned.curr.slug}
        heading={aligned.curr.rawHeading}
        status="unchanged"
        monospace={monospace}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {aligned.curr.body}
        </ReactMarkdown>
      </ArticleSegment>
    )
  }
  if (aligned.prev && aligned.curr) {
    const ops = wordDiff(aligned.prev.body, aligned.curr.body)
    return (
      <ArticleSegment
        idNorma={idNorma}
        slug={aligned.curr.slug}
        heading={aligned.curr.rawHeading}
        status="modified"
        causaId={prevCausaId}
        monospace={monospace}
      >
        <p className="my-2 whitespace-pre-wrap">
          {ops.map((o, j) => {
            const text = joinDiffText(o.text)
            if (o.op === 'equal') return <span key={j}>{text}</span>
            if (o.op === 'insert') return <ins key={j}>{text}</ins>
            return <del key={j}>{text}</del>
          })}
        </p>
      </ArticleSegment>
    )
  }
  return null
}

function useFirstDiffAutoScroll(aligned: Aligned[]) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const first = aligned.find(a => a.status !== 'unchanged')
    if (!first) return
    const slug = (first.curr ?? first.prev)?.slug
    if (!slug) return
    requestAnimationFrame(() => {
      const node = document.getElementById(`art-${slug}`)
      if (node && ref.current) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }, [aligned])
  return ref
}

function Loader() {
  return <div className="opacity-60 text-sm">Cargando texto…</div>
}
function ErrorBox({ label }: { label: string }) {
  return <div className="text-ruby text-sm">{label}</div>
}

const mdComponents = {
  h1: (p: any) => <h1 className="font-display text-2xl mt-8 mb-3" {...p} />,
  h2: (p: any) => <h2 className="font-display text-xl mt-6 mb-2" {...p} />,
  h3: (p: any) => <h3 className="font-semibold mt-5 mb-1" {...p} />,
  p: (p: any) => <p className="my-3" {...p} />,
}
