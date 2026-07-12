import { Suspense } from 'react'
import Link from 'next/link'
import { recordEvent } from '@/lib/analytics'
import { needsColdPath, normalizeQuery, searchCold, searchHot, type Hit } from '@/lib/search'

// No `export const dynamic` here: with `cacheComponents` enabled (next.config.ts),
// the route segment config is incompatible and Turbopack rejects the build.
// Reading `searchParams` is a dynamic API access, and under Cache Components
// any uncached data access must sit inside a <Suspense> boundary (build error
// otherwise: "Uncached data was accessed outside of <Suspense>") — see the
// Page wrapper below.

function Results({ hits }: { hits: Hit[] }) {
  return (
    <ul>
      {hits.map(h => (
        <li key={`${h.idNorma}:${h.slug}`}>
          <Link href={`/${h.tipo}/${h.numero}#${h.slug}`}>{h.titulo}</Link>
          <p dangerouslySetInnerHTML={{ __html: h.snippet }} />
        </li>
      ))}
    </ul>
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
  if (!q) return <main><h1>Buscar</h1></main>

  const queryNorm = normalizeQuery(q)
  const hot = await searchHot(q, asOf)

  let cold: Hit[] = []
  if (needsColdPath(hot.length)) {
    cold = await searchCold(q, asOf)
    // Strong signal: Meilisearch could not find what Postgres could.
    for (const h of cold) recordEvent({ kind: 'cold_surface', idNorma: h.idNorma, tier: 'cold' })
  }
  recordEvent({ kind: 'search', queryNorm, resultCount: hot.length + cold.length, tier: 'hot' })

  return (
    <main>
      <h1>Resultados para “{q}”</h1>
      <p>Texto vigente al {asOf}.</p>
      <Results hits={hot} />
      {cold.length > 0 && (
        <>
          {/* Two rankers, two behaviours. Label the seam rather than merging
              the lists, which would imply a coherence that does not exist. */}
          <h2>Otros resultados en el resto del corpus</h2>
          <Results hits={cold} />
        </>
      )}
    </main>
  )
}
