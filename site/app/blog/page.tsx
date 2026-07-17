import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE } from '@/lib/jsonld'
import { listPosts } from '@/lib/blog'
import { fechaLarga } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Blog — qué se ve cuando la ley tiene control de versiones',
  description:
    'Casos reales del corpus jurídico chileno: qué cambió en la Ley Karin, cómo leer el texto que regía en una fecha, y qué registra el corpus sobre la ley de datos personales.',
  alternates: { canonical: `${SITE}/blog` },
}

export default function Page() {
  const posts = listPosts()
  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <section className="px-6 md:px-12 max-w-3xl mx-auto pt-16 pb-20">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-5">Blog</p>
        <h1 className="font-display text-4xl md:text-[3rem] leading-[1.06] tracking-tight text-balance">
          Lo que se ve cuando la ley <span className="text-ruby">tiene historial</span>.
        </h1>
        <p className="mt-6 text-ink-soft max-w-2xl text-[15.5px] leading-relaxed">
          Cada texto vigente esconde de dónde vino. Acá contamos hallazgos concretos del corpus —
          diffs reales, cadenas de modificación reales— y cómo usarlos.
        </p>

        <ul className="mt-12 divide-y divide-rule border-t border-rule">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="group block py-6 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
              >
                <p className="text-[11px] uppercase tracking-widest text-ink-faint">
                  <time dateTime={p.published}>{fechaLarga(p.published)}</time>
                </p>
                <h2 className="mt-1.5 font-display text-[1.35rem] leading-snug text-ink group-hover:text-ruby transition text-balance">
                  {p.title}
                </h2>
                <p className="mt-2 font-display italic text-[15px] text-ink-soft leading-snug text-balance">
                  {p.standfirst}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
