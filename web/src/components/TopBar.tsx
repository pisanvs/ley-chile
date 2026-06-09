import { Link } from '@tanstack/react-router'
import { useTheme } from '@/lib/theme'
import { useCmdK } from '@/components/CmdK'

interface Props {
  /** Optional crumb shown to the right of the brand — usually the active law's title. */
  crumb?: string
}

export function TopBar({ crumb }: Props) {
  const { theme, toggle } = useTheme()
  const { open } = useCmdK()

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[color-mix(in_oklab,var(--color-paper)_82%,transparent)] border-b border-rule">
      <div className="h-14 px-4 md:px-6 flex items-center gap-4">
        <Link
          to="/"
          className="font-display text-[1.05rem] tracking-tight leading-none flex items-baseline gap-2"
        >
          <span className="text-ruby">ley</span>
          <span>·chile</span>
        </Link>
        {crumb && (
          <>
            <span className="text-ink-faint">/</span>
            <span className="text-sm text-ink-soft truncate max-w-[40ch]">{crumb}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={open}
            className="hidden sm:inline-flex items-center gap-2 text-xs text-ink-soft hover:text-ink border border-rule rounded-md pl-2 pr-1.5 py-1 transition"
            aria-label="Buscar"
          >
            <SearchIcon />
            <span>Buscar</span>
            <kbd className="ml-1 font-mono text-[10px] bg-paper-sunk text-ink-soft px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
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
