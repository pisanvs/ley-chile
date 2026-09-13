/**
 * Entry into force, as distinct from publication.
 *
 * The corpus tracks when a norma's *text* changed and does it exactly: ask for
 * a boundary date and you get the right version to the day. What it had no
 * representation for at all is when that text starts to *bind*. Those are
 * different dates whenever a reform defers its own entry into force, and the
 * gap between them is where the confident wrong answers lived.
 *
 * Ley 21.561 is the case that exposed it. Published 26 April 2023, it rewrote
 * article 22 of the Código del Trabajo to read "cuarenta horas semanales" — and
 * the corpus applied that text from the publication date onward. But the law
 * phases itself in: 44 hours at year one, 42 at year three, 40 at year five. On
 * 1 January 2024 the binding limit was still 45. The corpus said 40.
 *
 * The schedule was never missing. LeyChile publishes it as a nota attached to
 * the very article it governs, and the pipeline already carries notas into the
 * article body as `> **Nota.** …` blockquotes. It was sitting under the text
 * that contradicted it, unread. This module reads it.
 *
 * What it deliberately does not do is convert Spanish number words into
 * quantities. The schedule says "cuarenta y cuatro horas" and this reports
 * "cuarenta y cuatro horas" — quoted, not interpreted. Parsing dates is
 * mechanical and checkable; deciding what a legal quantity *means* is not, and
 * a silent misreading there would recreate the bug in a subtler form.
 *
 * A minority of transitional provisions condition entry on an event rather
 * than a date — a reglamento being issued, a region's rollout. Those are
 * detected and reported as unresolvable, which is the correct answer, not a
 * failure.
 */

/** One step of a phased entry into force. */
export interface Step {
  /** First day this step binds (YYYY-MM-DD). */
  desde: string
  /** The rule in force from `desde`, quoted from the schedule verbatim. */
  valor: string
  /** The offset as written, e.g. "primer año". */
  plazo: string
}

export interface Gradualidad {
  /** Publication date the schedule counts from (YYYY-MM-DD). */
  anchor: string
  /** Number of the norma that enacted the schedule, when the nota names it. */
  causaNumero: string | null
  /** The rule in force before the first step — the pre-reform text. */
  base: string | null
  /** Steps, ascending by date. */
  steps: Step[]
  /** True when some provision keys entry to an event rather than a date. */
  condicionadaAEvento: boolean
  /** The nota this was read from. */
  raw: string
}

const ORDINALES: Record<string, number> = {
  primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5,
  sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10,
}

const CARDINALES: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, dieciocho: 18, veinticuatro: 24,
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

/** Entry keyed to something that has to happen, not to a date on the calendar. */
const EVENTO = /\b(entrada en vigencia del reglamento|dictaci[óo]n del reglamento|publicaci[óo]n del reglamento|una vez que (?:se )?(?:se dicte|dicte|publique|entre en vigencia)|reglamento que (?:al efecto )?(?:se )?dicte|decreto supremo que (?:al efecto )?(?:se )?dicte)\b/i

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The three ways a Chilean schedule writes a time offset: "al primer año",
 *  "a los seis meses", "en el plazo de un año". Global — one clause can carry
 *  more than one. */
const OFFSET_RE =
  /\b(?:al\s+([a-záéíóú]+)|a\s+los\s+(\d+|[a-záéíóú]+)|en\s+el\s+plazo\s+de\s+(\d+|[a-záéíóú]+))\s+(a[nñ]os?|mes(?:es)?|d[ií]as?)\b/gi

/** Pull the `> **Nota.** …` blockquotes the pipeline renders after the
 *  paragraph they annotate (render_texto.py). */
export function extractNotas(body: string): string[] {
  const out: string[] = []
  for (const line of body.split('\n')) {
    const m = line.match(/^>\s*\*\*Nota\.\*\*\s*(.+)$/)
    if (m) out.push(m[1].trim())
  }
  return out
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Add whole years/months/days in UTC, clamping to the last valid day of the
 *  target month so 31 January + 1 month is 28 February, not 3 March. */
export function addOffset(iso: string, n: number, unit: 'año' | 'mes' | 'día'): string {
  const [y, m, d] = iso.split('-').map(Number)
  let ty = y
  let tm = m
  let td = d
  if (unit === 'año') ty += n
  else if (unit === 'mes') {
    const total = (y * 12 + (m - 1)) + n
    ty = Math.floor(total / 12)
    tm = (total % 12) + 1
  } else {
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + n)
    return dt.toISOString().slice(0, 10)
  }
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate()
  td = Math.min(td, lastDay)
  return `${ty}-${pad(tm)}-${pad(td)}`
}

/** The publication date the schedule counts from: "publicada el 26.04.2023" or
 *  "publicada el 26 de abril de 2023". */
