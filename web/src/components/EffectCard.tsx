import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { wordDiff, joinDiffText, type Aligned } from '@/lib/diff'

interface Props {
  aligned: Aligned
}

export function EffectCard({ aligned }: Props) {
  if (aligned.status === 'unchanged') return null

  if (aligned.status === 'added') {
    return (
      <div className="border-l-4 border-moss pl-3 py-1.5 mb-2 prose-reader text-[14px]">
        {aligned.curr!.rawHeading && (
          <h3 className="font-display text-base mb-1 text-moss">{aligned.curr!.rawHeading}</h3>
        )}
        <ins className="bg-moss-soft border-b-2 border-moss px-1 py-0.5 not-italic">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aligned.curr!.body}</ReactMarkdown>
        </ins>
      </div>
    )
  }

  if (aligned.status === 'removed') {
    return (
      <div className="border-l-4 border-ruby pl-3 py-1.5 mb-2 prose-reader text-[14px] opacity-70">
        {aligned.prev!.rawHeading && (
          <h3 className="font-display text-base mb-1 text-ruby">{aligned.prev!.rawHeading}</h3>
        )}
        <del className="bg-ruby-soft px-1 py-0.5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aligned.prev!.body}</ReactMarkdown>
        </del>
      </div>
    )
  }

  // modified — inline word diff matching the redline reader format
  if (!aligned.prev || !aligned.curr) return null
  const ops = wordDiff(aligned.prev.body, aligned.curr.body)
  const heading = aligned.curr.rawHeading || aligned.prev.rawHeading
  return (
    <div className="border-l-2 border-indigo/40 pl-3 py-1.5 mb-2 text-[14px]">
      {heading && <h3 className="font-display text-base mb-1">{heading}</h3>}
      <p className="whitespace-pre-wrap leading-relaxed">
        {ops.map((o, i) => {
          const text = joinDiffText(o.text)
          if (o.op === 'equal') return <span key={i}>{text}</span>
          if (o.op === 'insert') return <ins key={i}>{text}</ins>
          return <del key={i}>{text}</del>
        })}
      </p>
    </div>
  )
}
