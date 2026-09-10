'use client'

import { useState } from 'react'

/**
 * A code block you can lift straight into a terminal.
 *
 * The copy affordance is the whole point: docs that make you select-and-drag a
 * multi-line curl invocation get pasted wrong. Follows MCPConnect's idiom —
 * copy, then confirm in place with an instruction rather than a toast.
 */
export function CopyBlock({
  code,
  caption,
  lang = 'bash',
}: {
  code: string
  caption?: string
  lang?: 'bash' | 'json' | 'http'
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded views.
      // The code is selectable either way, so say nothing rather than lie.
    }
  }

  return (
    <figure className="rounded-lg border border-rule bg-paper-sunk overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3.5 pt-2.5 pb-2 border-b border-rule/60">
        <figcaption className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {caption ?? (lang === 'json' ? 'Respuesta' : 'Petición')}
        </figcaption>
        <button
          onClick={copy}
          className="text-[10px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink transition-colors"
          aria-label="Copiar al portapapeles"
        >
          {copied ? 'copiado' : 'copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed">
        <code className="font-mono text-ink-soft whitespace-pre">{code}</code>
      </pre>
    </figure>
  )
}
