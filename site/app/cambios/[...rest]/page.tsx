import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript, legislationJsonLd, SITE, type FaqEntry } from '@/lib/jsonld'
import { cambiosHref, canonicalHref, guiaHref } from '@/lib/href'
import {
  currentFecha, getModifiedBy, getVersions, type ModLink, type Norma, type Version,
} from '@/lib/norma'
import {
  fechaLarga, getGuiaStats, normaLabel, qualifiesForCambios, qualifiesForGuia,
  resolveSeoRoute, tipoLabel,
} from '@/lib/seo'

interface Props { params: Promise<{ rest: string[] }> }

async function load(norma: Norma) {
  const versions = await getVersions(norma.idNorma)
  const modifiedBy = await getModifiedBy(norma.idNorma)
  if (!qualifiesForCambios(versions, modifiedBy.length)) return null
  const stats = await getGuiaStats(norma.idNorma)
  return {
    norma, versions, modifiedBy, stats,
    hasGuia: qualifiesForGuia(norma, stats),
    fecha: currentFecha(versions),
  }
}

function title(n: Norma): string {
  return `Qué cambió la ${normaLabel(n)}: historial de modificaciones`
}

export async function generateMetadata({ params }: Props) {
  const { rest } = await params
  const r = await resolveSeoRoute(rest, cambiosHref)
  if (r.kind !== 'render') return {}
  const data = await load(r.norma)
  if (!data) return {}
  const { norma: n, versions, modifiedBy } = data
  const t = title(n)
  const d = `La ${normaLabel(n)} ha cambiado ${versions.length} veces desde su publicación, por ${modifiedBy.length} ${modifiedBy.length === 1 ? 'norma modificadora' : 'normas modificadoras'}. Cada versión, su causa y qué texto regía en cada fecha.`
  return {
    title: t,
    description: d,
    openGraph: {
      title: t,
      description: d,
      images: [{ url: `/api/og?id=${n.idNorma}`, width: 1200, height: 630 }],
    },
    alternates: { canonical: `${SITE}${cambiosHref(n)}` },
  }
}

/** Pair each version with the norma that caused it, when that norma is in the
 *  corpus. ~1,866 causa ids are referenced but absent (the export only emits
 *  normas that have their own law_dir), so this must tolerate a miss and render
 *  the subject line alone rather than link into a 404. */
function causaFor(v: Version, modifiedBy: ModLink[]): ModLink | null {
  return modifiedBy.find((m) => m.fecha === v.desde) ?? null
}

function buildFaq(n: Norma, versions: Version[], modifiedBy: ModLink[], fecha: string): FaqEntry[] {
  const label = normaLabel(n)
  const first = versions[0]
  const latest = modifiedBy[0]
  const faq: FaqEntry[] = [
    {
      q: `¿Cuántas veces ha cambiado la ${label}?`,
      a: `El corpus registra ${versions.length} versiones del texto de la ${label}, desde la original del ${fechaLarga(first.desde)} hasta la vigente desde el ${fechaLarga(fecha)}. Los cambios provienen de ${modifiedBy.length} ${modifiedBy.length === 1 ? 'norma modificadora' : 'normas modificadoras'}.`,
    },
    {
      q: `¿Cuál es la última modificación de la ${label}?`,
      a: latest
        ? `La modificación más reciente registrada es de ${tipoLabel(latest.tipo)} ${latest.numero}, con fecha ${fechaLarga(latest.fecha)}. El texto resultante rige desde el ${fechaLarga(fecha)}.`
        : `El texto vigente rige desde el ${fechaLarga(fecha)}.`,
    },
    {
      q: `¿Cómo veo el texto de la ${label} que regía en una fecha determinada?`,
      a: `Cada versión de la ${label} tiene su propia URL con la fecha desde la que rige, y el lector permite comparar dos versiones palabra por palabra para ver exactamente qué se agregó y qué se eliminó.`,
    },
  ]
  return faq
}

