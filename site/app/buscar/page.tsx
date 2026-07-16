import { Suspense } from 'react'
import Link from 'next/link'
import { recordEvent } from '@/lib/analytics'
import { needsColdPath, normalizeQuery, searchCold, searchHot, type Hit } from '@/lib/search'
import { normaHref } from '@/lib/href'

const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley', dl: 'Decreto Ley', dfl: 'DFL', dto: 'Decreto', cod: 'Código', res: 'Resolución',
}

function ResultCard({ hit }: { hit: Hit }) {
  const tipo = TIPO_LABEL[hit.tipo] ?? hit.tipo.toUpperCase()
  return (
    <li>
      <Link
        href={normaHref(hit.tipo, hit.numero, undefined, `art-${hit.slug}`)}
        className="block rounded-xl border border-rule bg-paper-raised p-4 transition-colors hover:border-indigo/60"
      >
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
          {tipo} {hit.numero}
        </div>
        <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-ink">{hit.titulo}</h3>
        {hit.snippet && (
          <p
            className="mt-2 font-body text-sm leading-relaxed text-ink-soft [&_b]:bg-[var(--lc-hl-yellow)] [&_b]:font-semibold [&_b]:text-ink [&_b]:rounded [&_b]:px-0.5"
            dangerouslySetInnerHTML={{ __html: hit.snippet }}
          />
        )}
      </Link>
    </li>
  )
}

export default async function Page({
  searchParams,
}: { searchParams: Promise<{ q?: string; asOf?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Buscar searchParams={searchParams} />
    </Suspense>
  )
}

async function Buscar({
  searchParams,
}: { searchParams: Promise<{ q?: string; asOf?: string }> }) {
  const { q = '', asOf = new Date().toISOString().slice(0, 10) } = await searchParams

  if (!q) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-ink">Buscar en el corpus</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          Busca por título, número o texto de cualquier ley, decreto o código chileno — en su versión vigente o histórica.
        </p>
      </main>
    )
  }

  const queryNorm = normalizeQuery(q)
  const hot = await searchHot(q, asOf)

  let cold: Hit[] = []
  if (needsColdPath(hot.length)) {
    cold = await searchCold(q, asOf)
    for (const h of cold) recordEvent({ kind: 'cold_surface', idNorma: h.idNorma, tier: 'cold' })
  }
  recordEvent({ kind: 'search', queryNorm, resultCount: hot.length + cold.length, tier: 'hot' })

  const total = hot.length + cold.length

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="border-b border-rule pb-4">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Resultados para <span className="text-ruby">“{q}”</span>
        </h1>
        <p className="mt-1 text-sm text-ink-faint">
          {total} {total === 1 ? 'resultado' : 'resultados'} · texto vigente al {asOf}
        </p>
      </div>

      {total === 0 ? (
        <p className="py-16 text-center text-ink-soft">Sin resultados. Prueba con otros términos.</p>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {hot.map((h) => <ResultCard key={`hot-${h.idNorma}:${h.slug}`} hit={h} />)}
          </ul>

          {cold.length > 0 && (
            <>
              <h2 className="mt-10 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                <span>En el resto del corpus</span>
                <span className="h-px flex-1 bg-rule" />
              </h2>
              <ul className="mt-4 space-y-3">
                {cold.map((h) => <ResultCard key={`cold-${h.idNorma}:${h.slug}`} hit={h} />)}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  )
}
