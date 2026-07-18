import Link from 'next/link'
import { notFound } from 'next/navigation'
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript, legislationJsonLd, SITE, type FaqEntry } from '@/lib/jsonld'
import { canonicalHref } from '@/lib/href'
import {
  currentFecha, getModifiedBy, getModifies, getVersions,
  type ModLink, type Norma, type Version,
} from '@/lib/norma'
import {
  fechaLarga, getGuiaArticles, getGuiaStats, getSeoNorma, normaLabel,
  qualifiesForCambios, qualifiesForGuia, tipoLabel,
} from '@/lib/seo'
import { ArticleBody } from '@/components/seo/Prose'

interface Props { params: Promise<{ tipo: string; numero: string }> }

/** Everything a guide needs, resolved in one place so both generateMetadata and
 *  the page apply the identical gate — a page that 404s must not emit metadata
 *  claiming it exists. */
async function load(tipo: string, numero: string) {
  const norma = await getSeoNorma(tipo, numero)
  if (!norma) return null
  const stats = await getGuiaStats(norma.idNorma)
  if (!qualifiesForGuia(norma, stats)) return null
  const versions = await getVersions(norma.idNorma)
  if (versions.length === 0) return null
  const fecha = currentFecha(versions)
  const [articles, modifies, modifiedBy] = await Promise.all([
    getGuiaArticles(norma.idNorma, fecha),
    getModifies(norma.idNorma),
    getModifiedBy(norma.idNorma),
  ])
  return { norma, stats, versions, fecha, articles, modifies, modifiedBy }
}

function title(n: Norma): string {
  return `Qué dice la ${normaLabel(n)}: resumen, artículos y versiones`
}

function description(n: Norma, versions: Version[]): string {
  const v = versions.length > 1 ? `${versions.length} versiones` : 'texto vigente'
  return `${normaLabel(n)}: ${n.titulo.slice(0, 90)}. Publicada el ${fechaLarga(n.fechaPublicacion)} — ${v}, articulado completo e historial de modificaciones.`
}

export async function generateMetadata({ params }: Props) {
  const { tipo, numero } = await params
  const data = await load(tipo, numero)
  if (!data) return {}
  const t = title(data.norma)
  const d = description(data.norma, data.versions)
  return {
    title: t,
    description: d,
    openGraph: { title: t, description: d },
    alternates: { canonical: `${SITE}/guia/${tipo}/${encodeURIComponent(numero)}` },
  }
}

/** Answers built ONLY from corpus facts. Nothing here characterises what the law
 *  means — that would be inventing legal claims from a metadata row. */
function buildFaq(
  n: Norma, versions: Version[], fecha: string, modifies: number, modifiedBy: number,
): FaqEntry[] {
  const label = normaLabel(n)
  const faq: FaqEntry[] = [
    {
      q: `¿Qué es la ${label}?`,
      a: `${label} — «${n.titulo}». Fue publicada el ${fechaLarga(n.fechaPublicacion)}${n.organismo ? ` por ${n.organismo}` : ''}.`,
    },
    {
      q: `¿Desde cuándo rige el texto actual de la ${label}?`,
      a: versions.length > 1
        ? `El texto que se muestra rige desde el ${fechaLarga(fecha)}. Es la última de ${versions.length} versiones registradas desde su publicación.`
        : `El corpus registra una sola versión, vigente desde el ${fechaLarga(fecha)}: el texto no ha cambiado desde entonces.`,
    },
    {
      q: `¿La ${label} sigue vigente?`,
      a: n.derogado
        ? `No. La ${label} figura como derogada en el corpus. Su texto sigue disponible en la versión que estuvo vigente hasta su derogación.`
        : `Sí. La ${label} no figura como derogada. La última versión registrada rige desde el ${fechaLarga(fecha)}.`,
    },
  ]
  if (modifiedBy > 0) {
    faq.push({
      q: `¿Cuántas veces se ha modificado la ${label}?`,
      a: `El corpus registra ${modifiedBy} ${modifiedBy === 1 ? 'norma que la ha modificado' : 'normas que la han modificado'}, que producen ${versions.length} ${versions.length === 1 ? 'versión' : 'versiones'} de su texto.`,
    })
  }
  if (modifies > 0) {
    faq.push({
      q: `¿Qué otras normas modifica la ${label}?`,
      a: `Modifica ${modifies} ${modifies === 1 ? 'cuerpo legal' : 'cuerpos legales'}. En una ley modificatoria el efecto real se lee en la norma modificada, no en su propio texto.`,
    })
  }
  return faq
}

