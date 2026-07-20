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

/** Collapse thousands separators inside numbers ("19.882" → "19882") so a bare
 *  number match is reliable. */
function collapseNums(s: string): string {
  let prev = ''
  let out = s
  while (out !== prev) {
    prev = out
    out = out.replace(/(\d)\.(\d)/g, '$1$2')
  }
  return out
}

/** Strict reference: the tipo cue and the number in proximity. Rules out an
 *  incidental "artículo 5" being read as "DFL 5". */
function strictPattern(tipo: string, numero: string): RegExp | null {
  const num = numero.replace(/\D/g, '')
  const cue = TIPO_CUE[tipo]
  if (!num || !cue) return null
  return new RegExp(`${cue}[^.;:]{0,60}?n[°ºo]?\\s*${num}\\b`, 'i')
}

const fold = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Title words too generic to identify a law on their own — a modifier article
// that merely says "código" or "ley general" must not match by them.
const NAME_STOPWORDS = new Set([
  'codigo', 'ley', 'sobre', 'general', 'generales', 'normas', 'norma', 'sistema',
  'nacional', 'servicio', 'servicios', 'ministerio', 'establece', 'texto',
  'refundido', 'coordinado', 'sistematizado', 'organica', 'organico',
  'constitucional', 'materia', 'materias', 'disposiciones', 'aprueba', 'crea',
  'fija', 'estatuto', 'sector', 'publico', 'del', 'los', 'las', 'para',
])

/** Distinctive words from a target's title and common names ("aeronautico",
 *  "municipalidades") — long enough and specific enough to identify the law when
 *  a modifier article names it instead of numbering it. */
function nameTokens(titulo: string, comunes: string[]): string[] {
  const seen = new Set<string>()
  for (const src of [...comunes, titulo]) {
    for (const w of fold(src).split(/[^a-z0-9]+/)) {
      if (w.length >= 7 && !NAME_STOPWORDS.has(w)) seen.add(w)
    }
  }
  return Array.from(seen)
}

interface AlignedRow {
  article: Segment
  efectos: Efecto[]
}

/** Pair each effect with the modifier article that caused it.
 *
 *  Two passes, most confident first:
 *   1. strict — tipo cue + number in proximity ("fuerza de ley N° 5").
 *   2. fuzzy  — for still-unmatched effects on a law with a distinctive number
 *      (≥ 1000, so not confusable with an article number), the number appearing
 *      anywhere in an as-yet-unmatched article. Catches references that name the
 *      law without a clean tipo cue ("lo dispuesto en la N° 19.880").
 *  Whatever neither pass claims falls to "Otras". */
function alignEffects(
  articles: Segment[],
  efectos: Efecto[],
): { rows: AlignedRow[]; unmatched: Efecto[] } {
  const bodies = articles.map((a) => collapseNums(a.body))
  const rows: AlignedRow[] = articles.map((article) => ({ article, efectos: [] }))
  const taken = new Set<number>()

  const assign = (test: (body: string, e: Efecto) => boolean) => {
    efectos.forEach((e, ei) => {
      if (taken.has(ei)) return
      const ai = bodies.findIndex((b, i) => test(b, e) && rowFree(rows[i], e))
      if (ai >= 0) {
        rows[ai].efectos.push(e)
        taken.add(ei)
      }
    })
  }

  // Pass 1 — strict: tipo cue + number in proximity ("fuerza de ley N° 5").
  const strict = efectos.map((e) => strictPattern(e.target.tipo, e.target.numero))
  assign((body, e) => {
    const p = strict[efectos.indexOf(e)]
    return !!p && p.test(body)
  })
  // Pass 2 — number-only, for distinctive numbers (≥4 digits), matched against
  // the dot-collapsed body.
  assign((body, e) => {
    const num = e.target.numero.replace(/\D/g, '')
    return num.length >= 4 && new RegExp(`(^|\\D)${num}(\\D|$)`).test(body)
  })
  // Pass 3 — by name: laws cite a code by its name, not its number ("en el
  // artículo 193 del Código Aeronáutico"). Match a distinctive title/common-name
  // word of the target against the accent-folded article body.
  const tokens = efectos.map((e) => nameTokens(e.target.titulo, e.target.nombresUsoComun))
  const folded = bodies.map(fold)
  efectos.forEach((e, ei) => {
    if (taken.has(ei)) return
    const toks = tokens[ei]
    if (toks.length === 0) return
    const ai = folded.findIndex(
      (fb, i) => toks.some((t) => fb.includes(t)) && rowFree(rows[i], e),
    )
    if (ai >= 0) {
      rows[ai].efectos.push(e)
      taken.add(ei)
    }
  })

  const unmatched = efectos.filter((_, i) => !taken.has(i))
  return { rows, unmatched }
}

/** Don't stack two effects on one article unless it really names both — keeps a
 *  fuzzy pass from dumping several laws onto one long article. */
function rowFree(row: AlignedRow, _e: Efecto): boolean {
  return row.efectos.length < 3
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

  // Only the articles that actually change another law get a row. Showing the
  // ~130 substantive articles that modify nothing (with an empty column beside
  // them) is what made this read as broken. The full text stays one click away
  // in the Limpio / Redline modes.
  const modifying = rows.filter((r) => r.efectos.length > 0)
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
        {modifying.map((row) => (
          <div
            key={row.article.slug}
            className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-12 gap-y-4 py-7"
          >
            <ModifierArticle article={row.article} />
            <div className="space-y-6 @3xl:border-l @3xl:border-rule @3xl:pl-12">
              {row.efectos.map((e) => (
                <TargetEffect key={`${e.target.idNorma}:${e.fecha}`} efecto={e} />
              ))}
            </div>
          </div>
        ))}

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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body}</ReactMarkdown>
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
      <div className="space-y-4">
        {articles.map((a) => (
          <ArticleRedline key={`${a.slug}:${a.status}`} article={a} />
        ))}
        {more > 0 && (
          <p className="text-[12px] text-ink-faint">…y {more} artículo(s) más</p>
        )}
      </div>
    </div>
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
