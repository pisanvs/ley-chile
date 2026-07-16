'use client'

import { useState } from 'react'

import { MCP_PATH, SITE } from '@/lib/site'
import {
  ClaudeCodeIcon, ClaudeIcon, CodexIcon, CursorIcon, JsonIcon, VSCodeIcon,
} from '@/components/AgentIcons'

/**
 * "Conecta el corpus a tu agente" — the MCP endpoint plus one-click install.
 *
 * Cursor and VS Code accept deep links that install a server directly. Claude
 * and Codex don't, so those copy the exact command/config instead of pretending
 * a link exists.
 */

// Prefer the live origin so previews advertise themselves, not production;
// fall back to the canonical constant during SSR.
const MCP_URL =
  typeof window !== 'undefined' ? `${window.location.origin}${MCP_PATH}` : `${SITE}${MCP_PATH}`

const NAME = 'leychile'

function cursorLink(url: string): string {
  const cfg = btoa(JSON.stringify({ url }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${NAME}&config=${encodeURIComponent(cfg)}`
}

function vscodeLink(url: string): string {
  const cfg = JSON.stringify({ name: NAME, type: 'http', url })
  return `vscode:mcp/install?${encodeURIComponent(cfg)}`
}

type IconFn = (p: { className?: string }) => React.ReactNode

interface Client {
  id: string
  label: string
  Icon: IconFn
  /** A deep link installs directly; otherwise we copy `copy` and show `hint`. */
  href?: (url: string) => string
  copy?: (url: string) => string
  /** Shown after copying. An instruction — what to do now — never an explanation. */
  hint?: string
}

const CLIENTS: Client[] = [
  {
    id: 'claude',
    label: 'Claude',
    Icon: ClaudeIcon,
    copy: (u) => u,
    hint: 'Copiado. Pégalo en Claude → Settings → Connectors → Add custom connector.',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    Icon: ClaudeCodeIcon,
    copy: (u) => `claude mcp add --transport http ${NAME} ${u}`,
    hint: 'Comando copiado — pégalo en tu terminal.',
  },
  { id: 'cursor', label: 'Cursor', Icon: CursorIcon, href: cursorLink },
  { id: 'vscode', label: 'VS Code', Icon: VSCodeIcon, href: vscodeLink },
  {
    id: 'codex',
    label: 'Codex',
    Icon: CodexIcon,
    copy: (u) => `codex mcp add ${NAME} -- npx -y mcp-remote ${u}`,
    hint: 'Comando copiado — pégalo en tu terminal.',
  },
  {
    id: 'json',
    label: 'JSON',
    Icon: JsonIcon,
    copy: (u) => JSON.stringify({ mcpServers: { [NAME]: { url: u } } }, null, 2),
    hint: 'Config copiada — pégala en tu cliente MCP.',
  },
]

/** A real question the corpus can answer, to show what "conectado" buys you. */
const EXAMPLE = '¿Qué cambió la ley 21.806 en la ley de seguridad privada, y qué decía antes?'

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
    <section className="px-6 md:px-12 max-w-5xl mx-auto pb-16">
      <div className="border-t border-rule pt-10">
        <p className="text-xs uppercase tracking-[0.25em] text-ink-faint mb-3">
          Para agentes
        </p>
        <h2 className="font-display text-2xl md:text-3xl leading-tight text-balance mb-3">
          Conecta el corpus a tu agente
        </h2>
        <p className="text-ink-soft text-[14.5px] leading-relaxed max-w-2xl mb-6">
          Si no quieres descargar todo el corpus, puedes probarlo directamente desde tu
          agente preferido vía <strong className="text-ink">MCP</strong>: buscar normas, leer
          un artículo en cualquier fecha, y comparar dos versiones palabra por palabra.
        </p>

        <figure className="max-w-2xl mb-6 rounded-lg border border-rule bg-paper-sunk overflow-hidden">
          <figcaption className="text-[10.5px] uppercase tracking-[0.18em] text-ink-faint px-4 pt-3 pb-2 border-b border-rule/60">
            Ya conectado, pregúntale
          </figcaption>
          <p className="font-display italic text-[15px] leading-relaxed text-ink px-4 py-3.5">
            “{EXAMPLE}”
          </p>
        </figure>

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
          {CLIENTS.map((c) => {
            const cls =
              'group inline-flex items-center gap-2 text-xs font-ui px-3 py-1.5 rounded-md ' +
              'border border-rule text-ink-soft hover:text-ink hover:border-ink/40 transition'
            return c.href ? (
              <a key={c.id} href={c.href(MCP_URL)} className={cls}>
                <c.Icon className="w-3.5 h-3.5 text-ink-faint group-hover:text-ink transition-colors" />
                {c.label}
              </a>
            ) : (
              <button key={c.id} onClick={() => onCopy(c)} className={cls}>
                <c.Icon className="w-3.5 h-3.5 text-ink-faint group-hover:text-ink transition-colors" />
                {c.label}
              </button>
            )
          })}
        </div>

        <p className="text-xs text-ink-faint mt-3 h-4" role="status" aria-live="polite">
          {note}
        </p>
      </div>
    </section>
  )
}
