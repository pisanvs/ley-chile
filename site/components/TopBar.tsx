import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

/** App chrome: brand mark, inline search, theme toggle. Sticky, paper-raised. */
export function TopBar({ query = '' }: { query?: string }) {
  return (
    <header
      role="banner"
      className="sticky top-0 z-30 border-b border-rule bg-paper-raised/85 backdrop-blur supports-[backdrop-filter]:bg-paper-raised/70"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2 whitespace-nowrap">
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            Ley<span className="text-ruby">Chile</span>
          </span>
          <span className="hidden text-xs text-ink-faint sm:inline">
            cada versión de cada ley
          </span>
        </Link>

        <form action="/buscar" method="get" className="ml-auto flex-1 sm:max-w-md">
          <label className="flex items-center gap-2 rounded-lg border border-rule bg-paper px-3 py-1.5 text-sm text-ink-soft transition-colors focus-within:border-indigo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-faint">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Buscar leyes, artículos…"
              className="w-full bg-transparent text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
        </form>

        <ThemeToggle />
      </div>
    </header>
  )
}
