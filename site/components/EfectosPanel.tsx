'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { segment, wordDiff, joinDiffText, type Segment } from '@/lib/diff'
import { canonicalHref } from '@/lib/href'
import type { Efecto, EfectoArticle } from '@/lib/efectos'

const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley', dl: 'DL', dfl: 'DFL', dto: 'Decreto', cod: 'Código', res: 'Resolución',
}

// ---------------------------------------------------------------------------
// Aligning each effect to the modifier article that caused it.
//
// A Chilean modificatoria names its target inside each article: "Modifícase el
// decreto con fuerza de ley N° 5, de 1967 … en el siguiente sentido:". So the
// target (tipo, numero) can be recovered from the article text and matched to
// the effect on that same law — which is what lets the change sit next to the
// article that produced it, rather than in a flat list.
//
// Heuristic, not a parser: it requires the tipo cue and the number in
// proximity, so an incidental "artículo 5" doesn't get read as "DFL 5". What it
// cannot match (an unusual reference, a table) falls to "Otras modificaciones".
// ---------------------------------------------------------------------------

const TIPO_CUE: Record<string, string> = {
  dfl: 'fuerza de ley',
  dl: 'decreto\\s+ley',
  dto: 'decreto(?:\\s+supremo)?',
  ley: 'ley',
  cod: 'c[oó]digo',
}

function targetPattern(tipo: string, numero: string): RegExp | null {
  const num = numero.replace(/\D/g, '')
  const cue = TIPO_CUE[tipo]
  if (!num || !cue) return null
  // Allow thousands separators between digits ("19.882"); require the tipo cue,
  // then an optional "N°", then the number, within a short span.
  const dnum = num.split('').join('\\.?')
  return new RegExp(`${cue}[^.;:]{0,60}?n[°ºo]?\\s*${dnum}\\b`, 'i')
}

interface AlignedRow {
  article: Segment
  efectos: Efecto[]
}

function alignEffects(
  articles: Segment[],
  efectos: Efecto[],
): { rows: AlignedRow[]; unmatched: Efecto[] } {
  const patterns = efectos.map((e) => targetPattern(e.target.tipo, e.target.numero))
  const taken = new Set<number>()
  const rows: AlignedRow[] = articles.map((article) => {
    const matched: Efecto[] = []
    efectos.forEach((e, i) => {
      if (taken.has(i)) return
      const p = patterns[i]
      if (p && p.test(article.body)) {
        matched.push(e)
        taken.add(i)
      }
    })
    return { article, efectos: matched }
  })
  const unmatched = efectos.filter((_, i) => !taken.has(i))
  return { rows, unmatched }
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

  return (
    <div>
      <div className="flex items-baseline gap-2 pb-3 mb-5 border-b border-rule">
        <h2 className="font-display text-xl text-ink">Efectos</h2>
        {q.isLoading ? (
          <span className="text-[12px] text-ink-faint">calculando…</span>
        ) : totalEfectos > 0 ? (
          <span className="text-[12px] text-ink-faint">
            {totalEfectos} {totalEfectos === 1 ? 'norma modificada' : 'normas modificadas'} · cada cambio junto al artículo que lo causó
          </span>
        ) : (
          <span className="text-[12px] text-ink-faint">esta norma no modificó otras leyes</span>
        )}
      </div>

      <div className="space-y-6">
        {rows.map((row) => (
          <div
            key={row.article.slug}
            className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3 items-start lg:border-t lg:border-rule/60 lg:pt-5 first:border-t-0 first:pt-0"
          >
            <ModifierArticle article={row.article} highlighted={row.efectos.length > 0} />
            <div className="space-y-3">
              {row.efectos.map((e) => (
                <TargetCard key={`${e.target.idNorma}:${e.fecha}`} efecto={e} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {unmatched.length > 0 && (
        <section className="mt-10 pt-5 border-t border-rule">
          <h3 className="text-[11px] uppercase tracking-widest text-ink-faint mb-3">
            Otras modificaciones
            <span className="ml-2 normal-case tracking-normal text-ink-faint/80">
              (no vinculadas a un artículo específico)
            </span>
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {unmatched.map((e) => (
              <TargetCard key={`${e.target.idNorma}:${e.fecha}`} efecto={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ModifierArticle({ article, highlighted }: { article: Segment; highlighted: boolean }) {
  const heading = article.rawHeading
  return (
    <article className={highlighted ? '' : 'opacity-90'}>
      {heading && <h3 className="font-display text-lg mb-1.5 text-ink">{heading}</h3>}
      <div className="prose-reader leading-relaxed text-[15px] text-ink-soft">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body}</ReactMarkdown>
      </div>
    </article>
  )
}

function TargetCard({ efecto }: { efecto: Efecto }) {
  const { target, fecha, articles, more } = efecto
  const tipo = TIPO_LABEL[target.tipo] ?? target.tipo.toUpperCase()
  return (
    <section className="rounded-lg border border-rule bg-paper-raised overflow-hidden shadow-sm">
      <Link
        href={canonicalHref(target, fecha)}
        className="group block px-3.5 py-2.5 border-b border-rule bg-paper-sunk/50 transition hover:bg-paper-sunk"
        title={`Abrir ${tipo} ${target.numero} en su versión del ${fecha}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink group-hover:text-indigo transition">
            {tipo} {target.numero}
          </span>
          <span className="text-[11px] font-mono text-ink-faint shrink-0 group-hover:text-indigo transition">
            {fecha} →
          </span>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-soft line-clamp-2">{target.titulo}</p>
      </Link>
      <ul className="divide-y divide-rule/60">
        {articles.map((a) => (
          <ArticleRedlineCell key={`${a.slug}:${a.status}`} article={a} />
        ))}
        {more > 0 && (
          <li className="px-3.5 py-2 text-[11px] text-ink-faint">…y {more} artículo(s) más</li>
        )}
      </ul>
    </section>
  )
}

/** One changed article as a compact inline redline. */
function ArticleRedlineCell({ article }: { article: EfectoArticle }) {
  return (
    <li className="px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <StatusDot status={article.status} />
        <span className="text-[11px] font-medium text-ink-soft uppercase tracking-wide">
          {article.rawHeading || article.label}
        </span>
      </div>
      <div className="redline text-[12.5px] leading-relaxed text-ink-soft max-h-56 overflow-y-auto scrollbar-quiet">
        {article.status === 'added' && <ins>{clip(article.currBody)}</ins>}
        {article.status === 'removed' && <del>{clip(article.prevBody)}</del>}
        {article.status === 'modified' && <InlineRedline prev={article.prevBody} curr={article.currBody} />}
      </div>
    </li>
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
