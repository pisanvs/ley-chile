import { alignArticles, wordDiff, joinDiffText, diffCounts, type Aligned } from '@/lib/diff'
import type { Article } from '@/lib/norma'

/** Inline word-level redline of one modified article. */
function ModifiedBody({ prev, curr }: { prev: string; curr: string }) {
  const ops = wordDiff(prev, curr)
  return (
    <p className="whitespace-pre-wrap">
      {ops.map((o, i) => {
        const text = joinDiffText(o.text)
        if (o.op === 'insert') return <ins key={i}>{text}</ins>
        if (o.op === 'delete') return <del key={i}>{text}</del>
        return <span key={i}>{text}</span>
      })}
    </p>
  )
}

function Segment({ a }: { a: Aligned }) {
  const art = a.curr ?? a.prev!
  const anchor = `art-${art.slug}`
  const border =
    a.status === 'added' ? 'border-l-4 border-moss pl-4'
    : a.status === 'removed' ? 'border-l-4 border-ruby pl-4 opacity-80'
    : a.status === 'modified' ? 'border-l-2 border-ink/20 pl-4'
    : 'pl-4'
  const headingCls =
    a.status === 'added' ? 'text-moss'
    : a.status === 'removed' ? 'text-ruby line-through'
    : 'text-ink'

  return (
    <section id={anchor} className={`scroll-mt-24 ${border}`}>
      {art.rawHeading && (
        <h2 className={`font-display text-xl font-semibold ${headingCls}`}>{art.rawHeading}</h2>
      )}
      <div className="prose-reader redline mt-1 font-body text-[15.5px] leading-relaxed">
        {a.status === 'modified' && a.prev && a.curr ? (
          <ModifiedBody prev={a.prev.body} curr={a.curr.body} />
        ) : a.status === 'added' ? (
          <p className="whitespace-pre-wrap"><ins>{art.body}</ins></p>
        ) : a.status === 'removed' ? (
          <p className="whitespace-pre-wrap"><del>{art.body}</del></p>
        ) : (
          <p className="whitespace-pre-wrap text-ink-soft">{art.body}</p>
        )}
      </div>
    </section>
  )
}

/** Redline of a version against its predecessor. Pure server render. */
export function RedlineView({ prev, curr }: { prev: Article[]; curr: Article[] }) {
  const aligned = alignArticles(prev, curr)
  const counts = diffCounts(aligned)
  const nothing = counts.modified + counts.added + counts.removed === 0

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {nothing && <span className="rounded-full bg-paper-sunk px-2.5 py-1 text-ink-faint">Sin cambios de texto</span>}
        {counts.modified > 0 && <span className="rounded-full bg-indigo-soft px-2.5 py-1 text-indigo">{counts.modified} modificados</span>}
        {counts.added > 0 && <span className="rounded-full bg-moss-soft px-2.5 py-1 text-moss">{counts.added} añadidos</span>}
        {counts.removed > 0 && <span className="rounded-full bg-ruby-soft px-2.5 py-1 text-ruby">{counts.removed} eliminados</span>}
      </div>
      <div className="space-y-8">
        {aligned.map((a, i) => <Segment key={`${(a.curr ?? a.prev!).slug}-${i}`} a={a} />)}
      </div>
    </div>
  )
}
