// Queries Postgres, so it must not be prerendered: `next build` runs with no
// DATABASE_URL reachable. Same constraint as app/guia.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'

import { getNormaById, getVersions, currentFecha } from '@/lib/norma'
import { runSearch } from '@/lib/search'
import { canonicalHref } from '@/lib/href'
import { faqJsonLd, jsonLdScript, SITE, cleanTitulo } from '@/lib/jsonld'
import { SITE_NAME, OG_LOCALE } from '@/lib/site'
import { CiteFormatList } from '@/components/CiteFormatList'
import { normaName, type CiteSource } from '@/lib/cite'

/**
 * `/citar` — find a Chilean norma and get its citation in every supported format.
 *
 * Server-rendered on purpose. The point of this page is to rank for "cómo citar
 * una ley chilena" and its variants, so the guide has to be in the HTML, and
 * the tool has to work with JavaScript disabled. Search and selection are plain
 * GET parameters; only the copy buttons are client-side.
 *
 * It is a tool rather than only an article because a free tool that does the
 * job is linkable in a way a blog post is not — which is the actual goal.
 */

const FAQ: { q: string; a: string }[] = [
  {
    q: '¿Cómo se cita una ley chilena?',
    a:
      'El uso chileno cita la norma, el artículo si corresponde, el Diario Oficial y la fecha de ' +
      'publicación. Por ejemplo: «Ley N° 21.719, art. 12, Diario Oficial, 26 de agosto de 2024.» ' +
      'Para APA, MLA o Chicago la estructura cambia, pero los datos son los mismos.',
  },
  {
    q: '¿Cómo se cita un artículo específico de una ley?',
    a:
      'Se agrega el artículo después del número de la norma: «Ley N° 21.719, art. 12». En APA y ' +
      'MLA el artículo va junto al título de la norma. Conviene además enlazar directamente al ' +
      'artículo, no a la ley completa.',
  },
  {
    q: '¿Cómo cito la versión de una ley que regía en una fecha pasada?',
    a:
      'Hay que indicar la versión, porque el texto vigente hoy no es el que regía entonces. Una ' +
      'cita de un hecho de 2015 debe apuntar al texto vigente en 2015. En leyes.pisanvs.cl cada ' +
      'versión tiene su propia URL con la fecha, de modo que el enlace muestra el texto correcto.',
  },
  {
    q: '¿Cómo cito un DFL o un decreto si hay varios con el mismo número?',
    a:
      'El par (tipo, número) no identifica una norma chilena: existen 227 normas llamadas «DFL 1» ' +
      'y 525 llamadas «DTO 1», de distintos organismos y años. La cita debe incluir el organismo ' +
      'y el año, o bien el idNorma, que sí es único.',
  },
  {
    q: '¿Qué es el Diario Oficial en una cita legal?',
    a:
      'Es la publicación donde se promulgan las normas chilenas, y cumple el papel que en una ' +
      'cita bibliográfica tendría la revista o editorial. Por eso aparece en todos los formatos.',
  },
]

const OG_TITLE = 'Cómo citar una ley chilena'
const DESCRIPTION =
  'Busca cualquier ley, decreto o código chileno y copia su cita en formato legal chileno, ' +
  'APA 7, MLA 9, Chicago, BibTeX o RIS. Incluye cómo citar un artículo y cómo citar la versión ' +
  'que regía en una fecha pasada.'