function findAnchor(nota: string): string | null {
  const dotted = nota.match(/publicad[ao]\s+el\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i)
  if (dotted) return `${dotted[3]}-${pad(Number(dotted[2]))}-${pad(Number(dotted[1]))}`
  const spelled = nota.match(/publicad[ao]\s+el\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i)
  if (spelled) {
    const mes = MESES[fold(spelled[2])]
    if (mes) return `${spelled[3]}-${pad(mes)}-${pad(Number(spelled[1]))}`
  }
  const iso = nota.match(/publicad[ao]\s+el\s+(\d{4}-\d{2}-\d{2})/i)
  return iso ? iso[1] : null
}

function unitOf(word: string): 'año' | 'mes' | 'día' | null {
  const w = fold(word)
  if (w.startsWith('ano') || w.startsWith('año')) return 'año'
  if (w.startsWith('mes')) return 'mes'
  if (w.startsWith('dia')) return 'día'
  return null
}

/**
 * Read a phased-entry schedule out of one nota.
 *
 * Returns null unless the nota both reads as a deferred-entry provision and
 * carries an anchor date — without an anchor the offsets count from nothing,
 * and guessing the norma's publication date in its place would silently
 * fabricate a calendar.
 */
export function parseGradualidad(nota: string): Gradualidad | null {
  const flat = nota.replace(/\s+/g, ' ').trim()
  const f = fold(flat)
  const deferred =
    /(gradual|gradualidad|por etapas|se implementar|comenzar[aá]n? a regir|entrar[aá]n? en vigencia|se aplicar[aá]|regir[aá]n? a contar)/.test(f)
  if (!deferred) return null

  const anchor = findAnchor(flat)
  if (!anchor) return null

  const leyM = flat.match(/\bley\s*(?:N[°ºo]\s*)?([\d][\d.]*)/i)
  const causaNumero = leyM ? leyM[1].replace(/\./g, '') : null

  let base: string | null = null
  const steps: Step[] = []

  // Segment on punctuation first, then scan each segment for EVERY offset it
  // contains. Both halves matter. Scanning the whole nota at once lets a value
  // from one clause pair with an offset from the next ("…publicada el
  // 26.04.2023, a la jornada … al primer año"), which yields a schedule that is
  // quietly wrong; taking only the first offset per segment drops steps,
  // because a schedule routinely runs two into one clause — "cuarenta y dos
  // horas al tercer año y cuarenta horas al quinto año" is one segment and two
  // steps. So: split on punctuation, then walk all matches inside.
  for (const rawSeg of flat.split(/[;,]/)) {
    const seg = rawSeg.trim()
    if (!seg) continue

    OFFSET_RE.lastIndex = 0
    let prevEnd = 0
    for (let m = OFFSET_RE.exec(seg); m !== null; m = OFFSET_RE.exec(seg)) {
      const unit = unitOf(m[4])
      const word = m[1] ?? m[2] ?? m[3]
      const key = fold(word)
      const n = m[1] !== undefined
        ? ORDINALES[key]
        : (/^\d+$/.test(key) ? Number(key) : CARDINALES[key])
      const matchStart = m.index
      const between = seg.slice(prevEnd, matchStart)
      prevEnd = OFFSET_RE.lastIndex
      if (!unit || !n || !Number.isFinite(n)) continue

      // What this step sets. "reduciéndose de X a Y al primer año" carries the
      // pre-reform rule and the new one in the same breath.
      let valor = between.trim()
      const deA = valor.match(/\bde\s+(.+?)\s+a\s+(.+)$/i)
      if (deA) {
        if (base === null) base = deA[1].trim()
        valor = deA[2].trim()
      }
      valor = valor
        .replace(/^(?:[.;,\s]|\by\b|\be\b|\ba\b|\bse\s+reducir[áa]\b|\bse\s+aplicar[áa]\b)+/i, '')
        .trim()
      steps.push({
        desde: addOffset(anchor, n, unit),
        valor: valor || flat,
        plazo: `${word} ${m[4]}`.toLowerCase(),
      })
    }
  }

  if (steps.length === 0) return null
  steps.sort((a, b) => a.desde.localeCompare(b.desde))
  return { anchor, causaNumero, base, steps, condicionadaAEvento: EVENTO.test(flat), raw: flat }
}

export type Phase =
  /** Before the first step: the pre-reform rule binds, NOT the text shown. */
  | { kind: 'base'; valor: string | null; hasta: string }
  /** Inside the schedule: an intermediate rule binds. */
  | { kind: 'step'; step: Step; hasta: string | null }
  /** At or after the last step: the consolidated text is correct as shown. */
  | { kind: 'complete'; step: Step }

