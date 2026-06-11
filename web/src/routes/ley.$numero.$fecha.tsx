import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchCommits, resolveToIdNorma, type Commit } from '@/lib/commits'
import { IDEShell } from '@/components/IDEShell'
import { VersionScrubber } from '@/components/VersionScrubber'
import { RedlineReader, type ReaderViewMode } from '@/components/RedlineReader'
import { RightRail } from '@/components/RightRail'
import { Navigator } from '@/components/Navigator'
import { readPrefs, writePrefs } from '@/lib/annotations'
import { ds } from '@/lib/datasource'
import { tabs } from '@/lib/tabs'

interface LawSearch {
  /** 7-char SHA prefix that disambiguates the active version when multiple
   *  commits share $fecha. When unset, falls back to the latest commit on
   *  $fecha (which matches what the version scrubber shows as "today"). */
  at?: string
  /** SHA prefix (7 chars) of an arbitrary earlier or later version to
   *  compare against. When set, the redline diffs the active version
   *  against this one instead of the immediate previous commit. */
  vs?: string
}

const SHA7_RE = /^[0-9a-f]{7,40}$/i

export const Route = createFileRoute('/ley/$numero/$fecha')({
  component: IDEPage,
  validateSearch: (raw: Record<string, unknown>): LawSearch => {
    const out: LawSearch = {}
    if (typeof raw.at === 'string' && SHA7_RE.test(raw.at)) out.at = raw.at.slice(0, 7)
    if (typeof raw.vs === 'string' && SHA7_RE.test(raw.vs)) out.vs = raw.vs.slice(0, 7)
    return out
  },
})

