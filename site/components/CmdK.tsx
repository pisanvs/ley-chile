'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'

interface Hit {
  idNorma: number
  numero: string
  tipo: string
  titulo: string
}

interface CmdKCtx { open: () => void; close: () => void; isOpen: boolean; prefetch: () => void }

const Ctx = createContext<CmdKCtx | null>(null)

export function CmdKProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])

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

  // Server-side search (Meilisearch hot path + Postgres cold path), debounced.
  // No client index is built and no full titles list is shipped — this is what
  // the SSR/search rework exists to provide.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    const id = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await r.json()
        if (id === seq.current) setHits(data.hits ?? [])
      } catch {
        if (id === seq.current) setHits([])
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, 160)
    return () => clearTimeout(t)
  }, [query])

  // Server-side search needs no client index to warm; prefetch is a no-op kept
  // for API parity with the callers (TopBar, landing) that hover-prefetch.
  const prefetch = useCallback(() => {}, [])
  const value = useMemo<CmdKCtx>(() => ({ open, close, isOpen, prefetch }), [open, close, isOpen, prefetch])

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
              placeholder="Buscar por título, número, texto…"
              value={query}
              onValueChange={setQuery}
            />
            <Command.List>
              {loading && query.trim().length >= 2 && (
                <Command.Loading><div className="px-4 py-3 text-sm text-ink-faint">Buscando…</div></Command.Loading>
              )}
              {!loading && hits.length === 0 && query.trim().length >= 2 && (
                <Command.Empty>Sin resultados.</Command.Empty>
              )}
              {!loading && query.trim().length < 2 && (
                <Command.Empty>Escribe al menos 2 caracteres.</Command.Empty>
              )}
              {hits.map((r) => (
                <Command.Item
                  key={r.idNorma}
                  value={String(r.idNorma)}
                  onSelect={() => {
                    setOpen(false)
                    setQuery('')
                    router.push(`/${r.tipo}/${r.numero}`)
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
