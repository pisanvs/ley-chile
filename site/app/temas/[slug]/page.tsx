import Link from 'next/link'
import { notFound } from 'next/navigation'
import { breadcrumbJsonLd, jsonLdScript, SITE } from '@/lib/jsonld'
import { canonicalHref } from '@/lib/href'
import { getModifiedBy, getVersions } from '@/lib/norma'
import {
  fechaLarga, getGuiaStats, getSeoNorma, normaLabel, qualifiesForCambios, qualifiesForGuia, tipoLabel,
} from '@/lib/seo'
import { getTopic, type Topic, type TopicRef } from '@/lib/topics'

interface Props { params: Promise<{ slug: string }> }

// Render at request time, never at build time. The topic slugs are a static list,
// so generateStaticParams() looks free — but it makes Next prerender each page
// during `next build`, and this route resolves its refs against Postgres. The
// Railway image (and this repo's Docker build) is built with no DATABASE_URL
// reachable: the DB only exists at container runtime. Prerendering here hard-
// failed the build with ECONNREFUSED. Same constraint app/sitemap.ts documents.
export const dynamic = 'force-dynamic'

interface ResolvedRef {
  ref: TopicRef
  label: string
  titulo: string
  fechaPublicacion: string | null
  versions: number
  derogado: boolean
  guia: string | null
  cambios: string | null
  reader: string
}

/** A curated ref that has fallen out of the corpus must not render a dead link.
 *  Resolve each one and drop the misses rather than trusting the registry. */
async function resolveRefs(t: Topic): Promise<ResolvedRef[]> {
  const out: ResolvedRef[] = []
  for (const ref of t.refs) {
    const n = await getSeoNorma(ref.tipo, ref.numero)
    if (!n) continue
    const [versions, stats, modifiedBy] = await Promise.all([
      getVersions(n.idNorma), getGuiaStats(n.idNorma), getModifiedBy(n.idNorma),
    ])
    const enc = encodeURIComponent(n.numero)
    out.push({
      ref,
      label: normaLabel(n),
      titulo: n.titulo,
      fechaPublicacion: n.fechaPublicacion,
      versions: versions.length,
      derogado: n.derogado,
      guia: qualifiesForGuia(n, stats) ? `/guia/${n.tipo}/${enc}` : null,
      cambios: qualifiesForCambios(versions, modifiedBy.length) ? `/cambios/${n.tipo}/${enc}` : null,
      reader: canonicalHref(n),
    })
  }
  return out
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const t = getTopic(slug)
  if (!t) return {}
  return {
    title: t.title,
    description: t.intro.slice(0, 180),
    alternates: { canonical: `${SITE}/temas/${t.slug}` },
  }
}

// Resolve before JSX; no <Suspense>.
export default async function Page({ params }: Props) {
  const { slug } = await params
  const t = getTopic(slug)
  if (!t) notFound()
  const refs = await resolveRefs(t)
  if (refs.length === 0) notFound()

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(breadcrumbJsonLd([
            { name: 'Temas', path: '/temas' },
            { name: t.title, path: `/temas/${t.slug}` },
          ])),
        }}
      />

      <article className="px-6 md:px-12 max-w-3xl mx-auto pt-14 pb-20">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-4">Tema</p>
        <h1 className="font-display text-3xl md:text-[2.7rem] leading-[1.08] tracking-tight text-balance">
          {t.title}
        </h1>
        <p className="mt-6 text-ink-soft text-[15.5px] leading-relaxed">{t.intro}</p>

        <section className="mt-12 border-t border-rule pt-10">
          <h2 className="font-display text-2xl mb-6">Las normas de este tema</h2>
          <div className="space-y-4">
            {refs.map((r) => (
              <div key={`${r.ref.tipo}-${r.ref.numero}`} className="bg-paper-raised rounded-lg p-5 border border-rule">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                    {tipoLabel(r.ref.tipo)} · Nº {r.ref.numero}
                  </span>
                  {r.derogado && (
                    <span className="text-[10px] uppercase tracking-widest text-ruby">derogada</span>
                  )}
                  {r.versions > 1 && (
                    <span className="text-[10px] uppercase tracking-widest text-ink-faint">
                      {r.versions} versiones
                    </span>
                  )}
                </div>
                <h3 className="font-display text-[1.15rem] leading-snug mt-1.5 text-balance">
                  <Link href={r.guia ?? r.reader} className="hover:text-ruby transition">
                    {r.label} — {r.titulo}
                  </Link>
                </h3>
                <p className="mt-2 text-[13.5px] text-ink-soft leading-relaxed">{r.ref.note}</p>
                {r.fechaPublicacion && (
                  <p className="mt-1.5 text-[12px] text-ink-faint italic">
                    Publicada el {fechaLarga(r.fechaPublicacion)}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]">
                  {r.guia && <Link href={r.guia} className="text-indigo hover:underline">Qué dice →</Link>}
                  {r.cambios && <Link href={r.cambios} className="text-indigo hover:underline">Qué cambió →</Link>}
                  <Link href={r.reader} className="text-ink-faint hover:text-ruby transition">Texto completo →</Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-rule pt-8">
          <p className="text-[13px] text-ink-soft leading-relaxed">
            También buscada como:{' '}
            {t.aka.map((a, i) => (
              <span key={a}>
                {i > 0 && ' · '}
                <em>{a}</em>
              </span>
            ))}
            .
          </p>
        </section>

        <footer className="mt-12 border-t border-rule pt-8 text-xs text-ink-faint">
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
