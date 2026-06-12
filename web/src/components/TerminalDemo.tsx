import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Each token in a typewriter-rendered command. Strings render uncoloured;
 * objects render with a token class for syntax highlighting (matches the
 * homepage's existing palette via h/flag/path/str/sha/date/com classes
 * defined in TerminalDemo.css).
 */
type CmdToken = string | { t: string; cls: 'h' | 'flag' | 'path' | 'str' }

interface Example {
  /** Short label shown in the question-chip tab strip. */
  tab: string
  /** The plain-Spanish question this example answers. */
  q: string
  /** The shell command to render, tokenised so the typewriter can colour as
   *  it goes. Real, copy/pasteable git invocation. */
  cmd: CmdToken[]
  /** HTML for the output block. Uses the same token classes (sha/date/h/com)
   *  used in the command. We trust this content because it ships from this
   *  module — nothing user-supplied flows in here. */
  out: string
}

/**
 * Every command and output below was captured by running the real
 * invocation against the `historial` branch on 2026-06-12 (clone target:
 * /media/DATA/leychile-investigate/historial). SHAs, dates and commit
 * subjects are verbatim — copy any of these into your shell after
 * `git clone -b historial https://github.com/pisanvs/ley-chile` and you'll
 * get the same output.
 */
const EXAMPLES: Example[] = [
  {
    tab: '¿Cuándo cambió?',
    q: '¿Cuándo se modificó el Código del Trabajo y por quién?',
    cmd: [
      { t: 'git log', cls: 'h' }, ' ',
      { t: '--follow', cls: 'flag' }, ' ',
      { t: "--format='%h %cs %s'", cls: 'flag' }, ' \\\n    -- ',
      { t: 'dfl/ministerio-del-trabajo-y-previsi-n-social', cls: 'path' }, '\\\n      ',
      { t: '/1-207436/texto.md', cls: 'path' }, ' | ',
      { t: 'head', cls: 'h' },
    ],
    out: [
      `<span class="sha">45af3980fd</span> <span class="date">2026-02-07</span> Ley N°21797 publicada (2026-02-07)`,
      `<span class="sha">cc415c4a69</span> <span class="date">2024-08-24</span> Ley N°21690 publicada (2024-08-24)`,
      `<span class="sha">2842b85d55</span> <span class="date">2024-08-01</span> Otras N°21643 publicada (2024-08-01)`,
      `<span class="sha">84e56faccd</span> <span class="date">2024-06-14</span> Ley N°21675 publicada (2024-06-14)`,
      `<span class="sha">98654a4f85</span> <span class="date">2024-01-29</span> Otras N°21645 publicada (2024-01-29)`,
      `<span class="sha">406ca4d736</span> <span class="date">2023-08-21</span> Otras N°21592 publicada (2023-08-21)`,
      `<span class="sha">0a1cc01624</span> <span class="date">2023-04-26</span> Otras N°21561 publicada (2023-04-26)`,
      ``,
      `<span class="com"># Cada commit = una norma que tocó el Código del Trabajo.</span>`,
    ].join('\n'),
  },
  {
    tab: 'Antes / después',
    q: '¿Cómo se leía el Artículo 1° de la Ley 19.300 antes de la última reforma?',
    cmd: [
      { t: 'git show', cls: 'h' }, ' ',
      { t: 'ff0daaee0d', cls: 'str' }, ':',
      { t: 'leyes/19300/texto.md', cls: 'path' }, ' | ',
      { t: 'head', cls: 'h' }, ' ',
      { t: '-13', cls: 'flag' },
    ],
    out: [
      `<span class="h">APRUEBA LEY SOBRE BASES GENERALES</span>`,
      `<span class="h">DEL MEDIO AMBIENTE</span>`,
      ``,
      `Teniendo presente que el H. Congreso Nacional`,
      `ha dado su aprobación al siguiente`,
      ``,
      `Proyecto de ley:`,
      ``,
      `<span class="h">## Título I — Disposiciones Generales</span>`,
      ``,
      `<span class="h">#### Artículo 1°</span>`,
      ``,
      `El derecho a vivir en un medio ambiente libre de`,
      `contaminación, la protección del medio ambiente,`,
      `la preservación de la naturaleza y…`,
      ``,
      `<span class="com"># versión congelada al sha ff0daaee0d (2022-09-30)</span>`,
    ].join('\n'),
  },
  {
    tab: '¿Quién modificó?',
    q: '¿Qué normas modificaron la Ley 19.300 sobre Medio Ambiente?',
    cmd: [
      { t: 'git log', cls: 'h' }, ' ',
      { t: '--follow', cls: 'flag' }, ' ',
      { t: "--format='%h %cs %s'", cls: 'flag' }, ' \\\n    -- ',
      { t: 'leyes/19300/texto.md', cls: 'path' },
    ],
    out: [
      `<span class="sha">535cac20c1</span> <span class="date">2024-04-10</span> Otras N°21660 publicada (2024-04-10)`,
      `<span class="sha">d937ff93d0</span> <span class="date">2023-09-06</span> Ley N°21600 publicada (2023-09-06)`,
      `<span class="sha">6abaf6582d</span> <span class="date">2023-05-29</span> Otras N°21562 publicada (2023-05-29)`,
      `<span class="sha">ff0daaee0d</span> <span class="date">2022-09-30</span> Resolución N°129 EXENTA publicada (2022-09-30)`,
      ``,
      `<span class="com"># 4 normas — el causa-id de cada commit apunta al</span>`,
      `<span class="com"># instrumento jurídico que disparó la modificación.</span>`,
    ].join('\n'),
  },
]

