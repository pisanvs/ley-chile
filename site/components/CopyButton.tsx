'use client'

import { useState } from 'react'

/** Copies `text` (or the current URL + `hash`) to the clipboard, with feedback. */
export function CopyButton({
  text,
  hash,
  label,
  done = 'Copiado',
  className = '',
  children,
}: {
  text?: string
  hash?: string
  label?: string
  done?: string
  className?: string
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const value =
      text ?? (typeof window !== 'undefined' ? window.location.origin + window.location.pathname + (hash ?? '') : '')
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }

  return (
    <button type="button" onClick={copy} aria-label={label} className={className}>
      {copied ? done : children ?? label}
    </button>
  )
}