// `openGraph` replaces the root layout's object rather than merging into it,
// so siteName and locale are repeated here — see the note in lib/site.ts.
// `images` is deliberately absent: app/citar/opengraph-image.tsx fills it via
// the file convention, and naming it here would override that with a literal.
export const metadata: Metadata = {
  title: 'Cómo citar una ley chilena — generador de citas (legal, APA, MLA, Chicago)',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/citar` },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    // Shorter than the <title>: a share card is read at a glance, and the
    // parenthesised format list is keyword weight for search, not for humans.
    title: OG_TITLE,
    description: DESCRIPTION,
    url: `${SITE}/citar`,
  },
}

interface SP {
  searchParams: Promise<{ q?: string; id?: string; fecha?: string }>
}

export default async function Page({ searchParams }: SP) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const id = /^[1-9]\d*$/.test(sp.id ?? '') ? Number(sp.id) : null

  const norma = id ? await getNormaById(id) : null
  const versions = norma ? await getVersions(norma.idNorma) : []
  const fecha =
    norma && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? '') ? sp.fecha! : undefined

  const results = !norma && q.length >= 2 ? await runSearch(q, new Date().toISOString().slice(0, 10), 8) : []

  const source: CiteSource | null = norma
    ? {
        tipo: norma.tipo,
        numero: norma.numero,
        titulo: cleanTitulo(norma.titulo),
        organismo: norma.organismo,
        fechaPublicacion: norma.fechaPublicacion,
        // The Revista Chilena de Derecho's entry is built on the denominación
        // legal ("Ley de violencia intrafamiliar"), not the official título.
        denominacion: norma.nombresUsoComun[0],
        fecha: fecha ?? undefined,
        url: `${SITE}${canonicalHref(norma, fecha)}`,
      }
    : null

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(faqJsonLd(FAQ)),
        }}
      />

      <div className="px-6 md:px-12 max-w-3xl mx-auto pt-16 pb-24">
        <p className="text-[10.5px] uppercase tracking-[0.25em] text-ink-faint mb-5">
          Herramienta
        </p>
        <h1 className="font-display text-4xl md:text-[3rem] leading-[1.06] tracking-tight text-balance">
          Cómo citar una <span className="text-ruby">ley chilena</span>.
        </h1>
        <p className="mt-6 text-ink-soft text-[15.5px] leading-relaxed">
          Busca la norma, elige el formato, copia la cita. Formato legal chileno, APA 7, MLA 9,
          Chicago, y BibTeX o RIS para Zotero y Mendeley. Incluye el caso que casi ninguna guía
          cubre: citar la versión que regía en una fecha pasada.
        </p>

        {/* ── The tool ─────────────────────────────────────────────── */}
        <form action="/citar" method="get" className="mt-9 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="ley 21719, código del trabajo, medio ambiente…"
            aria-label="Buscar una norma"
            className="flex-1 rounded-lg border border-rule bg-paper-raised px-3.5 py-2.5 text-[14.5px]
                       text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink/40 transition"
          />
          <button
            type="submit"
            className="rounded-lg border border-rule px-4 text-[13px] font-ui text-ink-soft
                       hover:text-ink hover:border-ink/40 transition"
          >
            Buscar
          </button>
        </form>

        {results.length > 0 && (
          <ul className="mt-5 divide-y divide-rule border-t border-rule">
            {results.map((r) => (
              <li key={r.idNorma}>
                <Link
                  href={`/citar?id=${r.idNorma}`}
                  className="group flex flex-col gap-0.5 py-3 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
                >
                  <span className="text-[11px] uppercase tracking-widest text-ink-faint">
                    {r.tipo} {r.numero}
                  </span>
                  <span className="font-display text-[1.02rem] leading-snug group-hover:text-ruby transition line-clamp-2">
                    {cleanTitulo(r.titulo)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {q.length >= 2 && results.length === 0 && !norma && (
          <p className="mt-5 text-[14px] text-ink-faint">
            Sin resultados para «{q}».
          </p>
        )}

        {source && norma && (
          <section className="mt-9 border-t border-rule pt-8">
            <p className="text-[11px] uppercase tracking-widest text-ink-faint">
              {normaName(source)}
              {norma.organismo && ` · ${norma.organismo}`}
            </p>
            <h2 className="font-display text-2xl leading-snug mt-1 mb-1">
              {cleanTitulo(norma.titulo)}
            </h2>
            <p className="text-[13px] text-ink-faint mb-5">
              Citando {fecha ? `la versión vigente al ${fecha}` : 'el texto vigente'}
              {versions.length > 1 && ` · ${versions.length} versiones`}
              {' · '}
              <Link href={canonicalHref(norma, fecha)} className="text-indigo hover:text-ruby underline underline-offset-2">
                leer la norma
              </Link>
            </p>

            {versions.length > 1 && (
              <div className="mb-6">
                <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">
                  ¿Necesitas citar otra versión?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {versions.map((v) => {
                    const active = (fecha ?? currentFecha(versions)) === v.desde
                    return (
                      <Link
                        key={v.desde}
                        href={`/citar?id=${norma.idNorma}&fecha=${v.desde}`}
                        className={`font-mono text-[11px] px-2 py-1 rounded border transition ${
                          active
                            ? 'border-ruby text-ruby'
                            : 'border-rule text-ink-faint hover:text-ink hover:border-ink/40'
                        }`}
                      >
                        {v.desde}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            <CiteFormatList source={source} />
          </section>
        )}

        {/* ── The guide ────────────────────────────────────────────── */}
        <section className="mt-16 border-t border-rule pt-10">
          <h2 className="font-display text-2xl mb-4">Preguntas frecuentes</h2>
          <dl className="space-y-6">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="font-display text-[1.1rem] leading-snug mb-1.5">{f.q}</dt>
                <dd className="text-ink-soft text-[14.5px] leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 border-t border-rule pt-10">
          <h2 className="font-display text-2xl mb-3">Por qué la versión importa</h2>
          <p className="text-ink-soft text-[14.5px] leading-relaxed">
            Una cita legal apunta a un texto, y el texto de una ley cambia. El Código Penal tiene
            122 versiones desde 1874; la ley del consumidor, nueve. Si tu trabajo analiza un hecho
            de 2015 y tu cita enlaza al texto de hoy, la cita contradice al texto que estás
            comentando — y quien la siga leerá algo distinto de lo que tú leíste.
          </p>
          <p className="text-ink-soft text-[14.5px] leading-relaxed mt-3">
            Por eso cada versión aquí tiene su propia URL con la fecha, y por eso las citas de esta
            página incluyen la versión cuando corresponde. Es la diferencia entre citar «la ley» y
            citar la ley que efectivamente regía.
          </p>
          <p className="text-ink-soft text-[14.5px] leading-relaxed mt-5">
            Más sobre esto en{' '}
            <Link href="/blog/leer-la-ley-en-una-fecha" className="text-indigo hover:text-ruby underline underline-offset-2">
              cómo leer la ley que regía en una fecha exacta
            </Link>
            {' '}y en la{' '}
            <Link href="/blog/citar-ley-chilena" className="text-indigo hover:text-ruby underline underline-offset-2">
              guía completa de citación
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