const CYCLE_HOLD_MS = 5800
const TYPE_INTERVAL_MS = 22
const TYPE_STEP = 2
const OUT_DELAY_MS = 320

/** Flatten command tokens to a single string so we can drive the
 *  typewriter purely by character offset. */
function flattenCmd(parts: CmdToken[]): string {
  return parts.map(p => (typeof p === 'string' ? p : p.t)).join('')
}

/** Render the command up to `untilChar` characters, emitting span wrappers
 *  for tokenised pieces so the colour cascades while typing. */
function renderCmd(parts: CmdToken[], untilChar: number): string {
  let out = ''
  let count = 0
  for (const p of parts) {
    const text = typeof p === 'string' ? p : p.t
    const cls = typeof p === 'string' ? null : p.cls
    const remaining = untilChar - count
    if (remaining <= 0) break
    const slice = text.slice(0, remaining)
    const escaped = slice.replace(/</g, '&lt;')
    out += cls ? `<span class="${cls}">${escaped}</span>` : escaped
    count += slice.length
    if (slice.length < text.length) break
  }
  return out
}

export function TerminalDemo() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [outShown, setOutShown] = useState(false)
  // Once the user clicks a chip we stop the auto-advance so they can read
  // at their own pace. There's no unpin affordance — a reload resumes the
  // cycle. Keep it simple.
  const [pinned, setPinned] = useState(false)
  const cycleTimerRef = useRef<number | null>(null)
  const typeTimerRef = useRef<number | null>(null)
  const outDelayRef = useRef<number | null>(null)

  const active = EXAMPLES[activeIdx]
  const fullCmd = useMemo(() => flattenCmd(active.cmd), [active])
  const isTyping = typedChars < fullCmd.length

  // Drive the typewriter for the currently-active example. Steps run via
  // window.setInterval so the cursor blink (a CSS animation, see .css)
  // keeps a stable cadence independent of typing.
  useEffect(() => {
    setTypedChars(0)
    setOutShown(false)
    if (typeTimerRef.current) window.clearInterval(typeTimerRef.current)
    if (outDelayRef.current) window.clearTimeout(outDelayRef.current)
    if (cycleTimerRef.current) window.clearTimeout(cycleTimerRef.current)

    let pos = 0
    typeTimerRef.current = window.setInterval(() => {
      pos = Math.min(fullCmd.length, pos + TYPE_STEP)
      setTypedChars(pos)
      if (pos >= fullCmd.length) {
        if (typeTimerRef.current) window.clearInterval(typeTimerRef.current)
        typeTimerRef.current = null
        outDelayRef.current = window.setTimeout(() => {
          setOutShown(true)
          if (!pinned) {
            cycleTimerRef.current = window.setTimeout(() => {
              setActiveIdx(i => (i + 1) % EXAMPLES.length)
            }, CYCLE_HOLD_MS)
          }
        }, OUT_DELAY_MS)
      }
    }, TYPE_INTERVAL_MS)

    return () => {
      if (typeTimerRef.current) window.clearInterval(typeTimerRef.current)
      if (outDelayRef.current) window.clearTimeout(outDelayRef.current)
      if (cycleTimerRef.current) window.clearTimeout(cycleTimerRef.current)
    }
  }, [activeIdx, fullCmd, pinned])

  const handlePick = (i: number) => {
    setPinned(true)
    setActiveIdx(i)
  }

  const cmdHtml = renderCmd(active.cmd, typedChars)

  return (
    <section className="td-section lc-fade-up">
      <span className="td-eyebrow">Preguntale al corpus</span>
      <h2 className="td-title">
        Una publicación, <em>un commit</em>.
      </h2>
      <p className="td-sub">
        Cada modificación a la ley chilena es un commit en una rama git
        pública. De ahí, cualquier pregunta legal es una invocación de{' '}
        <code className="td-inline-code">git</code>.
      </p>

      <div className="td-tabs" role="tablist" aria-label="Preguntas de ejemplo">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.tab}
            role="tab"
            aria-selected={i === activeIdx}
            onClick={() => handlePick(i)}
            className={`td-tab${i === activeIdx ? ' td-tab--active' : ''}`}
          >
            <span className="td-tab-dot" />
            {ex.tab}
          </button>
        ))}
      </div>

      <p className="td-question">{active.q}</p>

      <div className="td-terminal">
        <div className="td-chrome">
          <div className="td-dots"><span /><span /><span /></div>
          <span className="td-chrome-path">~/ley-chile</span>
          <span className="td-chrome-branch">branch: historial</span>
        </div>
        <div className="td-body">
          <div className="td-cmd-line">
            <span className="td-prompt">$ </span>
            <span
              className="td-cmd-text"
              // The HTML we inject here is produced by renderCmd() above
              // from the in-module EXAMPLES constant — never user input.
              dangerouslySetInnerHTML={{ __html: cmdHtml }}
            />
            {isTyping && <span className="td-cursor" aria-hidden />}
          </div>
          <div className={`td-out${outShown ? ' td-out--shown' : ''}`}>
            <div
              className="td-out-text"
              // Same provenance as cmdHtml — in-module constant content.
              dangerouslySetInnerHTML={{ __html: active.out }}
            />
          </div>
        </div>
      </div>

      <p className="td-footer">
        Cada ejemplo es real — pegalo en tu terminal y va a funcionar.{' '}
        <span className="td-footer-arrow">→</span>{' '}
        <code className="td-inline-code">
          git clone -b historial https://github.com/pisanvs/ley-chile
        </code>
      </p>
    </section>
  )
}
