import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchCommits } from '@/lib/commits'

export const Route = createFileRoute('/ley/$numero/')({
  component: () => {
    const { numero } = Route.useParams()
    const q = useQuery({ queryKey: ['commits', Number(numero)], queryFn: () => fetchCommits(Number(numero)) })
    if (q.isLoading) return <div className="p-8 opacity-60">Cargando…</div>
    if (q.isError || !q.data?.commits.length) return <div className="p-8 text-ruby">No hay versiones para esta ley.</div>
    const latest = q.data.commits[q.data.commits.length - 1]
    return <Navigate to="/ley/$numero/$fecha" params={{ numero, fecha: latest.date }} replace />
  },
})
