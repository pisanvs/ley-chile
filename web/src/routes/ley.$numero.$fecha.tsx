import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchCommits, resolveToIdNorma, type Commit } from '@/lib/commits'
import { IDEShell } from '@/components/IDEShell'
import { VersionScrubber } from '@/components/VersionScrubber'
import { RedlineReader } from '@/components/RedlineReader'
import { VersionDetails } from '@/components/VersionDetails'

type ReaderMode = 'redline' | 'clean' | 'source'

export const Route = createFileRoute('/ley/$numero/$fecha')({
  component: IDEPage,
})

function IDEPage() {
  const { numero, fecha } = Route.useParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState<ReaderMode>('redline')

  const resolved = useQuery({
    queryKey: ['resolve', numero],
    queryFn: () => resolveToIdNorma(numero),
    staleTime: Infinity,
  })
  const idNorma = resolved.data ?? null
  const q = useQuery({
    queryKey: ['commits', idNorma],
    queryFn: () => fetchCommits(idNorma!),
    enabled: !!idNorma,
  })

  // If we resolved to a different canonical idNorma than what was in the URL,
  // bounce to the canonical form so deep-links stabilize over time.
  if (idNorma && String(idNorma) !== numero) {
    return <Navigate to="/ley/$numero/$fecha" params={{ numero: String(idNorma), fecha }} replace />
  }

  if (resolved.isLoading || q.isLoading) return <IDEShell center={<Loading />} />
  if (resolved.isError || !idNorma) return <IDEShell center={<Failed />} />
  if (q.isError) return <IDEShell center={<Failed />} />
  const idx = q.data!
  const active: Commit | undefined =
    idx.commits.find(c => c.date === fecha) ?? idx.commits[idx.commits.length - 1]
  const activeIdx = active ? idx.commits.findIndex(c => c.sha === active.sha) : -1
  const prev = activeIdx > 0 ? idx.commits[activeIdx - 1] : null
  const isOriginal = activeIdx === 0
  const effectiveMode: ReaderMode = isOriginal && mode === 'redline' ? 'clean' : mode

  const center = (
    <div className="lc-fade-up">
      <header className="mb-8 pb-6 border-b border-rule">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {idx.norma.tipo} · Nº {idx.norma.numero}
          {idx.norma.fechaPublicacion && ` · ${idx.norma.fechaPublicacion}`}
        </div>
        <h1 className="font-display text-3xl md:text-[2.1rem] leading-[1.1] mt-2 text-balance">
          {idx.norma.titulo}
        </h1>
        {idx.norma.organismo && (
          <div className="text-sm text-ink-soft mt-2 italic">{idx.norma.organismo}</div>
        )}
      </header>

      <div className="mb-6 space-y-3">
        <VersionScrubber
          commits={idx.commits}
          activeSha={active?.sha ?? null}
          onPick={c => navigate({ to: '/ley/$numero/$fecha', params: { numero, fecha: c.date } })}
        />
        <ModeToggle mode={effectiveMode} setMode={setMode} canRedline={!isOriginal} />
      </div>

      {active && (
        <RedlineReader
          sha={active.sha}
          prevSha={prev?.sha ?? null}
          relDir={idx.relDir}
          mode={effectiveMode}
        />
      )}
    </div>
  )

  return (
    <IDEShell
      center={center}
      rightRail={<VersionDetails idx={idx} active={active} />}
    />
  )
}

function ModeToggle({
  mode,
  setMode,
  canRedline,
}: {
  mode: ReaderMode
  setMode: (m: ReaderMode) => void
  canRedline: boolean
}) {
  const opts: { id: ReaderMode; label: string; disabled?: boolean }[] = [
    { id: 'redline', label: 'Redline', disabled: !canRedline },
    { id: 'clean', label: 'Limpio' },
    { id: 'source', label: 'Fuente' },
  ]
  return (
    <div className="inline-flex items-center bg-paper-sunk rounded-md p-0.5 border border-rule text-xs">
      {opts.map(o => (
        <button
          key={o.id}
          disabled={o.disabled}
          onClick={() => setMode(o.id)}
          className={`px-3 py-1.5 rounded font-ui transition ${
            o.disabled
              ? 'opacity-40 cursor-not-allowed'
              : mode === o.id
                ? 'bg-paper-raised shadow-sm text-ink'
                : 'text-ink-soft hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Loading() {
  return <div className="opacity-60 mt-12 text-center text-sm">Cargando…</div>
}
function Failed() {
  return <div className="text-ruby mt-12 text-center text-sm">No se pudo cargar la ley.</div>
}
