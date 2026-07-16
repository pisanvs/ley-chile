'use client'

import { useState } from 'react'

/**
 * "Añádelo a tu agente" — the MCP endpoint plus one-click install per client.
 *
 * Cursor and VS Code accept deep links that install a server directly. Claude
 * and Codex don't, so those copy the exact command/config instead of pretending
 * a link exists.
 */

const MCP_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/mcp`
    : 'https://leyes.pisanvs.cl/api/mcp'

const NAME = 'leychile'

function cursorLink(url: string): string {
  const cfg = btoa(JSON.stringify({ url }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${NAME}&config=${encodeURIComponent(cfg)}`
}

function vscodeLink(url: string): string {
  const cfg = JSON.stringify({ name: NAME, type: 'http', url })
  return `vscode:mcp/install?${encodeURIComponent(cfg)}`
}

interface Client {
  id: string
  label: string
  /** A deep link installs directly; otherwise we copy `copy` and show `hint`. */
  href?: (url: string) => string
  copy?: (url: string) => string
  hint?: string
}

const CLIENTS: Client[] = [
  {
    id: 'claude',
    label: 'Claude',
    copy: (u) => u,
    hint: 'Copiado. Pégalo en Claude → Settings → Connectors → Add custom connector.',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    copy: (u) => `claude mcp add --transport http ${NAME} ${u}`,
    hint: 'Comando copiado — pégalo en tu terminal.',
  },
  { id: 'cursor', label: 'Cursor', href: cursorLink },
  { id: 'vscode', label: 'VS Code', href: vscodeLink },
  {
    id: 'codex',
    label: 'Codex',
    copy: (u) => `codex mcp add ${NAME} -- npx -y mcp-remote ${u}`,
    hint: 'Comando copiado — Codex habla MCP por stdio, así que puentea con mcp-remote.',
  },
  {
    id: 'json',
    label: 'JSON',
    copy: (u) => JSON.stringify({ mcpServers: { [NAME]: { url: u } } }, null, 2),
    hint: 'Config copiada — para cualquier cliente MCP.',
  },
]

export function MCPConnect() {
  const [note, setNote] = useState<string | null>(null)

  async function onCopy(c: Client) {
    try {
      await navigator.clipboard.writeText(c.copy!(MCP_URL))
      setNote(c.hint ?? 'Copiado.')
      setTimeout(() => setNote(null), 3200)
    } catch {
      setNote('No se pudo copiar — selecciona la URL manualmente.')
      setTimeout(() => setNote(null), 3200)
    }
  }

  return (
    <section className="px-6 md:px-12 max-w-5xl mx-auto pb-24">
      <div className="border-t border-rule pt-12">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-3">
          Para agentes
        </p>
        <h2 className="font-display text-2xl md:text-3xl leading-tight text-balance mb-3">
          Conectá el corpus a tu agente
        </h2>
        <p className="text-ink-soft text-[14.5px] leading-relaxed max-w-2xl mb-6">
          Un servidor <strong className="text-ink">MCP</strong> sobre todo el corpus: buscar
          normas, leer un artículo en cualquier fecha, y comparar dos versiones palabra por
          palabra. Sólo lectura, sin autenticación.
        </p>

        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <code className="font-mono text-[12.5px] bg-paper-sunk border border-rule rounded-md px-2.5 py-1.5 text-ink-soft">
            {MCP_URL}
          </code>
          <a
            href="/llms.txt"
            className="text-xs text-ink-faint hover:text-indigo underline underline-offset-2"
          >
            llms.txt
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          {CLIENTS.map((c) =>
            c.href ? (
              <a
                key={c.id}
                href={c.href(MCP_URL)}
                className="text-xs font-ui px-3 py-1.5 rounded-md border border-rule text-ink-soft hover:text-ink hover:border-ink/40 transition"
              >
                + {c.label}
              </a>
            ) : (
              <button
                key={c.id}
                onClick={() => onCopy(c)}
                className="text-xs font-ui px-3 py-1.5 rounded-md border border-rule text-ink-soft hover:text-ink hover:border-ink/40 transition"
              >
                + {c.label}
              </button>
            ),
          )}
        </div>

        <p className="text-xs text-ink-faint mt-3 h-4" role="status" aria-live="polite">
          {note}
        </p>
      </div>
    </section>
  )
}
