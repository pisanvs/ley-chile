import type { ModLink, Version } from './norma'
import { labelToSlug, normalizeLabel } from './segment'

/**
 * Input validation and horizon checks for the MCP tools (app/api/[transport]).
 *
 * The REST API already refuses a malformed fecha (lib/apiparams.ts) because a
 * date that silently becomes "today" produces a right-looking, wrong answer.
 * The MCP surface had none of that: it accepted `03-09-2024`, resolved it to
 * 3 September, and echoed it back as "vigente al 03-09-2024"; it answered a
 * pre-enactment date by reporting the *article* missing rather than the norma
 * not yet existing; it answered 2030 as settled law; and it rendered a diff
 * whose `desde` was later than its `hasta`, which reads as a repeal being
 * enacted. All four are the same failure mode — an agent has no way to tell a
 * confident answer from an unanswerable question — so they live together here,
 * as pure functions a test suite can pin.
 *
 * Everything returns a result object rather than throwing: an MCP tool's error
 * channel is the text it hands back to the model, and a thrown exception would
 * surface as a transport fault instead of an explanation the model can act on.
 */

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Strict ISO 8601 (YYYY-MM-DD), validated as a real calendar day.
 *
 * `03-09-2024` is the dangerous input, not `banana`: it parses, so it used to
 * be accepted and resolved to 3 September 2024. A caller who wrote it meaning
 * 9 March 2024 got a different year's text with no warning, and the permalink
 * the tool emitted alongside was malformed. Ambiguous formats are refused
 * outright — there is no correct guess between the two readings.
 */
export function checkFecha(raw: string, param = 'fecha'): Checked<string> {
  if (!ISO.test(raw)) {
    return {
      ok: false,
      message:
        `\`${param}\` debe ser una fecha ISO 8601 (YYYY-MM-DD); recibí "${raw}". ` +
        'Formatos como DD-MM-YYYY son ambiguos y no se aceptan: "03-09-2024" ' +
        'podría ser el 3 de septiembre o el 9 de marzo. Escribe "2024-09-03".',
    }
  }
  const d = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    return { ok: false, message: `\`${param}\` no es una fecha real del calendario: "${raw}".` }
  }
  return { ok: true, value: raw }
}

/**
 * `desde` must precede `hasta`.
 *
 * Reversed, the diff renders backwards in time and presents a repeal as an
 * enactment: `diff_versions ley 20000 --desde 2024-09-04 --hasta 2023-05-23`
 * returned "Artículo 22 — MODIFICADO · [-] Derogado. [+] Será circunstancia
 * atenuante…", which read literally asserts the cooperación eficaz attenuant
 * was created in 2023. It was repealed in 2024. Equal dates are refused too:
 * the answer is trivially "sin cambios", which invites the caller to believe
 * they compared two versions.
 */
export function checkRange(desde: string, hasta: string): Checked<{ desde: string; hasta: string }> {
  if (desde > hasta) {
    return {
      ok: false,
      message:
        `\`desde\` (${desde}) es posterior a \`hasta\` (${hasta}). El diff se rendería ` +
        'al revés en el tiempo, presentando una derogación como si fuera una creación. ' +
        `Si querías el período ${hasta} → ${desde}, vuelve a llamar con las fechas intercambiadas.`,
    }
  }
  if (desde === hasta) {
    return {
      ok: false,
      message:
        `\`desde\` y \`hasta\` son la misma fecha (${desde}), así que no hay nada que comparar. ` +
        'Usa list_versions para ver las fechas en que el texto cambió.',
    }
  }
  return { ok: true, value: { desde, hasta } }
}

/** Where a requested date falls relative to what the corpus actually knows. */
export type Coverage =
  | { kind: 'covered'; version: Version }
  /** Before the norma's first version — it did not exist yet. */
  | { kind: 'before'; first: Version }
  /** After today: any answer is an extrapolation, not a record. */
  | { kind: 'future'; last: Version }
  /** The norma has no versions at all (nothing was ever imported). */
  | { kind: 'empty' }
  /** Versions exist, but not one of them covers a single day. */
  | { kind: 'unreachable'; versions: Version[] }

