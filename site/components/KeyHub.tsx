import Link from 'next/link'
import type { KeyMember } from '@/lib/norma'
import { canonicalHref } from '@/lib/href'

/** Disambiguation hub for a (tipo, numero) key shared by more than one norma.
 *
 *  This page exists because the key is not an identifier. "DFL 4" names 79
 *  different norms — the Ley General de Servicios Eléctricos and the Ley
 *  Orgánica Constitucional de Partidos Políticos among them — and serving
 *  whichever one sorted first meant confidently answering the wrong question.
 *  Ambiguity is surfaced, never resolved by guessing.
 *
 *  It is also the right page for the query "DFL 4": a reader or a crawler
 *  searching that string wants the list, not an arbitrary member of it. */
export function KeyHub({
  tipo, numero, members, total,
}: {
  tipo: string
  numero: string
  members: KeyMember[]
  total: number
}) {
  const label = `${tipo.toUpperCase()} ${numero}`
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 lc-fade-up">
      <header className="pb-6 mb-8 border-b border-rule">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-faint mb-2">
          Clave compartida
        </div>
        <h1 className="font-display text-4xl md:text-[2.6rem] leading-[1.05] text-balance">
          {label}
        </h1>
        <p className="mt-4 text-[15px] text-ink-soft leading-relaxed">
          <strong className="text-ink">{total.toLocaleString('es-CL')} normas</strong> comparten
          esta clave. El número por sí solo no identifica una norma chilena: un{' '}
          {tipo.toLowerCase()} se distingue además por su organismo y su año, y LeyChile las
          diferencia por <span className="font-mono text-[13px]">idNorma</span>.
        </p>
        <p className="mt-2 text-[13px] text-ink-faint leading-relaxed">
          Elige la que buscas — cada una tiene su propia dirección permanente.
        </p>
      </header>

      <ul className="space-y-3">
        {members.map((m) => (
          <li key={m.idNorma}>
            <Link
              href={canonicalHref(m)}
              className="group block rounded-lg border border-rule bg-paper-raised px-4 py-3.5
                         transition hover:border-indigo/50 hover:bg-paper-sunk"
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-[12px] font-medium text-ink group-hover:text-indigo transition">
                  {m.organismo || 'Organismo no especificado'}
                </span>
                {m.fechaPublicacion && (
                  <span className="text-[11px] text-ink-faint font-mono">
                    {m.fechaPublicacion}
                  </span>
                )}
                {m.derogado && (
                  <span className="text-[10px] uppercase tracking-wider text-ruby border border-ruby/40 rounded px-1.5 py-px">
                    Derogada
                  </span>
                )}
                <span className="ml-auto text-[11px] text-ink-faint">
                  {m.versions} {m.versions === 1 ? 'versión' : 'versiones'}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-ink-soft leading-snug line-clamp-2">
                {m.titulo}
              </p>
              <div className="mt-1.5 text-[10px] text-ink-faint font-mono">
                idNorma {m.idNorma}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {total > members.length && (
        <p className="mt-6 text-[12px] text-ink-faint">
          Se muestran las {members.length.toLocaleString('es-CL')} más reformadas de{' '}
          {total.toLocaleString('es-CL')}. Usa la búsqueda para acotar por texto.
        </p>
      )}
    </div>
  )
}
