import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchCommits, resolveToIdNorma, type Commit } from '@/lib/commits'
import { IDEShell } from '@/components/IDEShell'
import { VersionScrubber } from '@/components/VersionScrubber'
import { RedlineReader, type ReaderViewMode } from '@/components/RedlineReader'
import { RightRail } from '@/components/RightRail'
import { readPrefs, writePrefs } from '@/lib/annotations'
import { ds } from '@/lib/datasource'
import { tabs } from '@/lib/tabs'

export const Route = createFileRoute('/ley/$numero/$fecha')({
  component: IDEPage,
})

function IDEPage() {
  const { numero, fecha } = Route.useParams()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState(readPrefs)
  const [citationCopied, setCitationCopied] = useState(false)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)

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

  // Track which article is on screen via hash + IntersectionObserver. For
  // simplicity, just snapshot the hash here so the rail can pre-select it.
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, '')
      setActiveSlug(h.startsWith('art-') ? h.slice(4) : null)
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // After the data lands, if there's a hash, scroll to it. Beats the
  // autoscroll-to-first-diff because deliberate intent.
  useEffect(() => {
    if (!q.data) return
    const h = window.location.hash.replace(/^#/, '')
    if (!h) return
    requestAnimationFrame(() => {
      const el = document.getElementById(h)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [q.data])

  if (idNorma && String(idNorma) !== numero) {
    return <Navigate to="/ley/$numero/$fecha" params={{ numero: String(idNorma), fecha }} replace />
  }

  if (resolved.isLoading || q.isLoading) return <IDEShell center={<Loading />} />
  if (resolved.isError || !idNorma) return <IDEShell center={<Failed />} />
  if (q.isError) return <IDEShell center={<Failed />} />
  const idx = q.data!
  const active: Commit | undefined =
    idx.commits.find(c => c.date === fecha) ?? idx.commits[idx.commits.length - 1]

  // Ensure this (idNorma, date) is in the tab session so the bar shows it.
  if (active && idx.norma) {
    if (!tabs.has(idx.norma.idNorma, active.date)) {
      tabs.add({
        idNorma: idx.norma.idNorma,
        date: active.date,
        titulo: idx.norma.titulo,
        tipo: idx.norma.tipo,
        numero: idx.norma.numero,
      })
    }
  }
  const activeIdx = active ? idx.commits.findIndex(c => c.sha === active.sha) : -1
  const prev = activeIdx > 0 ? idx.commits[activeIdx - 1] : null
  const isOriginal = activeIdx === 0
  const requestedMode = prefs.mode
  const effectiveMode: ReaderViewMode =
    (isOriginal && (requestedMode === 'redline' || requestedMode === 'side-by-side'))
      ? 'clean'
      : requestedMode

  const onMode = (m: ReaderViewMode) => setPrefs(writePrefs({ mode: m }))
  const onToggleMono = () => setPrefs(writePrefs({ monospace: !prefs.monospace }))
  const onToggleCollapse = () =>
    setPrefs(writePrefs({ collapseUnchanged: !prefs.collapseUnchanged }))

  const onCopyCitation = async () => {
    const cite = formatCitation({
      tipo: idx.norma.tipo,
      numero: idx.norma.numero,
      titulo: idx.norma.titulo,
      versionDate: active?.date ?? '',
      url: active ? ds.rawTextUrl(active.sha, idx.relDir + '/texto.md') : '',
    })
    try {
      await navigator.clipboard.writeText(cite)
      setCitationCopied(true)
      window.setTimeout(() => setCitationCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  const center = (
    <div className="lc-fade-up">
      <header className="mb-8 pb-6 border-b border-rule">
        <div className="flex items-baseline gap-3 mb-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            {idx.norma.tipo} · Nº {idx.norma.numero}
            {idx.norma.fechaPublicacion && ` · ${idx.norma.fechaPublicacion}`}
          </div>
          <button
            onClick={onCopyCitation}
            className="ml-auto text-[10px] text-ink-faint hover:text-indigo border border-rule rounded px-1.5 py-0.5 transition font-ui"
            title="Copiar cita y URL inmutable"
          >
            {citationCopied ? '✓ copiado' : 'Copiar cita'}
          </button>
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
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle mode={effectiveMode} setMode={onMode} canDiff={!isOriginal} />
          <button
            onClick={onToggleMono}
            className={`text-xs px-3 py-1.5 rounded font-mono border transition ${
              prefs.monospace
                ? 'bg-ink text-paper border-ink'
                : 'text-ink-soft hover:text-ink border-rule'
            }`}
            title="Cambiar a monoespaciada"
          >
            Mono
          </button>
          {!isOriginal && (effectiveMode === 'redline' || effectiveMode === 'side-by-side') && (
            <button
              onClick={onToggleCollapse}
              className={`text-xs px-3 py-1.5 rounded font-ui border transition ${
                prefs.collapseUnchanged
                  ? 'bg-ink text-paper border-ink'
                  : 'text-ink-soft hover:text-ink border-rule'
              }`}
              title="Colapsar secciones sin cambios"
            >
              Colapsar
            </button>
          )}
        </div>
      </div>

      {active && (
        <RedlineReader
          idNorma={idx.norma.idNorma}
          sha={active.sha}
          prevSha={prev?.sha ?? null}
          prevDate={prev?.date ?? null}
          prevCausaId={active.causaId}
          relDir={idx.relDir}
          mode={effectiveMode}
          monospace={prefs.monospace}
          collapseUnchanged={prefs.collapseUnchanged}
        />
      )}
    </div>
  )

  return (
    <IDEShell
      center={center}
      rightRail={<RightRail idx={idx} active={active} activeSlug={activeSlug} />}
    />
  )
}

function ModeToggle({
  mode,
  setMode,
  canDiff,
}: {
  mode: ReaderViewMode
  setMode: (m: ReaderViewMode) => void
  canDiff: boolean
}) {
  const opts: { id: ReaderViewMode; label: string; needsDiff?: boolean }[] = [
    { id: 'redline', label: 'Redline', needsDiff: true },
    { id: 'side-by-side', label: 'Lado a lado', needsDiff: true },
    { id: 'clean', label: 'Limpio' },
    { id: 'source', label: 'Fuente' },
  ]
  return (
    <div className="inline-flex items-center bg-paper-sunk rounded-md p-0.5 border border-rule text-xs">
      {opts.map(o => {
        const disabled = o.needsDiff && !canDiff
        return (
          <button
            key={o.id}
            disabled={disabled}
            onClick={() => setMode(o.id)}
            className={`px-3 py-1.5 rounded font-ui transition ${
              disabled
                ? 'opacity-40 cursor-not-allowed'
                : mode === o.id
                  ? 'bg-paper-raised shadow-sm text-ink'
                  : 'text-ink-soft hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function formatCitation({
  tipo,
  numero,
  titulo,
  versionDate,
  url,
}: {
  tipo: string
  numero: string
  titulo: string
  versionDate: string
  url: string
}): string {
  const head = `${capitalize(tipo)} N° ${numero}, "${truncate(titulo, 80)}"`
  const date = versionDate ? `, versión vigente al ${versionDate}` : ''
  return `${head}${date}.\nTexto: ${url}\nVía ley·chile (BCN, https://pisanvs.github.io/ley-chile)`
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

function Loading() {
  return <div className="opacity-60 mt-12 text-center text-sm">Cargando…</div>
}
function Failed() {
  return <div className="text-ruby mt-12 text-center text-sm">No se pudo cargar la ley.</div>
}
