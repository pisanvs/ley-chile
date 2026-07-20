'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { wordDiff, joinDiffText } from '@/lib/diff'
import { canonicalHref } from '@/lib/href'
import type { Efecto, EfectoArticle } from '@/lib/efectos'

const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley', dl: 'DL', dfl: 'DFL', dto: 'Decreto', cod: 'Código', res: 'Resolución',
}

/** The effects column: what this modificatoria changed, law by law. Rendered
 *  alongside the modifier's own text (see EfectosLayout). For each target law it
 *  amended: a clickable header that opens that law at the version this modifier
 *  produced, and under it every changed article as a small per-article inline
 *  redline (deletions struck in ruby, insertions in moss). */
export function EfectosColumn({ modifierId }: { modifierId: number }) {
  const q = useQuery({
    queryKey: ['efectos', modifierId],
    queryFn: async (): Promise<{ efectos: Efecto[]; truncated: boolean }> => {
      const r = await fetch(`/api/idx/efectos/${modifierId}`)
      if (!r.ok) throw new Error(`efectos ${r.status}`)
      return r.json()
    },
    staleTime: Infinity,
  })

  if (q.isLoading) return <p className="text-xs text-ink-faint">Calculando efectos…</p>
  if (q.isError) return <p className="text-xs text-ruby">No se pudieron cargar los efectos.</p>

  const { efectos = [], truncated = false } = q.data ?? {}
  if (efectos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-rule bg-paper-sunk/40 px-4 py-6 text-center">
        <p className="text-[13px] text-ink-soft leading-relaxed">
          Esta norma no modificó el articulado de otras leyes.
        </p>
        <p className="mt-1.5 text-[11px] text-ink-faint leading-relaxed">
          Las modificatorias muestran aquí, artículo por artículo, qué cambiaron en cada cuerpo legal.
        </p>
      </div>
    )
  }

  const totalArticles = efectos.reduce((n, e) => n + e.articles.length, 0)

  return (
    <div>
      <div className="flex items-baseline gap-2 pb-2 mb-3 border-b border-rule">
        <h2 className="font-display text-lg text-ink">Efectos</h2>
        <span className="text-[11px] text-ink-faint">
          {efectos.length} {efectos.length === 1 ? 'norma' : 'normas'} · {totalArticles} artículos
        </span>
      </div>
      <div className="space-y-4">
        {efectos.map((e) => (
          <TargetGroup key={`${e.target.idNorma}:${e.fecha}`} efecto={e} />
        ))}
      </div>
      {truncated && (
        <p className="mt-4 text-[11px] text-ink-faint">
          Se muestran las más recientes; esta norma modificó aún más cuerpos legales.
        </p>
      )}
    </div>
  )
}

function TargetGroup({ efecto }: { efecto: Efecto }) {
  const { target, fecha, articles, more } = efecto
  const tipo = TIPO_LABEL[target.tipo] ?? target.tipo.toUpperCase()
  return (
    <section className="rounded-lg border border-rule bg-paper-raised overflow-hidden">
      <Link
        href={canonicalHref(target, fecha)}
        className="group block px-3.5 py-2.5 border-b border-rule bg-paper-sunk/50
                   transition hover:bg-paper-sunk"
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
      <div className="redline text-[12.5px] leading-relaxed text-ink-soft max-h-52 overflow-y-auto scrollbar-quiet">
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

/** Effect cells are a preview, not the reader: cap very long articles so one
 *  bill's rewrite of a 3,000-word article doesn't dominate the column. */
function clip(s: string, n = 900): string {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + '…'
}
