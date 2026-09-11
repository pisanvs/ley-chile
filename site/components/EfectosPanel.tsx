'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { segment, wordDiff, joinDiffText, type Segment } from '@/lib/diff'
import { alignEffects, isWholesaleRewrite } from '@/lib/efectosAlign'
import { canonicalHref } from '@/lib/href'
import { escapeLegalMarkdown } from '@/lib/mdEscape'
import type { Efecto, EfectoArticle } from '@/lib/efectos'

const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley', dl: 'DL', dfl: 'DFL', dto: 'Decreto', cod: 'Código', res: 'Resolución',
}

/** Efectos mode: the modificatoria's own articles, with each change aligned to
 *  the article that caused it. Left, the modifier text; right, in the same row,
 *  the redline of what that article changed in its target law. */
export function EfectosAligned({ modifierId, text }: { modifierId: number; text: string }) {
  const articles = useMemo(() => segment(text), [text])
  const q = useQuery({
    queryKey: ['efectos', modifierId],
    queryFn: async (): Promise<{ efectos: Efecto[]; truncated: boolean }> => {
      const r = await fetch(`/api/idx/efectos/${modifierId}`)
      if (!r.ok) throw new Error(`efectos ${r.status}`)
      return r.json()
    },
    staleTime: Infinity,
  })

  const { rows, unmatched } = useMemo(
    () => alignEffects(articles, q.data?.efectos ?? []),
    [articles, q.data],
  )

  const totalEfectos = q.data?.efectos.length ?? 0

  if (q.isLoading) return <p className="text-sm text-ink-faint">Calculando efectos…</p>
  if (q.isError) return <p className="text-sm text-ruby">No se pudieron cargar los efectos.</p>
  if (totalEfectos === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-dashed border-rule bg-paper-sunk/40 px-6 py-10 text-center">
        <p className="text-[15px] text-ink-soft">Esta norma no modificó el articulado de otras leyes.</p>
        <p className="mt-2 text-[13px] text-ink-faint leading-relaxed">
          Las modificatorias muestran aquí, junto a cada artículo, qué cambió en el cuerpo legal que ese artículo reforma.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-baseline gap-2 pb-3 mb-2 border-b border-rule">
        <h2 className="font-display text-2xl text-ink">Efectos</h2>
        <span className="text-[13px] text-ink-faint">
          {totalEfectos} {totalEfectos === 1 ? 'norma modificada' : 'normas modificadas'} · cada cambio junto al artículo que lo causó
        </span>
      </div>

      {/* @container so the split responds to the reading column's width, not the
          viewport. Rows separated by a rule; within a row, a vertical line
          divides the modifier article (left) from what it changed (right). */}
      <div className="@container divide-y divide-rule">
        {/* Every article is rendered, in document order — including the ones
            that change nothing. Those take the full width rather than sitting
            beside an empty column, which is what made showing them read as
            broken before. Dropping them instead deleted parts of the law: a
            modificatoria's quoted insertions are emitted as articles of the
            modifier, so filtering by "has effects" truncated the text
            mid-sentence. See lib/efectosAlign. */}
        {rows.map((row, i) =>
          row.efectos.length === 0 ? (
            <div key={`${row.article.slug}:${i}`} className="py-6">
              <ModifierArticle article={row.article} />
            </div>
          ) : (
            <div
              key={`${row.article.slug}:${i}`}
              className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-12 gap-y-4 py-7"
            >
              <ModifierArticle article={row.article} />
              <div className="space-y-6 @3xl:border-l @3xl:border-rule @3xl:pl-12">
                {row.efectos.map((e) => (
                  <TargetEffect key={`${e.target.idNorma}:${e.fecha}`} efecto={e} />
                ))}
              </div>
            </div>
          ),
        )}

        {unmatched.length > 0 && (
          <section className="py-7">
            <h3 className="text-[11px] uppercase tracking-widest text-ink-faint mb-4">
              Otras modificaciones
              <span className="ml-2 normal-case tracking-normal text-ink-faint/80">
                (no vinculadas a un artículo específico)
              </span>
            </h3>
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-12 gap-y-6">
              {unmatched.map((e) => (
                <TargetEffect key={`${e.target.idNorma}:${e.fecha}`} efecto={e} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ModifierArticle({ article }: { article: Segment }) {
  const heading = article.rawHeading
  return (
    <article className="min-w-0">
      {heading && (
        <h3 className="font-display text-lg font-semibold mb-2 text-ink">{heading}</h3>
      )}
      <div className="prose-reader leading-relaxed text-[15px] text-ink-soft">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{escapeLegalMarkdown(article.body)}</ReactMarkdown>
      </div>
    </article>
  )
}

/** What one modifier article changed in its target law — borderless: a header
 *  link to the law, then the changed articles as inline redlines. */
function TargetEffect({ efecto }: { efecto: Efecto }) {
  const { target, fecha, articles, more } = efecto
  const tipo = TIPO_LABEL[target.tipo] ?? target.tipo.toUpperCase()
  return (
    <div className="min-w-0">
      <Link
        href={canonicalHref(target, fecha)}
        className="group inline-flex items-baseline gap-2 mb-2"
        title={`Abrir ${tipo} ${target.numero} en su versión del ${fecha}`}
      >
        <span className="text-[15px] font-semibold text-ink group-hover:text-indigo transition">
          {tipo} {target.numero}
        </span>
        <span className="text-[11px] font-mono text-ink-faint group-hover:text-indigo transition">
          {fecha} →
        </span>
      </Link>
      <p className="text-[12px] leading-snug text-ink-faint mb-3 line-clamp-2">{target.titulo}</p>
      {isWholesaleRewrite(efecto) ? (
        <WholesaleNotice efecto={efecto} />
      ) : (
        <div className="space-y-4">
          {articles.map((a, i) => (
            <ArticleRedline key={`${a.slug}:${a.status}:${i}`} article={a} />
          ))}
          {more > 0 && (
            <p className="text-[12px] text-ink-faint">…y {more} artículo(s) más</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Shown instead of the redlines when the diff covers nearly the whole target.
 *
 * The panel's claim is "this article changed that text", and here the corpus
 * cannot support it: the comparison version's stored text is not the text that
 * was in force on its date, so the redline would be both wrong and backwards.
 * Saying so is the honest option — silently hiding the effect would misstate
 * what the law did just as badly, in the other direction.
 */
function WholesaleNotice({ efecto }: { efecto: Efecto }) {
  const n = efecto.articles.length + efecto.more
  return (
    <details className="rounded-lg border border-dashed border-rule bg-paper-sunk/40 px-3.5 py-3">
      <summary className="cursor-pointer text-[12.5px] text-ink-soft marker:text-ink-faint">
        Texto completo re-transcrito ({n} artículos)
      </summary>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
        La versión anterior guardada en el corpus no corresponde al texto vigente en esa fecha, así
        que la comparación marca casi todos los artículos como modificados. No refleja lo que esta
        norma cambió. Para ver el cambio real, abre la norma y compara sus versiones.
      </p>
      <div className="mt-3 space-y-4 opacity-60">
        {efecto.articles.slice(0, 3).map((a, i) => (
          <ArticleRedline key={`${a.slug}:${a.status}:${i}`} article={a} />
        ))}
      </div>
    </details>
  )
}

/** One changed article of the target law, as an inline redline. */
function ArticleRedline({ article }: { article: EfectoArticle }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <StatusDot status={article.status} />
        <span className="text-[11px] font-medium text-ink-soft uppercase tracking-wide">
          {article.rawHeading || article.label}
        </span>
      </div>
      <div className="redline text-[13.5px] leading-relaxed text-ink-soft">
        {article.status === 'added' && <ins>{clip(article.currBody)}</ins>}
        {article.status === 'removed' && <del>{clip(article.prevBody)}</del>}
        {article.status === 'modified' && <InlineRedline prev={article.prevBody} curr={article.currBody} />}
      </div>
    </div>
  )
}

function InlineRedline({ prev, curr }: { prev: string; curr: string }) {
  const ops = wordDiff(prev, curr)
  return (
    <>
      {ops.map((o, i) => {
        const text = joinDiffText(o.text)
        if (o.op === 'equal') return <span key={i}>{text}</span>
        if (o.op === 'delete') return <del key={i}>{text}</del>
        return <ins key={i}>{text}</ins>
      })}
    </>
  )
}

function StatusDot({ status }: { status: EfectoArticle['status'] }) {
  const cfg = {
    modified: { c: 'bg-indigo', t: 'modificado' },
    added: { c: 'bg-moss', t: 'añadido' },
    removed: { c: 'bg-ruby', t: 'eliminado' },
  }[status]
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.c}`} title={cfg.t} aria-hidden />
}

function clip(s: string, n = 900): string {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + '…'
}
