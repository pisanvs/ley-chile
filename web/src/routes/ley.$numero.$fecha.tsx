import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchCommits, type Commit } from '@/lib/commits'
import { IDEShell } from '@/components/IDEShell'
import { VersionScrubber } from '@/components/VersionScrubber'

export const Route = createFileRoute('/ley/$numero/$fecha')({
  component: IDEPage,
})

function IDEPage() {
  const { numero, fecha } = Route.useParams()
  const idNorma = Number(numero)
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['commits', idNorma],
    queryFn: () => fetchCommits(idNorma),
    enabled: Number.isFinite(idNorma),
  })

  if (q.isLoading) return <IDEShell center={<div className="opacity-60">Cargando…</div>} />
  if (q.isError) return <IDEShell center={<div className="text-ruby">No se pudo cargar la ley.</div>} />
  const idx = q.data!
  const active: Commit | undefined =
    idx.commits.find(c => c.date === fecha) ?? idx.commits[idx.commits.length - 1]

  const center = (
    <div>
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest opacity-50">{idx.norma.tipo} · {idx.norma.numero}</div>
        <h1 className="font-display text-3xl mt-1">{idx.norma.titulo}</h1>
        <div className="text-sm opacity-60 mt-1">{idx.norma.organismo}</div>
      </header>
      <VersionScrubber
        commits={idx.commits}
        activeSha={active?.sha ?? null}
        onPick={c => navigate({ to: '/ley/$numero/$fecha', params: { numero, fecha: c.date } })}
      />
      <div className="mt-2 text-sm opacity-70">
        Versión: <b>{active?.date ?? '—'}</b> · causa: {active?.causaId || '—'}
      </div>
      <hr className="my-6 border-ink/10" />
      <div className="opacity-50 italic">Clean reader arrives in Task 9.</div>
    </div>
  )

  return <IDEShell center={center} />
}
