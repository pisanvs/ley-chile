/** Render a law article body as paragraphs, server-side.
 *
 *  Deliberately NOT react-markdown: the reader re-segments and word-diffs this
 *  text client-side, but a guide only needs indexable prose. Splitting on blank
 *  lines and emitting <p> is dependency-free, can't execute anything from the
 *  corpus, and is exactly what a crawler wants. Article bodies carry `####`
 *  heading markers (see the /api/text contract) — strip them, the heading is
 *  already rendered by the caller from `label`.
 */
export function ArticleBody({ body, className = '' }: { body: string; className?: string }) {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#{1,6}\s*/gm, '').trim())
    .filter(Boolean)

  return (
    <div className={`prose-reader ${className}`}>
      {paras.map((p, i) => (
        <p key={i} className="text-[15px] leading-relaxed text-ink-soft">
          {p}
        </p>
      ))}
    </div>
  )
}
