'use client'

import Link from 'next/link'
import type { Commit, CommitsIndex } from '@/lib/commits'
import { canonicalHref } from '@/lib/href'

function SidebarHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-faint font-ui">
      {children}
    </h3>
  )
}

interface Props {
  idx: CommitsIndex
  active: Commit | undefined
}

export function VersionDetails({ idx, active }: Props) {
  if (!active) return null
  const versions = idx.commits
  const idx_pos = versions.findIndex(c => c.sha === active.sha)
  const prev = idx_pos > 0 ? versions[idx_pos - 1] : null
  const next = idx_pos < versions.length - 1 ? versions[idx_pos + 1] : null
  const isOriginal = idx_pos === 0
  const isCurrent = idx_pos === versions.length - 1

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-2">
        <SidebarHeading>Versión</SidebarHeading>
        <div className="font-display text-2xl leading-none">{active.date}</div>
        <div className="text-xs text-ink-soft">
          {isOriginal && 'Texto original'}
          {!isOriginal && isCurrent && 'Versión vigente'}
          {!isOriginal && !isCurrent && 'Versión histórica'}
        </div>
        <div className="text-[11px] text-ink-faint font-mono break-all pt-1">{active.sha.slice(0, 12)}</div>
      </section>

      <section className="space-y-2">
        <SidebarHeading>Cambios</SidebarHeading>
        <div className="text-xs text-ink-soft">{active.subject}</div>
        {active.causaId > 0 && active.causaId !== idx.norma.idNorma && (
          <Link
            href={`/ley/${active.causaId}`}
            className="inline-flex items-center gap-1 text-xs text-indigo hover:underline"
          >
            Ver norma modificadora <span aria-hidden>→</span>
          </Link>
        )}
      </section>

      <section className="space-y-2">
        <SidebarHeading>Cronología</SidebarHeading>
        <ol className="space-y-1.5">
          {versions.map((c, i) => (
            <li key={c.sha}>
              <Link
                href={canonicalHref(idx.norma, c.date)}
                className={`flex items-baseline gap-2 text-xs transition ${
                  c.sha === active.sha
                    ? 'text-ruby font-medium'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                <span className="font-mono">{c.date}</span>
                <span className="opacity-60">v{i + 1}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {(prev || next) && (
        <section className="space-y-2 pt-4 border-t border-rule">
          <SidebarHeading>Navegar</SidebarHeading>
          <div className="flex flex-col gap-1.5 text-xs">
            {prev && (
              <Link
                href={canonicalHref(idx.norma, prev.date)}
                className="text-ink-soft hover:text-ink"
              >
                ← {prev.date}
              </Link>
            )}
            {next && (
              <Link
                href={canonicalHref(idx.norma, next.date)}
                className="text-ink-soft hover:text-ink"
              >
                {next.date} →
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