/**
 * `hasta` is INCLUSIVE — it holds the day before the next version's `desde`
 * (…hasta 2026-02-04, then desde 2026-02-05) — so the comparison is `<=`.
 * With `<`, the final day of every version reports as having no text.
 */
export function versionAt(versions: Version[], fecha: string): Version | undefined {
  // The LAST match, not the first. For a well-formed series these are the same
  // thing — exactly one version contains any given day — so this changes
  // nothing for the corpus's 357k healthy normas. It matters where ranges
  // overlap: res 2675 EXENTA (idNorma 1014585) carries two open-ended
  // versions, "Texto Original" from 2010-06-16 and "Última Versión" from
  // 2012-10-31. `getVersions` orders by `desde` ascending and a first-match
  // scan therefore returned the 2010 original as today's text, silently, with
  // the 2012 version sitting right behind it. Where two versions both claim a
  // day, the later one is the answer.
  let best: Version | undefined
  for (const v of versions) {
    if (v.desde <= fecha && (v.hasta === null || fecha <= v.hasta)) {
      if (!best || v.desde > best.desde) best = v
    }
  }
  return best
}

/**
 * Classify a requested date against a norma's version series.
 *
 * `future` is checked before `covered` on purpose. The last version of a live
 * norma carries `hasta: null`, meaning "in force from `desde` onward, as far as
 * the corpus knows" — which `versionAt` happily stretches to 2030. Answering
 * 2030 from it is a claim about what the law *will* say, and no legal database
 * can make that claim: Chile has scheduled changes on the books right now,
 * including the 2028 tranche of the 40-hour law, and the corpus may not yet
 * carry the norma that enacts the next one.
 */
export function coverage(versions: Version[], fecha: string, today: string): Coverage {
  if (versions.length === 0) return { kind: 'empty' }
  // Checked before everything else, including the future horizon: if no version
  // covers any day, then no date is answerable and saying "that date is in the
  // future" or "the norma did not exist yet" would both be beside the point.
  if (!coversAnyDay(versions)) return { kind: 'unreachable', versions }
  const last = versions[versions.length - 1]
  if (fecha > today) return { kind: 'future', last }
  const v = versionAt(versions, fecha)
  if (v) return { kind: 'covered', version: v }
  return { kind: 'before', first: versions[0] }
}

/**
 * Does any version of this norma cover at least one day?
 *
 * 75 normas in the corpus fail this. Every one of their versions is
 * zero-length — `hasta` falling the day before `desde`, LeyChile's idiom for
 * text superseded on its own publication day — so `versionAt` matches nothing,
 * ever, for any `fecha`. dto 388 (idNorma 12944) has exactly one version,
 * 1989-03-06 → 1989-03-05.
 *
 * Without this, such a norma reports as `before` for every past date, which
 * renders as "no estaba vigente al X, su primera versión rige desde Y" — an
 * answer that invites the caller to try Y, where they will be told the same
 * thing again. The honest answer is that there is no date to try.
 */
export function coversAnyDay(versions: Version[]): boolean {
  return versions.some((v) => v.hasta === null || v.hasta >= v.desde)
}

/**
 * The warning that must lead any answer drawn from an extrapolated date.
 *
 * Returned as a line to prepend, not as a refusal: the last known text is still
 * the caller's best available answer, and withholding it helps nobody. What was
 * missing is the signal that it is an extrapolation rather than a record.
 */
export function futureWarning(last: Version, fecha: string, today: string): string {
  return (
    `⚠ FECHA FUTURA: ${fecha} es posterior a hoy (${today}), así que esto no es un ` +
    `registro sino una extrapolación. La última versión conocida por el corpus empieza ` +
    `el ${last.desde}; no hay datos posteriores. Chile tiene reformas con entrada en ` +
    `vigencia diferida ya publicadas — el texto de ${fecha} puede diferir del que sigue.`
  )
}

/**
 * The message for a date before the norma existed.
 *
 * The bug this replaces was a statement about the wrong thing: asked for
 * Artículo 22 of ley 20.000 at 2000-01-01 the tool answered "no se encontró el
 * artículo", which a model reports as "ley 20.000 has no Article 22". The norma
 * is what did not exist. `anteriores` points at what this norma modified or
 * derogated, because "what governed before this" is the question the caller
 * actually has — ley 20.000 sustituyó a la ley 19.366 in 2005, and that is the
 * text they were reaching for.
 */