// Resolve before JSX; no <Suspense>. See the reader routes.
export default async function Page({ params }: Props) {
  const { rest } = await params
  const r = await resolveSeoRoute(rest, cambiosHref)
  if (r.kind === 'notFound') notFound()
  if (r.kind === 'redirect') permanentRedirect(r.to)
  const data = await load(r.norma)
  if (!data) notFound()
  const { norma: n, versions, modifiedBy, fecha, hasGuia } = data

  const label = normaLabel(n)
  const faq = buildFaq(n, versions, modifiedBy, fecha)
  // Newest first: "what changed" is a recency question.
  const timeline = [...versions].reverse()

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(legislationJsonLd(n, fecha, versions, modifiedBy.map((m) => Number(m.numero)).filter(Number.isFinite))),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faq)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(breadcrumbJsonLd([
            { name: 'Cambios', path: '/cambios' },
            { name: label, path: cambiosHref(n) },
          ])),
        }}
      />

      <article className="px-6 md:px-12 max-w-3xl mx-auto pt-14 pb-20">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-4">
          {tipoLabel(n.tipo)} · Nº {n.numero} · Historial
        </p>
        <h1 className="font-display text-3xl md:text-[2.7rem] leading-[1.08] tracking-tight text-balance">
          Qué cambió la <span className="text-ruby">{label}</span>
        </h1>
        <p className="mt-4 font-display italic text-lg md:text-xl text-ink-soft text-balance">
          {n.titulo}
        </p>
        <p className="mt-6 text-ink-soft max-w-2xl text-[15px] leading-relaxed">
          El texto de la {label} no es uno solo. Ha cambiado {versions.length} veces desde que
          se publicó el {fechaLarga(n.fechaPublicacion)}. Abajo, cada versión con la norma que
          la causó — y un enlace al diff palabra por palabra.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {hasGuia && (
            <Link
              href={guiaHref(n)}
              className="inline-flex items-center gap-2 border border-ink/80 hover:border-ruby text-ink hover:text-ruby transition px-4 py-2.5 rounded-md text-sm"
            >
              Qué dice la {label} →
            </Link>
          )}
          <Link
            href={canonicalHref(n)}
            className="inline-flex items-center gap-2 text-sm text-indigo hover:underline px-4 py-2.5"
          >
            Abrir en el lector →
          </Link>
        </div>

        <section className="mt-14 border-t border-rule pt-10">
          <h2 className="font-display text-2xl mb-6">Línea de tiempo</h2>
          <ol className="relative border-l border-rule ml-2">
            {timeline.map((v, i) => {
              const causa = causaFor(v, modifiedBy)
              const isCurrent = v.hasta === null
              const prev = timeline[i + 1]
              return (
                <li key={v.desde} className="relative pl-6 pb-8 last:pb-0">
                  <span
                    className={`absolute -left-[4.5px] top-1.5 w-[9px] h-[9px] rounded-full ${
                      isCurrent ? 'bg-moss' : 'bg-rule'
                    }`}
                  />
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-mono text-xs text-ink-faint">{v.desde}</span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-widest text-moss">vigente</span>
                    )}
                  </div>
                  <p className="mt-1 font-display text-[1.05rem] leading-snug text-ink">
                    {v.subject || 'Versión sin causa registrada'}
                  </p>
                  {causa && (
                    <p className="mt-1 text-[13px] text-ink-soft">
                      Causada por{' '}
                      <Link href={canonicalHref(causa)} className="text-indigo hover:underline">
                        {tipoLabel(causa.tipo)} {causa.numero}
                      </Link>
                      {causa.titulo && <span className="text-ink-faint"> — {causa.titulo.slice(0, 80)}</span>}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-4 text-[12.5px]">
                    <Link href={canonicalHref(n, v.desde)} className="text-indigo hover:underline">
                      Ver texto al {v.desde} →
                    </Link>
                    {prev && (
                      <Link
                        href={canonicalHref(n, v.desde)}
                        className="text-ink-faint hover:text-ruby transition"
                      >
                        Diff contra {prev.desde} →
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="mt-14 border-t border-rule pt-10">
          <h2 className="font-display text-2xl mb-6">Preguntas frecuentes</h2>
          <div className="space-y-6">
            {faq.map((f) => (
              <div key={f.q}>
                <h3 className="font-display text-[1.05rem] leading-snug text-ink mb-1.5">{f.q}</h3>
                <p className="text-[14.5px] leading-relaxed text-ink-soft">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-rule pt-10">
          <h2 className="font-display text-2xl mb-4">Normas que han modificado la {label}</h2>
          <ul className="divide-y divide-rule">
            {modifiedBy.map((m) => (
              <li key={`${m.tipo}-${m.numero}-${m.fecha}`}>
                <Link
                  href={canonicalHref(m)}
                  className="group block py-3 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
                >
                  <div className="text-[10px] uppercase tracking-widest text-ink-faint">
                    {tipoLabel(m.tipo)} {m.numero} · {m.fecha}
                  </div>
                  <div className="text-[14px] leading-snug text-ink-soft group-hover:text-ruby transition line-clamp-2">
                    {m.titulo}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-14 border-t border-rule pt-8 text-xs text-ink-faint">
          <p>
            Texto derivado de fuentes públicas de la Biblioteca del Congreso Nacional. No es una
            fuente oficial: para efectos legales la referencia es{' '}
            <a href="https://www.leychile.cl" target="_blank" rel="noreferrer" className="hover:text-ink underline">
              leychile.cl
            </a>
            .
          </p>
        </footer>
      </article>
    </div>
  )
}