// Resolve BEFORE returning JSX and never wrap this in <Suspense>: streaming a
// shell commits HTTP 200, after which notFound() cannot set the status, and
// every miss becomes a soft-404. Same rule as the reader routes.
export default async function Page({ params }: Props) {
  const { tipo, numero } = await params
  const data = await load(tipo, numero)
  if (!data) notFound()
  const { norma: n, versions, fecha, articles, modifies, modifiedBy, stats } = data

  const label = normaLabel(n)
  const readerHref = canonicalHref(n)
  const hasCambios = qualifiesForCambios(versions, modifiedBy.length)
  const faq = buildFaq(n, versions, fecha, modifies.length, modifiedBy.length)

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(legislationJsonLd(n, fecha, versions, [])) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faq)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(breadcrumbJsonLd([
            { name: 'Guías', path: '/guia' },
            { name: label, path: `/guia/${n.tipo}/${encodeURIComponent(n.numero)}` },
          ])),
        }}
      />

      <article className="px-6 md:px-12 max-w-3xl mx-auto pt-14 pb-20">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-4">
          {tipoLabel(n.tipo)} · Nº {n.numero}
        </p>
        <h1 className="font-display text-3xl md:text-[2.7rem] leading-[1.08] tracking-tight text-balance">
          Qué dice la <span className="text-ruby">{label}</span>
        </h1>
        <p className="mt-4 font-display italic text-lg md:text-xl text-ink-soft text-balance">
          {n.titulo}
        </p>

        <dl className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border border-rule rounded-lg overflow-hidden">
          <Fact k="Publicada" v={fechaLarga(n.fechaPublicacion) || '—'} />
          <Fact k="Versiones" v={String(versions.length)} />
          <Fact k="Artículos" v={String(stats.articles)} />
          <Fact k="Estado" v={n.derogado ? 'Derogada' : 'Vigente'} accent={n.derogado ? 'ruby' : 'moss'} />
        </dl>

        {n.organismo && (
          <p className="mt-4 text-[13px] text-ink-faint italic">{n.organismo}</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={readerHref}
            className="inline-flex items-center gap-2 border border-ink/80 hover:border-ruby text-ink hover:text-ruby transition px-4 py-2.5 rounded-md text-sm"
          >
            Leer el texto completo →
          </Link>
          {hasCambios && (
            <Link
              href={`/cambios/${n.tipo}/${encodeURIComponent(n.numero)}`}
              className="inline-flex items-center gap-2 text-sm text-indigo hover:underline px-4 py-2.5"
            >
              Qué cambió y cuándo →
            </Link>
          )}
        </div>

        {/* The FAQ is the page's answer surface. Every answer is a corpus fact. */}
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

        {versions.length > 1 && (
          <section className="mt-14 border-t border-rule pt-10">
            <h2 className="font-display text-2xl mb-2">Versiones de la {label}</h2>
            <p className="text-[14px] text-ink-soft mb-5">
              Cada fecha es un texto distinto. El corpus guarda las {versions.length}, no sólo la vigente.
            </p>
            <ul className="divide-y divide-rule">
              {versions.map((v) => (
                <li key={v.desde}>
                  <Link
                    href={canonicalHref(n, v.desde)}
                    className="group flex items-baseline gap-4 py-2.5 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
                  >
                    <span className="font-mono text-xs text-ink-faint w-24 shrink-0">{v.desde}</span>
                    <span className="text-[14px] text-ink-soft group-hover:text-ruby transition line-clamp-1">
                      {v.subject || 'Versión sin causa registrada'}
                    </span>
                    {v.hasta === null && (
                      <span className="ml-auto text-[10px] uppercase tracking-widest text-moss shrink-0">vigente</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* The whole reason this route exists: real legal text, server-rendered. */}
        <section className="mt-14 border-t border-rule pt-10">
          <h2 className="font-display text-2xl mb-2">Articulado</h2>
          <p className="text-[14px] text-ink-soft mb-6">
            Texto vigente al {fechaLarga(fecha)}
            {stats.articles > articles.length && (
              <> · se muestran los primeros {articles.length} de {stats.articles} artículos</>
            )}
            .
          </p>
          <div className="space-y-8">
            {articles.map((a) => (
              <div key={`${a.slug}-${a.ord}`} id={`art-${a.slug}`}>
                <h3 className="font-display text-[1.1rem] text-ink mb-1.5">
                  <Link
                    href={canonicalHref(n, undefined, `art-${a.slug}`)}
                    className="hover:text-ruby transition"
                  >
                    {a.rawHeading || a.label}
                  </Link>
                </h3>
                <ArticleBody body={a.body} />
              </div>
            ))}
          </div>
          {stats.articles > articles.length && (
            <div className="mt-8">
              <Link href={readerHref} className="text-sm text-indigo hover:underline">
                Ver los {stats.articles} artículos en el lector →
              </Link>
            </div>
          )}
        </section>

        {(modifies.length > 0 || modifiedBy.length > 0) && (
          <section className="mt-14 border-t border-rule pt-10 grid md:grid-cols-2 gap-10">
            {modifies.length > 0 && (
              <ModList title={`Qué modifica la ${label}`} items={modifies.slice(0, 12)} />
            )}
            {modifiedBy.length > 0 && (
              <ModList title={`Qué ha modificado la ${label}`} items={modifiedBy.slice(0, 12)} />
            )}
          </section>
        )}

        <footer className="mt-14 border-t border-rule pt-8 text-xs text-ink-faint">
          <p>
            Texto derivado de fuentes públicas de la Biblioteca del Congreso Nacional. No es
            una fuente oficial: para efectos legales la referencia es{' '}
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

function Fact({ k, v, accent }: { k: string; v: string; accent?: 'moss' | 'ruby' }) {
  const tone = accent === 'moss' ? 'text-moss' : accent === 'ruby' ? 'text-ruby' : 'text-ink'
  return (
    <div className="bg-paper-raised px-3 py-3">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">{k}</dt>
      <dd className={`mt-1 font-display text-[0.95rem] leading-snug ${tone}`}>{v}</dd>
    </div>
  )
}

function ModList({
  title, items,
}: { title: string; items: ModLink[] }) {
  return (
    <div>
      <h2 className="font-display text-xl mb-4">{title}</h2>
      <ul className="divide-y divide-rule">
        {items.map((m) => (
          <li key={`${m.tipo}-${m.numero}-${m.fecha}`}>
            <Link
              href={canonicalHref(m)}
              className="group block py-2.5 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
            >
              <div className="text-[10px] uppercase tracking-widest text-ink-faint">
                {tipoLabel(m.tipo)} {m.numero} · {m.fecha}
              </div>
              <div className="text-[13.5px] leading-snug text-ink-soft group-hover:text-ruby transition line-clamp-2">
                {m.titulo}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