export function notYetInForce(
  n: { tipo: string; numero: string; fechaPublicacion: string | null },
  first: Version,
  fecha: string,
  anteriores: { tipo: string; numero: string; titulo: string; idNorma: number }[] = [],
): string {
  const pub = n.fechaPublicacion ? `, publicada el ${n.fechaPublicacion}` : ''
  const lines = [
    `${n.tipo.toUpperCase()} ${n.numero} no estaba vigente al ${fecha}${pub}. ` +
    `Su primera versión en el corpus rige desde el ${first.desde}.`,
  ]
  if (anteriores.length) {
    lines.push(
      '',
      'Esta norma modificó o derogó las siguientes, que pueden ser la norma anterior aplicable:',
      ...anteriores.slice(0, 10).map(
        (a) => `- ${a.tipo.toUpperCase()} ${a.numero} · idNorma ${a.idNorma} — ${a.titulo}`,
      ),
    )
  }
  lines.push('', 'Usa list_versions para ver todas las fechas, o get_modifications para el grafo.')
  return lines.join('\n')
}

/**
 * Name the norma that caused a version, preferring live identity over the
 * commit subject frozen into history.
 *
 * The stored subject is what the pipeline knew at write time, and for a causa
 * whose metadata had not been fetched yet that is a placeholder: the Código del
 * Trabajo's list reads "Otras N°21561" for Ley 21.561 and "Otra [id 1000928]"
 * for a causa it never resolved. Cosmetic when a person reads it; not cosmetic
 * for a benchmark that scores exact (norma, fecha) tuples, where a wrong tipo
 * corrupts the answer key.
 *
 * When the causa cannot be resolved the label says so in those words rather
 * than presenting the placeholder as a name — an unresolved causa is a real
 * gap in the corpus and reads as one.
 */
export function causaLabel(v: Version, causa?: ModLink, maxTitulo = 90): string {
  if (causa) {
    const t = causa.titulo.replace(/\s+/g, ' ').trim()
    const titulo = t.length > maxTitulo ? `${t.slice(0, maxTitulo).trimEnd()}…` : t
    const head = `${causa.tipo.toUpperCase()} ${causa.numero} · idNorma ${causa.idNorma}`
    return titulo ? `${head} — ${titulo}` : head
  }
  if (v.causaId !== null) {
    // Say what is missing and give the handle, rather than echoing a
    // placeholder that reads like a tipo ("Otra", "Otras").
    return `causa idNorma ${v.causaId} — no está en el corpus`
  }
  return v.subject || 'causa no registrada'
}

/** One window of a long response body. */
export interface Page {
  body: string
  /** Characters before this window. */
  offset: number
  /** Characters after this window — 0 when the window reaches the end. */
  remaining: number
  total: number
}

/**
 * Take a window of a long body, reporting exactly what was left out.
 *
 * Truncation was previously a one-way door: the tail was dropped and the only
 * trace was prose ("…[truncado: 4624 caracteres más]") at the end of the text.
 * Fine for a chat response, fatal for an item generator, which emits gold
 * labels missing their tail with no way to notice and no way to ask for the
 * rest. Offsets are exact character counts, never snapped to a word or line
 * boundary, so `offset + body.length` is always the next window's offset and a
 * caller can reassemble the whole body byte-for-byte.
 */
export function paginate(s: string, limit: number, offset = 0): Page {
  const start = Math.max(0, Math.min(offset, s.length))
  const body = s.slice(start, start + limit)
  return {
    body,
    offset: start,
    remaining: s.length - (start + body.length),
    total: s.length,
  }
}

/**
 * The machine-readable line that must accompany a truncated window.
 *
 * Stable `clave=valor` fields on one line so a caller can parse it without
 * guessing, and an explicit next call rather than a description of one.
 * Returns null when nothing was withheld — the absence of this line is itself
 * the signal that the body is complete.
 */
export function truncationNotice(p: Page, rawUrl?: string): string | null {
  if (p.remaining <= 0 && p.offset === 0) return null
  const next = p.offset + p.body.length
  const parts = [
    `[TRUNCADO] offset=${p.offset} fin=${next} total=${p.total} faltan=${p.remaining}`,
  ]
  if (p.remaining > 0) parts.push(`Repite la llamada con offset=${next} para el resto.`)
  if (rawUrl) parts.push(`Texto íntegro sin recortar: ${rawUrl}`)
  return parts.join(' · ')
}

