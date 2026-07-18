'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/lib/theme'
import { useCmdK } from '@/components/CmdK'

interface Props {
  /** Optional crumb shown to the right of the brand — usually the active law's title. */
  crumb?: string
}

const REPO = 'pisanvs/ley-chile'

async function fetchStarCount(): Promise<number | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}`)
  if (!r.ok) return null
  const data = (await r.json()) as { stargazers_count?: number }
  return typeof data.stargazers_count === 'number' ? data.stargazers_count : null
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(n / 1000) + 'k'
}

export function TopBar({ crumb }: Props) {
  const { theme, toggle } = useTheme()
  const { open, prefetch } = useCmdK()
  // Stargazers — public unauthenticated GitHub API, 60 req/hr per IP. Caching
  // for an hour is more than enough for a homepage ornament.
  const starsQ = useQuery({
    queryKey: ['github-stars', REPO],
    queryFn: fetchStarCount,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  })

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[color-mix(in_oklab,var(--color-paper)_82%,transparent)] border-b border-rule">
      <div className="h-14 px-4 md:px-6 flex items-center gap-4">
        <Link
          href="/"
          className="font-display text-[1.05rem] tracking-tight leading-none flex items-baseline gap-2"
        >
          <span className="text-ruby">ley</span>
          <span>·chile</span>
        </Link>
        <a
          href={`https://github.com/${REPO}`}
          target="_blank"
          rel="noopener noreferrer"
          title={
            starsQ.data !== null && starsQ.data !== undefined
              ? `${starsQ.data.toLocaleString('es-CL')} stargazers en GitHub`
              : 'Ver en GitHub'
          }
          className="group hidden sm:inline-flex items-center text-[11px] font-mono text-ink-soft hover:text-ink border border-rule rounded-md overflow-hidden transition"
        >
          <span className="flex items-center gap-1 px-1.5 py-1 bg-paper-sunk border-r border-rule">
            <GitHubMark />
            <span className="font-ui uppercase tracking-widest text-[10px]">star</span>
          </span>
          <span className="px-1.5 py-1 inline-flex items-center gap-1">
            <StarIcon active={!!starsQ.data} />
            <span className="tabular-nums">
              {starsQ.data !== null && starsQ.data !== undefined
                ? formatCount(starsQ.data)
                : '—'}
            </span>
          </span>
        </a>
        {crumb && (
          <>
            <span className="text-ink-faint">/</span>
            <span className="text-sm text-ink-soft truncate max-w-[40ch]">{crumb}</span>
          </>
        )}
        <nav className="ml-auto hidden md:flex items-center gap-1 text-xs" aria-label="Secciones">
          <Link
            href="/temas"
            className="px-2 py-1 rounded-md text-ink-soft hover:text-ink hover:bg-paper-sunk transition"
          >
            Temas
          </Link>
          <Link
            href="/guia"
            className="px-2 py-1 rounded-md text-ink-soft hover:text-ink hover:bg-paper-sunk transition"
          >
            Guías
          </Link>
          <Link
            href="/blog"
            className="px-2 py-1 rounded-md text-ink-soft hover:text-ink hover:bg-paper-sunk transition"
          >
            Blog
          </Link>
        </nav>
        <div className="ml-auto md:ml-3 flex items-center gap-2">
          <a
            href="https://www.kerokero.cl"
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="hidden lg:inline-flex items-center gap-1.5 text-[11px] text-ink-faint hover:text-ink transition mr-1"
            title="Auspiciado por kerokero"
          >
            <span className="hidden xl:inline">Auspiciado por</span>
            <img src="/kerokero.svg" alt="" width={15} height={15} className="shrink-0" aria-hidden />
            <span className="font-medium">kerokero</span>
          </a>
          <button
            onClick={open}
            onMouseEnter={prefetch}
            onFocus={prefetch}
            className="hidden sm:inline-flex items-center gap-2 text-xs text-ink-soft hover:text-ink border border-rule rounded-md pl-2 pr-1.5 py-1 transition"
            aria-label="Buscar"
          >
            <SearchIcon />
            <span>Buscar</span>
            <kbd className="ml-1 font-mono text-[10px] bg-paper-sunk text-ink-soft px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
          <a
            href="https://github.com/pisanvs/ley-chile/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-indigo border border-rule rounded-md px-2 py-1 transition"
            title="Reportar problemas o sugerir mejoras en GitHub"
          >
            <FeedbackIcon />
            <span>Feedback</span>
          </a>
          <button
            onClick={toggle}
            className="p-1.5 text-ink-soft hover:text-ink transition rounded-md"
            aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}
function FeedbackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  )
}
function GitHubMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.18c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.27-5.23-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.82 1.18 3.07 0 4.39-2.69 5.36-5.25 5.64.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z"/>
    </svg>
  )
}
function StarIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? 'text-amber-500' : 'text-ink-faint'}
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
