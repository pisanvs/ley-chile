import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchRawText } from '@/lib/rawtext'
import { segment, align, wordDiff, joinDiffText, type Aligned } from '@/lib/diff'

interface Props {
  /** Active version's SHA — what we render. */
  sha: string
  /** Previous version's SHA, if any. When absent, we render Clean only. */
  prevSha: string | null
  relDir: string
  /** Toggle mode. */
  mode: 'redline' | 'clean' | 'source'
}

export function RedlineReader({ sha, prevSha, relDir, mode }: Props) {
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

  if (mode === 'source') return <SourceView text={currText} />
  if (mode === 'clean' || !prevSha) return <CleanView text={currText} />

  if (prev.isLoading) return <Loader />
  if (prev.isError) return <ErrorBox label="No se pudo cargar la versión anterior." />

  return <RedlineView prevText={prev.data!} currText={currText} />
}

function CleanView({ text }: { text: string }) {
  return (
    <article className="prose-reader leading-relaxed text-[15.5px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {text}
      </ReactMarkdown>
    </article>
  )
}

function SourceView({ text }: { text: string }) {
  return (
    <pre className="font-mono text-[12.5px] leading-relaxed bg-paper-sunk p-5 rounded-md whitespace-pre-wrap border border-rule">
      {text}
    </pre>
  )
}

function RedlineView({ prevText, currText }: { prevText: string; currText: string }) {
  const aligned = useMemo(() => align(segment(prevText), segment(currText)), [prevText, currText])
  return (
    <article className="prose-reader redline leading-relaxed text-[15.5px] space-y-6">
      <RedlineSummary aligned={aligned} />
      {aligned.map((a, i) => (
        <RedlineSegment key={i} aligned={a} />
      ))}
    </article>
  )
}

function RedlineSummary({ aligned }: { aligned: Aligned[] }) {
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
      {modified > 0 && <span><b className="text-ink">{modified}</b> modificado{modified !== 1 && 's'}</span>}
      {added > 0 && <span className="text-moss">+{added} añadido{added !== 1 && 's'}</span>}
      {removed > 0 && <span className="text-ruby">−{removed} eliminado{removed !== 1 && 's'}</span>}
    </div>
  )
}

function RedlineSegment({ aligned }: { aligned: Aligned }) {
  if (aligned.status === 'added' && aligned.curr) {
    return (
      <section className="border-l-4 border-moss pl-4">
        {aligned.curr.rawHeading && (
          <h2 className="font-display text-xl mb-2 text-moss">{aligned.curr.rawHeading}</h2>
        )}
        <ins className="bg-moss-soft border-b-2 border-moss px-1 py-0.5 inline-block">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {aligned.curr.body}
          </ReactMarkdown>
        </ins>
      </section>
    )
  }
  if (aligned.status === 'removed' && aligned.prev) {
    return (
      <section className="border-l-4 border-ruby pl-4 opacity-70">
        {aligned.prev.rawHeading && (
          <h2 className="font-display text-xl mb-2 text-ruby line-through">{aligned.prev.rawHeading}</h2>
        )}
        <del className="bg-ruby-soft px-1 py-0.5 inline-block">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {aligned.prev.body}
          </ReactMarkdown>
        </del>
      </section>
    )
  }
  if (aligned.status === 'unchanged' && aligned.curr) {
    return (
      <section>
        {aligned.curr.rawHeading && (
          <h2 className="font-display text-xl mb-2">{aligned.curr.rawHeading}</h2>
        )}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {aligned.curr.body}
        </ReactMarkdown>
      </section>
    )
  }
  // modified
  if (aligned.prev && aligned.curr) {
    const ops = wordDiff(aligned.prev.body, aligned.curr.body)
    return (
      <section>
        {aligned.curr.rawHeading && (
          <h2 className="font-display text-xl mb-2">{aligned.curr.rawHeading}</h2>
        )}
        <p className="text-[15.5px] leading-relaxed">
          {ops.map((o, j) => {
            const text = joinDiffText(o.text)
            if (o.op === 'equal') return <span key={j}>{text}</span>
            if (o.op === 'insert') return <ins key={j}>{text}</ins>
            return <del key={j}>{text}</del>
          })}
        </p>
      </section>
    )
  }
  return null
}

function Loader() {
  return <div className="opacity-60 text-sm">Cargando texto…</div>
}
function ErrorBox({ label }: { label: string }) {
  return <div className="text-ruby text-sm">{label}</div>
}

// Shared markdown component overrides for both Clean + per-segment rendering.
const mdComponents = {
  h1: (p: any) => <h1 className="font-display text-2xl mt-8 mb-3" {...p} />,
  h2: (p: any) => <h2 className="font-display text-xl mt-6 mb-2" {...p} />,
  h3: (p: any) => <h3 className="font-semibold mt-5 mb-1" {...p} />,
  p: (p: any) => <p className="my-3" {...p} />,
}
