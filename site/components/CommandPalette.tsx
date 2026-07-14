'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'

const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley', dl: 'Decreto Ley', dfl: 'DFL', dto: 'Decreto', cod: 'Código', res: 'Resolución',
}

interface Hit { idNorma: number; tipo: string; numero: string; titulo: string }

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const seq = useRef(0)

  // Global ⌘K / Ctrl+K to open, Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Debounced server search.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    const id = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (id === seq.current) setHits(data.hits ?? [])
      } catch {
        if (id === seq.current) setHits([])
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  function pick(h: Hit) {
    setOpen(false)
    setQuery('')
    router.push(`/${h.tipo}/${h.numero}`)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <Command
        label="Buscar en el corpus"
        shouldFilter={false}
        className="lc-modal-pop relative w-full max-w-2xl overflow-hidden rounded-xl border border-rule bg-paper-raised shadow-2xl"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          autoFocus
          placeholder="Buscar leyes, decretos, códigos…"
        />
        <Command.List>
          {loading && <Command.Loading><div className="px-4 py-3 text-sm text-ink-faint">Buscando…</div></Command.Loading>}
          {!loading && query.trim().length >= 2 && hits.length === 0 && (
            <Command.Empty>Sin resultados.</Command.Empty>
          )}
          {hits.map((h) => (
            <Command.Item key={h.idNorma} value={String(h.idNorma)} onSelect={() => pick(h)}>
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                {(TIPO_LABEL[h.tipo] ?? h.tipo)} {h.numero}
              </span>
              <span className="font-display text-[15px] text-ink">{h.titulo}</span>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  )
}
