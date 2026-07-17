// Queries Postgres, so it must not be prerendered: `next build` runs with no
// DATABASE_URL reachable (the DB exists only at container runtime). See
// app/sitemap.ts.
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { pool } from '@/lib/db'
import { SITE } from '@/lib/jsonld'
import { prettyNumero, tipoLabel } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Qué cambió — historial de modificaciones de las leyes chilenas',
  description:
    'Las normas chilenas que más han cambiado, con cada versión, la norma que la causó y el diff palabra por palabra.',
  alternates: { canonical: `${SITE}/cambios` },
}

interface Row { tipo: string; numero: string; titulo: string; mods: number; versions: number; last: string }

/** Normas with the deepest change history. Same reasoning as /guia's index:
 *  a doorway, not a dump of 5.4k links. */
async function notable(): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT n.tipo, n.numero, n.titulo,
            count(DISTINCT v.desde)::int AS versions,
            (SELECT count(*) FROM modificacion m WHERE m.target_id = n.id_norma)::int AS mods,
            max(v.desde)::text AS last
       FROM norma n
       JOIN version v ON v.id_norma = n.id_norma
      WHERE EXISTS (SELECT 1 FROM modificacion m WHERE m.target_id = n.id_norma)
      GROUP BY n.tipo, n.numero, n.titulo, n.id_norma
     HAVING count(DISTINCT v.desde) > 1
      ORDER BY mods DESC, versions DESC
      LIMIT 40`,
  )
  return rows.map((r) => ({
    tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    mods: r.mods, versions: r.versions, last: r.last,
  }))
}

export default async function Page() {
  const rows = await notable()

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <section className="px-6 md:px-12 max-w-3xl mx-auto pt-16 pb-20">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-5">Cambios</p>
        <h1 className="font-display text-4xl md:text-[3rem] leading-[1.06] tracking-tight text-balance">
          Ninguna ley importante <span className="text-ruby">dice lo que decía</span>.
        </h1>
        <p className="mt-6 text-ink-soft max-w-2xl text-[15.5px] leading-relaxed">
          Estas son las normas cuyo texto más ha sido modificado. Para cada una: cada versión, la
          norma que la causó y el diff palabra por palabra.
        </p>

        <ul className="mt-12 divide-y divide-rule border-t border-rule">
          {rows.map((r) => (
            <li key={`${r.tipo}-${r.numero}-${r.last}`}>
              <Link
                href={`/cambios/${r.tipo}/${encodeURIComponent(r.numero)}`}
                className="group flex flex-col md:flex-row md:items-baseline gap-1 md:gap-6 py-3.5 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
              >
                <div className="font-mono text-xs text-ink-faint w-32 shrink-0">
                  {r.mods} modif. · {r.versions} vers.
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-ink-faint">
                    {tipoLabel(r.tipo)} {prettyNumero(r.numero)} · último cambio {r.last}
                  </div>
                  <div className="font-display text-[1.05rem] leading-snug text-ink group-hover:text-ruby transition line-clamp-2">
                    {r.titulo}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
