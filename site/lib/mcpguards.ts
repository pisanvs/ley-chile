import type { Version } from './norma'
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

/**
 * `hasta` is INCLUSIVE — it holds the day before the next version's `desde`
 * (…hasta 2026-02-04, then desde 2026-02-05) — so the comparison is `<=`.
 * With `<`, the final day of every version reports as having no text.
 */
export function versionAt(versions: Version[], fecha: string): Version | undefined {
  return versions.find((v) => v.desde <= fecha && (v.hasta === null || fecha <= v.hasta))
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
  const last = versions[versions.length - 1]
  if (fecha > today) return { kind: 'future', last }
  const v = versionAt(versions, fecha)
  if (v) return { kind: 'covered', version: v }
  return { kind: 'before', first: versions[0] }
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
