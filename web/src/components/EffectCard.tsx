import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { wordDiff, joinDiffText, type Aligned } from '@/lib/diff'

interface Props {
  aligned: Aligned
  /** Display label shown in the card header (e.g. "Art. 22"). */
  artLabel: string
  /** Law name shown in the card header. */
  lawName: string
}

/**
 * Before/after diff card for one aligned article segment. Returns null for
 * unchanged segments (callers should filter those out).
 */
export function EffectCard({ aligned, artLabel, lawName }: Props) {
  if (aligned.status === 'unchanged') return null

  return (
    <div className="border border-rule rounded-lg overflow-hidden bg-paper-raised shadow-sm mb-2">
      <EffectCardHeader lawName={lawName} artLabel={artLabel} status={aligned.status} />
      <div className="grid grid-cols-2 divide-x divide-rule">
        <EffectCol side="before" aligned={aligned} />
        <EffectCol side="after"  aligned={aligned} />
      </div>
    </div>
  )
}

function EffectCardHeader({
  lawName,
  artLabel,
  status,
}: {
  lawName: string
  artLabel: string
  status: Aligned['status']
}) {
  const badge =
    status === 'added'    ? { label: 'Agregado',   cls: 'bg-moss-soft text-moss' }
    : status === 'removed'  ? { label: 'Derogado',   cls: 'bg-ruby-soft text-ruby' }
    : { label: 'Modificado', cls: 'bg-indigo-soft text-indigo' }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-paper-sunk border-b border-rule text-[9.5px] uppercase tracking-[0.07em] font-ui">
      <span className="font-semibold text-ink-soft truncate">{lawName}</span>
      {artLabel && (
        <span className="ml-auto shrink-0 text-ink-faint">{artLabel}</span>
      )}
      <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${badge.cls}`}>
        {badge.label}
      </span>
    </div>
  )
}

function EffectCol({ side, aligned }: { side: 'before' | 'after'; aligned: Aligned }) {
  const label = side === 'before' ? 'Antes' : 'Después'
  const dotCls = side === 'before' ? 'bg-ruby' : 'bg-moss'

  return (
    <div className="p-3 prose-reader text-[12px] leading-[1.7]">
      <div className="flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.09em] text-ink-faint mb-2 font-ui">
        <span className={`inline-block w-[5px] h-[5px] rounded-full ${dotCls}`} />
        {label}
      </div>
      <ColBody side={side} aligned={aligned} />
    </div>
  )
}

function ColBody({ side, aligned }: { side: 'before' | 'after'; aligned: Aligned }) {
  if (aligned.status === 'added') {
    if (side === 'before')
      return <p className="italic text-ink-faint text-[11px]">[sin texto anterior]</p>
    return (
      <div className="redline">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{aligned.curr!.body}</ReactMarkdown>
      </div>
    )
  }
  if (aligned.status === 'removed') {
    if (side === 'after')
      return <p className="italic text-ruby text-[11px]">[Inciso derogado]</p>
    return (
      <div className="line-through opacity-70">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{aligned.prev!.body}</ReactMarkdown>
      </div>
    )
  }

  // modified — word diff
  if (!aligned.prev || !aligned.curr) return null
  const ops = wordDiff(aligned.prev.body, aligned.curr.body)
  return (
    <p className="whitespace-pre-wrap redline">
      {ops.map((o, i) => {
        const text = joinDiffText(o.text)
        if (o.op === 'equal') return <span key={i}>{text}</span>
        if (side === 'before') {
          return o.op === 'delete' ? <del key={i}>{text}</del> : null
        } else {
          return o.op === 'insert' ? <ins key={i}>{text}</ins> : null
        }
      })}
    </p>
  )
}