function IDEPage() {
  const { numero, fecha } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState(readPrefs)
  const [citationCopied, setCitationCopied] = useState(false)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState<boolean>(!!search.vs)

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

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, '')
      setActiveSlug(h.startsWith('art-') ? h.slice(4) : null)
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
  // Active version resolution is SHA-authoritative when `?at=sha7` is set.
  // This matters when multiple commits share $fecha — without a SHA, find()
  // would return the first match and `commits[activeIdx-1]` would land on a
  // sibling same-date commit instead of the genuinely-prior date.
  // Falls back to the LATEST commit with that date when no SHA hint, so the
  // user always lands on "today's most recent state" by default.
  const sameDate = idx.commits.filter(c => c.date === fecha)
  const byShaHint = search.at
    ? idx.commits.find(c => c.sha.startsWith(search.at!))
    : undefined
  const active: Commit | undefined =
    byShaHint
    ?? sameDate[sameDate.length - 1]
    ?? idx.commits[idx.commits.length - 1]

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

  // Range diff: `?vs=sha7` picks a specific earlier (or later) version to
  // compare against. Falls back to the commit immediately preceding active.
  const adjacentPrev = activeIdx > 0 ? idx.commits[activeIdx - 1] : null
  const vsCommit = search.vs
    ? idx.commits.find(c => c.sha.startsWith(search.vs!)) ?? null
    : null
  const prev = vsCommit ?? adjacentPrev
  const isOriginal = activeIdx === 0 && !vsCommit
  const isRangeDiff = !!vsCommit && vsCommit.sha !== adjacentPrev?.sha

  const requestedMode = prefs.mode
  const effectiveMode: ReaderViewMode =
    (isOriginal && (requestedMode === 'redline' || requestedMode === 'side-by-side'))
      ? 'clean'
      : requestedMode

  const onMode = (m: ReaderViewMode) => setPrefs(writePrefs({ mode: m }))
  const onToggleMono = () => setPrefs(writePrefs({ monospace: !prefs.monospace }))
  const onToggleCollapse = () =>
    setPrefs(writePrefs({ collapseUnchanged: !prefs.collapseUnchanged }))

  const onPickVs = (sha: string | null) => {
    navigate({
      to: '/ley/$numero/$fecha',
      params: { numero, fecha },
      search: prev => ({ ...prev, vs: sha ? sha.slice(0, 7) : undefined }),
      replace: true,
    })
  }

  const onPickActive = (c: Commit) => {
    // Carry the SHA prefix so URLs always land on the exact commit clicked,
    // even when the version scrubber has multiple dots on a single date.
    navigate({
      to: '/ley/$numero/$fecha',
      params: { numero, fecha: c.date },
      search: { at: c.sha.slice(0, 7) },
    })
  }

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
        <div className="flex items-baseline gap-3 mb-1 flex-wrap">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-faint flex items-baseline gap-2">
            <span>{idx.norma.tipo} · Nº {idx.norma.numero}</span>
            {idx.norma.fechaPublicacion && <span>· {idx.norma.fechaPublicacion}</span>}
            {active && (
              <a
                href={ds.commitUrl(active.sha)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Ver commit ${active.sha.slice(0, 7)} en GitHub`}
                className="font-mono normal-case tracking-normal text-ink-faint hover:text-indigo transition border border-rule px-1 py-px rounded inline-flex items-center gap-1"
              >
                <GitHubIcon />
                {active.sha.slice(0, 7)}
              </a>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <LLMButton
              kind="chatgpt"
              law={idx.norma}
              versionDate={active?.date}
              sha={active?.sha}
              relDir={idx.relDir}
            />
            <LLMButton
              kind="claude"
              law={idx.norma}
              versionDate={active?.date}
              sha={active?.sha}
              relDir={idx.relDir}
            />
            <button
              onClick={onCopyCitation}
              className="text-[10px] text-ink-faint hover:text-indigo border border-rule rounded px-1.5 py-0.5 transition font-ui"
              title="Copiar cita y URL inmutable"
            >
              {citationCopied ? '✓ copiado' : 'Copiar cita'}
            </button>
          </div>
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
          onPick={onPickActive}
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
              title={prefs.collapseUnchanged ? 'Mostrar todas las secciones' : 'Colapsar secciones sin cambios'}
            >
              {prefs.collapseUnchanged ? 'Expandir todo' : 'Colapsar'}
            </button>
          )}
          {idx.commits.length > 1 && (
            <button
              onClick={() => setCompareOpen(o => !o)}
              className={`text-xs px-3 py-1.5 rounded font-ui border transition ${
                compareOpen || isRangeDiff
                  ? 'bg-indigo text-paper border-indigo'
                  : 'text-ink-soft hover:text-ink border-rule'
              }`}
              title="Comparar esta versión con cualquier otra versión histórica"
            >
              Comparar versiones
            </button>
          )}
        </div>

        {compareOpen && idx.commits.length > 1 && (
          <CompareBar
            commits={idx.commits}
            active={active}
            vs={search.vs ?? null}
            onPickVs={onPickVs}
            isRangeDiff={isRangeDiff}
            adjacentDate={adjacentPrev?.date ?? null}
          />
        )}
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
      navigator={<Navigator activeId={idx.norma.idNorma} />}
      center={center}
      rightRail={<RightRail idx={idx} active={active} activeSlug={activeSlug} />}
    />
  )
}

function CompareBar({
  commits,
  active,
  vs,
  onPickVs,
  isRangeDiff,
  adjacentDate,
}: {
  commits: Commit[]
  active: Commit | undefined
  vs: string | null
  onPickVs: (sha: string | null) => void
  isRangeDiff: boolean
  adjacentDate: string | null
}) {
  const vsSha = vs ? commits.find(c => c.sha.startsWith(vs))?.sha ?? '' : ''
  return (
    <div className="rounded-md border border-indigo/30 bg-indigo/[0.04] p-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-ink-faint font-ui">
        Comparar con
      </span>
      <select
        value={vsSha}
        onChange={e => onPickVs(e.target.value || null)}
        className="text-xs bg-paper-raised border border-rule rounded px-2 py-1 font-mono"
      >
        <option value="">
          ← versión inmediatamente anterior{adjacentDate ? ` (${adjacentDate})` : ''}
        </option>
        {commits
          .filter(c => c.sha !== active?.sha)
          .map(c => (
            <option key={c.sha} value={c.sha}>
              {c.date} · {c.sha.slice(0, 7)}
            </option>
          ))}
      </select>
      <span className="text-[11px] text-ink-soft">
        contra{' '}
        <span className="font-mono">
          {active?.date ?? '—'}
          {active && ` · ${active.sha.slice(0, 7)}`}
        </span>
      </span>
      {isRangeDiff && (
        <button
          onClick={() => onPickVs(null)}
          className="ml-auto text-[10px] text-ink-faint hover:text-ink"
          title="Volver a la comparación con la versión anterior"
        >
          ✕ limpiar
        </button>
      )}
    </div>
  )
}

function LLMButton({
  kind,
  law,
  versionDate,
  sha,
  relDir,
}: {
  kind: 'chatgpt' | 'claude'
  law: { tipo: string; numero: string; titulo: string }
  versionDate?: string
  sha?: string
  relDir: string
}) {
  if (!sha || !versionDate) return null
  const rawUrl = ds.rawTextUrl(sha, relDir + '/texto.md')
  const prompt =
    `Analiza esta norma chilena y respóndeme en español:\n\n` +
    `${capitalize(law.tipo)} N° ${law.numero} — "${law.titulo}"\n` +
    `Versión vigente al ${versionDate}.\n` +
    `Texto completo: ${rawUrl}\n\n` +
    `Necesito un resumen y los puntos más importantes.`
  const href =
    kind === 'chatgpt'
      ? `https://chat.openai.com/?q=${encodeURIComponent(prompt)}`
      : `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
  const label = kind === 'chatgpt' ? 'ChatGPT' : 'Claude'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir esta versión en ${label} con un prompt prellenado`}
      className="text-[10px] text-ink-faint hover:text-indigo border border-rule rounded px-1.5 py-0.5 transition font-ui inline-flex items-center gap-1"
    >
      <SparkleIcon />
      {label}
    </a>
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

function GitHubIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.18c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.27-5.23-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.82 1.18 3.07 0 4.39-2.69 5.36-5.25 5.64.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z"/>
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" />
    </svg>
  )
}

function Loading() {
  return <div className="opacity-60 mt-12 text-center text-sm">Cargando…</div>
}
function Failed() {
  return <div className="text-ruby mt-12 text-center text-sm">No se pudo cargar la ley.</div>
}