/** An `offset` past the end is a caller error worth naming, not an empty body. */
export function checkOffset(offset: number | undefined, total: number): Checked<number> {
  if (offset === undefined) return { ok: true, value: 0 }
  if (!Number.isInteger(offset) || offset < 0) {
    return { ok: false, message: `\`offset\` debe ser un entero >= 0; recibí ${offset}.` }
  }
  if (offset >= total && total > 0) {
    return {
      ok: false,
      message:
        `\`offset\` ${offset} está más allá del final del texto (${total} caracteres). ` +
        'El último offset útil es ' + (total - 1) + '.',
    }
  }
  return { ok: true, value: offset }
}

/**
 * The answer for a norma no date can reach.
 *
 * States the situation as a property of the norma, names the degenerate ranges
 * so the reader can see it is a data defect rather than a stray query, and —
 * crucially — does not suggest another date. There isn't one.
 */
export function noReachableVersion(
  n: { tipo: string; numero: string; fechaPublicacion: string | null },
  versions: Version[],
): string {
  const pub = n.fechaPublicacion ? `, publicada el ${n.fechaPublicacion}` : ''
  const ranges = versions
    .slice(0, 5)
    .map((v) => `${v.desde} → ${v.hasta ?? 'vigente'}`)
    .join(' · ')
  return [
    `${n.tipo.toUpperCase()} ${n.numero}${pub} no tiene ninguna versión que cubra fecha alguna: ` +
    `todas sus vigencias son de duración cero (${versions.length} versión(es): ${ranges}` +
    `${versions.length > 5 ? ' …' : ''}).`,
    '',
    'No hay ninguna fecha en que esta norma devuelva texto, así que no sirve de nada ' +
    'reintentar con otra. Esto es un defecto de los datos de origen, no de tu consulta; ' +
    'afecta a 75 normas del corpus. Consulta LeyChile directamente para esta norma.',
  ].join('\n')
}

/**
 * Render an "available articles" hint without lying about what is available.
 *
 * The old form appended a bare `…` unconditionally, so an empty list rendered
 * as "Disponibles: …" — an ellipsis standing in for nothing, which reads as
 * truncation and tells the caller neither that the list is empty nor why.
 */
/**
 * Find the article a caller means, across the spellings a lawyer actually uses.
 *
 * `label` is already the output of `normalizeLabel`, so the caller's string has
 * to go through the same funnel before any comparison — matching raw meant only
 * the corpus's own spelling worked: "articulo 22" resolved and "Art. 22" did
 * not, which is the citation form in every Chilean brief. Hyphens are folded to
 * spaces as a second attempt so a slug pasted out of a URL ("articulo-22",
 * "art-22") also lands.
 *
 * The substring fallback is last and deliberately loose — "22" finding
 * "articulo 22" is usually what was meant — but it runs only after both exact
 * passes fail, so it can never shadow a real label.
 */
export function matchArticle<T extends { label: string; slug: string }>(
  articles: T[], articulo: string,
): T | undefined {
  const spaced = articulo.replace(/[-_]+/g, ' ')
  const keys = [normalizeLabel(articulo), normalizeLabel(spaced)]
  const slugs = [
    articulo.toLowerCase().trim(),
    ...keys.map((k) => labelToSlug(k)),
  ]
  for (const k of keys) {
    const hit = articles.find((a) => a.label === k)
    if (hit) return hit
  }
  for (const s of slugs) {
    const hit = articles.find((a) => a.slug.toLowerCase() === s)
    if (hit) return hit
  }
  for (const k of keys) {
    const hit = articles.find((a) => a.label.includes(k))
    if (hit) return hit
  }
  return undefined
}

export function availableLabels(labels: string[], cap = 40): string {
  if (labels.length === 0) return 'No hay artículos con texto vigente en esa fecha.'
  const shown = labels.slice(0, cap).join(', ')
  const rest = labels.length - Math.min(labels.length, cap)
  return `Disponibles (${labels.length}): ${shown}${rest > 0 ? `, …y ${rest} más` : ''}`
}
