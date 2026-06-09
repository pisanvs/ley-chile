import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }

const Ctx = createContext<ThemeCtx | null>(null)
const KEY = 'lc-theme'

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(KEY) as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitial)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(KEY, theme)
  }, [theme])
  const value = useMemo<ThemeCtx>(
    () => ({ theme, setTheme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }),
    [theme]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used inside ThemeProvider')
  return v
}
