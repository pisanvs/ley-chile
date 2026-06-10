import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import MiniSearch, { type SearchResult } from 'minisearch'
import { loadTitles, type TitleEntry } from '@/lib/titles'

interface CmdKCtx {
  open: () => void
  close: () => void
  /** Best-effort prefetch — call on hover/focus of any CTA that will need
   *  the titles index. Safe to call repeatedly; titles.ts dedupes. */
  prefetch: () => void
  isOpen: boolean
}

const Ctx = createContext<CmdKCtx | null>(null)

export function CmdKProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [prefetched, setPrefetched] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  const prefetch = useCallback(() => {
    if (prefetched) return
    setPrefetched(true)
    loadTitles().catch(() => { /* swallow — useQuery surfaces it later */ })
  }, [prefetched])

  // Global ⌘K / Ctrl+K binding
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Don't eager-fetch on mount — the titles index is multi-megabyte and
  // competes with the LCP element. Wait until *anything* signals intent:
  // user hovers the Buscar button (sets `prefetched`), opens ⌘K, or the
  // navigator's chronology group decides it's done with idle priority.
  const titlesQ = useQuery({
    queryKey: ['titles'],
    queryFn: loadTitles,
    enabled: isOpen || prefetched,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const mini = useMemo(() => {
    if (!titlesQ.data) return null
    const ms = new MiniSearch<TitleEntry>({
      fields: ['titulo', 'numero', 'organismo', 'tipo'],
      storeFields: ['idNorma', 'numero', 'tipo', 'titulo', 'organismo', 'fechaPublicacion'],
      idField: 'idNorma',
      searchOptions: { prefix: true, fuzzy: 0.15, boost: { titulo: 2, numero: 3 } },
    })
    ms.addAll(titlesQ.data)
    return ms
  }, [titlesQ.data])

  const results: SearchResult[] = useMemo(() => {
    if (!mini || query.trim().length < 2) return []
    return mini.search(query).slice(0, 20)
  }, [mini, query])

  const value = useMemo<CmdKCtx>(
    () => ({ open, close, prefetch, isOpen }),
    [open, close, prefetch, isOpen],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <Command.Dialog
        open={isOpen}
        onOpenChange={setOpen}
        label="Buscar leyes"
        className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      >
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          onClick={close}
          aria-hidden
        />
        <div className="relative w-full max-w-2xl rounded-xl shadow-2xl border border-rule overflow-hidden bg-paper-raised lc-fade-up">
          <Command shouldFilter={false} loop>
            <Command.Input
              ref={inputRef}
              autoFocus
              placeholder={titlesQ.isLoading ? 'Cargando índice…' : 'Buscar por título, número, organismo…'}
              value={query}
              onValueChange={setQuery}
            />
            <Command.List>
              {titlesQ.isError && (
                <Command.Empty>No se pudo cargar el índice.</Command.Empty>
              )}
              {!titlesQ.isLoading && results.length === 0 && query.length >= 2 && (
                <Command.Empty>Sin resultados.</Command.Empty>
              )}
              {!titlesQ.isLoading && results.length === 0 && query.length < 2 && (
                <Command.Empty>Escribe al menos 2 caracteres.</Command.Empty>
              )}
              {results.map((r) => (
                <Command.Item
                  key={r.idNorma}
                  value={String(r.idNorma)}
                  onSelect={() => {
                    setOpen(false)
                    setQuery('')
                    navigate({ to: '/ley/$numero', params: { numero: String(r.idNorma) } })
                  }}
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[10px] uppercase tracking-widest text-ink-faint shrink-0">
                      {r.tipo} · {r.numero}
                    </span>
                  </div>
                  <div className="font-display text-[0.95rem] leading-snug truncate">
                    {r.titulo}
                  </div>
                  {r.organismo && (
                    <div className="text-[11px] text-ink-faint truncate">{r.organismo}</div>
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      </Command.Dialog>
    </Ctx.Provider>
  )
}

export function useCmdK() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCmdK must be used inside CmdKProvider')
  return v
}
