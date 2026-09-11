'use client'

import { useState } from 'react'

import { CITE_FORMATS, renderCite, type CiteFormat, type CiteSource } from '@/lib/cite'

/**
 * Every citation format for one norma, each copyable.
 *
 * The strings are rendered on the client rather than passed down pre-rendered
 * because two of them embed today's date (BibTeX `urldate`, RIS `Y2`). Rendered
 * on the server they would be baked into a cached page and slowly go stale —
 * an access date that predates the visit is wrong in a way nobody would notice.
 */
export function CiteFormatList({ source }: { source: CiteSource }) {
  const [copied, setCopied] = useState<CiteFormat | null>(null)

  async function copy(fmt: CiteFormat, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(fmt)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      // Unavailable over plain HTTP; the text is selectable regardless.
    }
  }

  return (
    <div className="space-y-2.5">
      {CITE_FORMATS.map((f) => {
        const text = renderCite(f.id, source)
        const multiline = text.includes('\n')
        return (
          <div
            key={f.id}
            className="rounded-lg border border-rule bg-paper-sunk overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-3.5 pt-2 pb-1.5 border-b border-rule/60">
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">
                {f.label}
                {f.hint && <span className="ml-2 normal-case tracking-normal">· {f.hint}</span>}
              </span>
              <button
                onClick={() => copy(f.id, text)}
                className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint hover:text-indigo transition-colors"
              >
                {copied === f.id ? 'copiado' : 'copiar'}
              </button>
            </div>
            <p
              className={`px-3.5 py-2.5 text-ink-soft ${
                multiline
                  ? 'font-mono text-[12px] leading-relaxed whitespace-pre overflow-x-auto'
                  : 'text-[13.5px] leading-relaxed break-words'
              }`}
            >
              {text}
            </p>
          </div>
        )
      })}
    </div>
  )
}
