'use client'

import { useEffect, useRef, useState } from 'react'

import { CITE_FORMATS, renderCite, type CiteFormat, type CiteSource } from '@/lib/cite'

/**
 * "citar ▾" — copies a citation for this article in the reader's format.
 *
 * Sits beside the existing `#` permalink and shares its hover-reveal, so the
 * article header gains an affordance without gaining visual noise.
 *
 * Clicking the label copies the Chilean legal form directly: it is the one
 * that is unambiguously correct, and the common case should cost one click.
 * The caret opens the rest — APA/MLA/Chicago for students, BibTeX/RIS for
 * reference managers, Markdown for anyone linking to us.
 */
export function CiteButton({
  source,
  slug,
}: {
  /** Everything except the URL, which is resolved at click time. */
  source: Omit<CiteSource, 'url'>
  /** Article anchor on the page, e.g. "art-12". */
  slug: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<CiteFormat | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function copy(fmt: CiteFormat) {
    // Resolved at click time, not render time: the reader changes the version
    // in the address bar without remounting, so a URL captured at render would
    // cite the wrong date — the exact error this feature exists to prevent.
    const { origin, pathname } = window.location
    const url = `${origin}${pathname}#art-${slug}`
    try {
      await navigator.clipboard.writeText(renderCite(fmt, { ...source, url }))
      setCopied(fmt)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded views.
      // Saying nothing beats claiming a copy that did not happen.
    }
    setOpen(false)
  }

  const btn =
    'text-[10px] text-ink-faint hover:text-indigo px-1.5 py-0.5 border border-rule ' +
    'rounded transition'

  return (
    <div ref={ref} className="relative inline-flex items-stretch">
      <button
        onClick={() => copy('chile')}
        title="Copiar cita legal"
        className={`${btn} rounded-r-none border-r-0 font-ui`}
      >
        {copied ? 'copiado' : 'citar'}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Elegir formato de cita"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${btn} rounded-l-none px-1 font-mono leading-none`}
      >
        ▾
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 w-48 rounded-lg border border-rule
                     bg-paper-raised shadow-lg overflow-hidden"
        >
          {CITE_FORMATS.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              onClick={() => copy(f.id)}
              className="w-full text-left px-3 py-1.5 text-[12px] font-ui text-ink-soft
                         hover:bg-paper-sunk hover:text-ink transition flex items-baseline gap-2"
            >
              <span>{f.label}</span>
              {f.hint && (
                <span className="ml-auto text-[10px] text-ink-faint">{f.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
