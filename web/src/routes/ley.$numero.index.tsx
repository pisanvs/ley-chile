import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchCommits, resolveToIdNorma } from '@/lib/commits'

export const Route = createFileRoute('/ley/$numero/')({
  component: NumeroLatest,
})

function NumeroLatest() {
  const { numero } = Route.useParams()
  const resolved = useQuery({
    queryKey: ['resolve', numero],
    queryFn: () => resolveToIdNorma(numero),
    staleTime: Infinity,
  })
  const idNorma = resolved.data
  const q = useQuery({
    queryKey: ['commits', idNorma],
    queryFn: () => fetchCommits(idNorma!),
    enabled: !!idNorma,
  })

  if (resolved.isLoading || q.isLoading) {
    return <div className="p-12 opacity-60 text-center text-sm">Cargando…</div>
  }
  if (resolved.isError || !idNorma) {
    return (
      <div className="p-12 max-w-xl mx-auto text-center text-sm">
        <p className="text-ruby">No encontramos esta norma en el corpus.</p>
        <p className="text-ink-faint mt-2">
          Si conoces el idNorma BCN, pruébalo directamente como número.
        </p>
      </div>
    )
  }
  if (q.isError || !q.data?.commits.length) {
    return <div className="p-12 text-ruby text-center text-sm">No hay versiones para esta norma.</div>
  }
  const latest = q.data.commits[q.data.commits.length - 1]
  return (
    <Navigate
      to="/ley/$numero/$fecha"
      params={{ numero: String(idNorma), fecha: latest.date }}
      replace
    />
  )
}
