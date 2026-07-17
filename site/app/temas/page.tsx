import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE } from '@/lib/jsonld'
import { TOPICS } from '@/lib/topics'

export const metadata: Metadata = {
  title: 'Temas — las leyes chilenas que más se buscan',
  description:
    'Ley Karin, ley de arriendo, ley del consumidor, ley de datos personales. El nombre coloquial, el número real, y el texto de cada versión.',
  alternates: { canonical: `${SITE}/temas` },
}

export default function Page() {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <section className="px-6 md:px-12 max-w-3xl mx-auto pt-16 pb-20">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-5">Temas</p>
        <h1 className="font-display text-4xl md:text-[3rem] leading-[1.06] tracking-tight text-balance">
          Las leyes que la gente busca <span className="text-ruby">por su nombre</span>.
        </h1>
        <p className="mt-6 text-ink-soft max-w-2xl text-[15.5px] leading-relaxed">
          Nadie busca «ley 21.643»: busca «ley Karin». Estos son los puentes entre el nombre que
          usa la gente y la norma que existe en el corpus — con su texto, sus versiones y lo que
          cambió en cada una.
        </p>

        <ul className="mt-12 divide-y divide-rule border-t border-rule">
          {TOPICS.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/temas/${t.slug}`}
                className="group block py-5 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
              >
                <h2 className="font-display text-[1.2rem] leading-snug text-ink group-hover:text-ruby transition text-balance">
                  {t.title}
                </h2>
                <p className="mt-1.5 text-[13.5px] text-ink-soft leading-relaxed line-clamp-2">
                  {t.intro}
                </p>
                <p className="mt-2 text-[11px] uppercase tracking-widest text-ink-faint">
                  {t.aka.join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