/** Which rule actually bound on `fecha`. */
export function phaseAt(g: Gradualidad, fecha: string): Phase {
  const first = g.steps[0]
  if (fecha < first.desde) {
    return { kind: 'base', valor: g.base, hasta: first.desde }
  }
  let idx = 0
  for (let i = 0; i < g.steps.length; i++) {
    if (g.steps[i].desde <= fecha) idx = i
  }
  const step = g.steps[idx]
  if (idx === g.steps.length - 1) return { kind: 'complete', step }
  return { kind: 'step', step, hasta: g.steps[idx + 1].desde }
}

/**
 * The warning that must lead an article whose displayed text did not yet bind.
 *
 * Null when the schedule has run its course — then the consolidated text is
 * both what the corpus holds and what the law says, and a warning would be
 * noise that teaches a reader to skip the next one.
 */
export function gradualidadWarning(g: Gradualidad, fecha: string): string | null {
  const phase = phaseAt(g, fecha)
  if (phase.kind === 'complete') return null

  const ley = g.causaNumero ? `la ley ${g.causaNumero}` : 'la reforma'
  const lines = [
    `⚠ VIGENCIA GRADUAL: el texto que sigue es el consolidado final, pero al ${fecha} ` +
    `no regía todavía. ${ley[0].toUpperCase()}${ley.slice(1)} (publicada ${g.anchor}) ` +
    'entra en vigencia por etapas.',
  ]
  if (phase.kind === 'base') {
    lines.push(
      phase.valor
        ? `Al ${fecha} regía la regla anterior a la reforma: ${phase.valor}. ` +
          `La primera etapa parte el ${phase.hasta}.`
        : `Al ${fecha} regía el texto anterior a la reforma; la primera etapa parte el ${phase.hasta}.`,
    )
  } else {
    lines.push(
      `Al ${fecha} regía la etapa iniciada el ${phase.step.desde} (${phase.step.plazo}): ` +
      `${phase.step.valor}${phase.hasta ? `, hasta el ${phase.hasta}` : ''}.`,
    )
  }
  lines.push(
    'Calendario: ' +
    g.steps.map((s) => `${s.desde} → ${s.valor}`).join(' · '),
  )
  if (g.condicionadaAEvento) {
    lines.push(
      'Además, alguna disposición condiciona su entrada en vigencia a un hecho ' +
      '(un reglamento, una puesta en marcha) y no a una fecha: esa parte no se puede fechar.',
    )
  }
  lines.push(`Nota de LeyChile, textual: ${g.raw}`)
  return lines.join('\n')
}

/**
 * A nota that defers entry into force but keys it to a fact rather than a date.
 *
 * "Entrará en vigencia una vez que se dicte el reglamento" has no calendar and
 * never will until the reglamento exists. Treating that as a parse failure
 * would be the wrong lesson: nothing is missing from the nota, and no better
 * parser would extract a date from it. It is a distinct, correct answer — the
 * text shown may or may not bind, and the corpus cannot say which — so it gets
 * its own detection rather than falling into the blind-spot bucket.
 */
export function parseCondicionEvento(nota: string): { raw: string } | null {
  const flat = nota.replace(/\s+/g, ' ').trim()
  const f = fold(flat)
  const deferred =
    /(gradual|gradualidad|por etapas|se implementar|comenzar[aá]n? a regir|entrar[aá]n? en vigencia|se aplicar[aá]|regir[aá]n? a contar)/.test(f)
  if (!deferred || !EVENTO.test(flat)) return null
  return { raw: flat }
}

/** The warning for an entry into force nobody can date. */
export function eventoWarning(nota: { raw: string }, fecha: string): string {
  return [
    `⚠ VIGENCIA CONDICIONADA: la entrada en vigencia de este texto depende de un hecho ` +
    `(un reglamento, una puesta en marcha), no de una fecha, así que el corpus no puede ` +
    `afirmar que rigiera al ${fecha}. Verifica si el hecho ya ocurrió.`,
    `Nota de LeyChile, textual: ${nota.raw}`,
  ].join('\n')
}

/**
 * The whole check, over an article body at a date: read every nota and return
 * the warnings that apply — a phase-in whose schedule had not finished running
 * on `fecha`, or an entry into force keyed to an event that cannot be dated.
 */
export function vigenciaWarnings(body: string, fecha: string): string[] {
  const out: string[] = []
  for (const nota of extractNotas(body)) {
    const g = parseGradualidad(nota)
    if (g) {
      const w = gradualidadWarning(g, fecha)
      if (w) out.push(w)
      continue
    }
    // Only when no calendar parsed: a schedule that IS dated already reports
    // its event-keyed provisions through gradualidadWarning, and emitting both
    // would say the same thing twice.
    const e = parseCondicionEvento(nota)
    if (e) out.push(eventoWarning(e, fecha))
  }
  return out
}
