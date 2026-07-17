// Queries Postgres, so it must not be prerendered: `next build` runs with no
// DATABASE_URL reachable (the DB exists only at container runtime). Without
// this, the build fails with ECONNREFUSED. See app/sitemap.ts.
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { pool } from '@/lib/db'
import { SITE } from '@/lib/jsonld'
import { GUIA_TIPOS, MIN_GUIA_ARTICLES, prettyNumero, tipoLabel } from '@/lib/seo'
import { TOPICS } from '@/lib/topics'

export const metadata: Metadata = {
  title: 'Guías — qué dice cada ley chilena',
  description:
    'Resumen, articulado y versiones de las leyes, decretos ley, DFL y códigos chilenos. Texto real, no una ficha.',
  alternates: { canonical: `${SITE}/guia` },
}

interface Row { tipo: string; numero: string; titulo: string; versions: number; arts: number }

/** The most-reformed normas that clear the guide gate. "Most versions" is a
 *  decent proxy for "most consequential": a law nobody amends is a law nobody
 *  argues about. Capped — this is a doorway into the graph, not a directory of
 *  6.6k links, which would be a link farm.
 *
 *  Counts only, no sum(length(body)): that detoasts the whole articulo table
 *  and 500s this route on production Postgres. See MIN_GUIA_ARTICLES. */
async function notable(): Promise<Row[]> {
  const { rows } = await pool.query(
    `SELECT n.tipo, n.numero, n.titulo, a.arts::int AS arts, count(v.*)::int AS versions
       FROM norma n
       JOIN (
         SELECT id_norma, count(*) AS arts FROM articulo GROUP BY id_norma
       ) a ON a.id_norma = n.id_norma
       JOIN version v ON v.id_norma = n.id_norma
      WHERE n.tipo = ANY($1) AND a.arts >= $2
      GROUP BY n.tipo, n.numero, n.titulo, a.arts, n.id_norma
      ORDER BY count(v.*) DESC, a.arts DESC
      LIMIT 40`,
    [GUIA_TIPOS as unknown as string[], MIN_GUIA_ARTICLES],
  )
  return rows.map((r) => ({
    tipo: r.tipo, numero: r.numero, titulo: r.titulo, versions: r.versions, arts: r.arts,
  }))
}

export default async function Page() {
  const rows = await notable()

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <section className="px-6 md:px-12 max-w-3xl mx-auto pt-16 pb-20">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-5">Guías</p>
        <h1 className="font-display text-4xl md:text-[3rem] leading-[1.06] tracking-tight text-balance">
          Qué dice cada ley, <span className="text-ruby">en su propio texto</span>.
        </h1>
        <p className="mt-6 text-ink-soft max-w-2xl text-[15.5px] leading-relaxed">
          Una guía por norma sustantiva: qué es, desde cuándo rige, cuántas veces cambió y su
          articulado real. Sólo para leyes, decretos ley, DFL y códigos con articulado propio — el
          resto del corpus se lee en el lector.
        </p>

        <h2 className="mt-14 font-display text-xl mb-4">Por tema</h2>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <Link
              key={t.slug}
              href={`/temas/${t.slug}`}
              className="text-[11px] font-ui uppercase tracking-widest px-2.5 py-1 rounded-full border border-rule text-ink-soft hover:text-ink hover:border-ink/40 transition"
            >
              {t.aka[0]}
            </Link>
          ))}
        </div>

        <h2 className="mt-14 font-display text-xl mb-1">Las más reformadas</h2>
        <p className="text-[13.5px] text-ink-soft mb-5">
          Ordenadas por número de versiones: las normas cuyo texto más ha cambiado.
        </p>
        <ul className="divide-y divide-rule border-t border-rule">
          {rows.map((r) => (
            <li key={`${r.tipo}-${r.numero}`}>
              <Link
                href={`/guia/${r.tipo}/${encodeURIComponent(r.numero)}`}
                className="group flex flex-col md:flex-row md:items-baseline gap-1 md:gap-6 py-3.5 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
              >
                <div className="font-mono text-xs text-ink-faint w-28 shrink-0">
                  {r.versions} versiones
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-ink-faint">
                    {tipoLabel(r.tipo)} {prettyNumero(r.numero)}
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
