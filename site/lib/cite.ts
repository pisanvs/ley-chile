/**
 * Citation rendering for a Chilean norma, or one article of it.
 *
 * A caveat that belongs in the code, not just a PR description: citing Chilean
 * legislation in APA and MLA is genuinely under-specified. Both standards defer
 * to local legal convention for non-US statutes, and Chilean faculties often
 * carry house rules. The renderings below are defensible readings of each
 * standard applied to Chilean norms — they are not authoritative, and a student
 * whose professor demands something else should be able to see that at a
 * glance. That is why `chile` is the default: it is the form Chilean legal
 * writing actually uses, and it is unambiguous.
 *
 * `markdown` exists for a different audience entirely. A legal blogger wants a
 * link they can paste, and that is the format that earns inbound links.
 */

export type CiteFormat =
  | 'chile' | 'rchd' | 'rchd-nota'
  | 'apa' | 'mla' | 'chicago' | 'bibtex' | 'ris' | 'markdown' | 'url'

export interface CiteSource {
  tipo: string
  numero: string
  titulo: string
  organismo?: string
  /** The version being read, YYYY-MM-DD. Absent means the current text. */
  fecha?: string
  /** Publication date, YYYY-MM-DD. */
  fechaPublicacion?: string | null
  url: string
  /** Article label as displayed, e.g. "Artículo 12". Absent cites the norma. */
  articulo?: string
  /**
   * The norma's short legal name — "Ley de violencia intrafamiliar" — from the
   * corpus's `nombres_uso_comun`. The Revista Chilena de Derecho's entry is
   * built on this "denominación legal", not on the official título. Sparse:
   * most normas have none, and the guide says to include it only "si es que la
   * tiene".
   */
  denominacion?: string
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MESES_ABBR = [
  'ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.',
  'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.',
]

/** Spanish thousands separators: Chilean law numbers are written "21.719". */
export function prettyNumero(n: string): string {
  return /^\d{4,}$/.test(n) ? Number(n).toLocaleString('es-CL') : n
}

/** "26 de agosto de 2024" — parsed as UTC so the date never shifts a day in a
 *  positive-offset timezone, the same trap lib/db.ts guards for DATE columns. */
function longDate(iso?: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

function shortDate(iso?: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_ABBR[m - 1]} ${y}`
}

function yearOf(iso?: string | null): string | null {
  return iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : null
}

/** "Ley N° 21.719" — the norma's name as Chilean legal writing renders it. */
export function normaName(s: CiteSource): string {
  const label: Record<string, string> = {
    ley: 'Ley', dl: 'Decreto Ley', dfl: 'Decreto con Fuerza de Ley',
    dto: 'Decreto', cod: 'Código', res: 'Resolución',
  }
  const kind = label[s.tipo] ?? s.tipo.toUpperCase()
  // Códigos are named, not numbered: "Código Penal", never "Código N° 1".
  if (s.tipo === 'cod') return s.titulo.trim() || `${kind} ${s.numero}`
  return `${kind} N° ${prettyNumero(s.numero)}`
}

/**
 * Tipos whose number does not identify a norma.
 *
 * A ley number is unique; a decreto number is not remotely. The corpus holds
 * 227 normas called "DFL 1" and 525 called "DTO 1", from different organismos
 * and different years, so "Decreto N° 1" names a family, not a norma — and a
 * reader given that citation cannot reach the text that was cited.
 */
const AMBIGUOUS_TIPOS = new Set(['dto', 'dfl', 'dl', 'res'])

/**
 * The norma's name, with enough to identify it.
 *
 * Chilean legal writing disambiguates a decreto by its issuing organismo and
 * year — "el decreto con fuerza de ley N° 1, de 2007, de los Ministerios de
 * Transportes y Telecomunicaciones y de Justicia" is how ley 21.579 refers to
 * one. This adds the organismo and stops there.
 *
 * The year is deliberately omitted. That "de 2007" is the year the decree was
 * *dictated*, and the corpus carries only the publication date — which for that
 * very DFL is 2009. `fechaPromulgacion` exists upstream in the pipeline but was
 * never loaded into Postgres, so printing a year here would mean printing the
 * wrong one about as often as not. An incomplete citation is a nuisance; a
 * citation with a confident, wrong year in it is a trap, and this tool is used
 * by people who will be marked on the result. The organismo alone already
 * separates the 227 "DFL 1"s into groups of a handful.
 */
function citeName(s: CiteSource): string {
  const base = normaName(s)
  if (!AMBIGUOUS_TIPOS.has(s.tipo) || !s.organismo?.trim()) return base
  return `${base}, del ${titleCase(s.organismo)}`
}

/** " (22/09/2005)" — the parenthesised publication date, or nothing. */
function when(s: CiteSource): string {
  const d = slashDate(s.fechaPublicacion)
  return d ? ` (${d})` : ''
}

/** "28/08/1999" — the date form the Revista Chilena de Derecho uses. */
function slashDate(iso?: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Words a Spanish title leaves lowercase when the rest is capitalised.
const MINOR_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'a', 'al',
  'con', 'por', 'para', 'sobre', 'sin', 'que', 'su', 'sus', 'un', 'una',
])

/**
 * Recase a title the corpus stores in capitals.
 *
 * LeyChile stores every título uppercase — "SOBRE PROTECCIÓN DE LA VIDA
 * PRIVADA" — and no citation style prints it that way, so it has to be recased
 * to be usable at all.
 *
 * The loss is real and worth stating: uppercase source text carries no signal
 * about which words were proper nouns, so "RINDE HOMENAJE PÓSTUMO A DON LUIS
 * RICARTE SOTO GALLEGOS" comes back as "…don luis ricarte soto gallegos". No
 * heuristic recovers that, and inventing one would be guessing at names. The
 * `/citar` page says so beside the format; a title with a person or place in it
 * needs a human to fix the capitals.
 *
 * A title that is not uppercase is left exactly as written — it already carries
 * the distinction this function cannot reconstruct.
 */
export function sentenceCase(s: string): string {
  const t = s.trim()
  if (!t || t !== t.toUpperCase()) return t
  const lower = t.toLocaleLowerCase('es')
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1)
}

/** Title case for names that are titles: "CÓDIGO PENAL" → "Código Penal". */
export function titleCase(s: string): string {
  const t = s.trim()
  if (!t || t !== t.toUpperCase()) return t
  return t
    .toLocaleLowerCase('es')
    .split(/(\s+)/)
    .map((w, i) =>
      /^\s+$/.test(w) || (i > 0 && MINOR_WORDS.has(w))
        ? w
        : w.charAt(0).toLocaleUpperCase('es') + w.slice(1),
    )
    .join('')
}

/**
 * The norma's name in the Revista Chilena de Derecho's form.
 *
 * The ordinal mark here is "N°" (N + degree sign), following UC's guide, which
 * prints "Ley N° 20.066". Published articles in the journal can be found using
 * "Nº" (N + masculine ordinal) instead — the two glyphs are nearly
 * indistinguishable and the difference survives a copy-paste, so it is worth
 * pinning deliberately rather than leaving to whichever source was read last.
 * Changing it is the one character below, and RCHD_ORDINAL exists so that the
 * change is one place rather than several.
 *
 * The degree sign also matches `normaName`, so a document that mixes this
 * format with the site's other output stays internally consistent.
 */
const RCHD_ORDINAL = '°' 
function rchdName(s: CiteSource): string {
  const label: Record<string, string> = {
    ley: 'Ley', dl: 'Decreto Ley', dfl: 'Decreto con Fuerza de Ley',
    dto: 'Decreto', res: 'Resolución',
  }
  const kind = label[s.tipo] ?? s.tipo.toUpperCase()
  return `${kind} N${RCHD_ORDINAL} ${prettyNumero(s.numero)}`
}

/** "art. 12" from "Artículo 12" — citation styles abbreviate. */
function artShort(articulo?: string): string | null {
  if (!articulo) return null
  const n = articulo.replace(/^[Aa]rt[íi]culo\s*/, '').trim()
  return n ? `art. ${n}` : null
}

const DO = 'Diario Oficial de la República de Chile'

export function renderCite(fmt: CiteFormat, s: CiteSource, today = new Date()): string {
  // Every prose format cites through `citeName`, which carries the organismo
  // for the tipos whose number alone names a family of normas rather than one.
  const name = citeName(s)
  const art = artShort(s.articulo)
  const pub = longDate(s.fechaPublicacion)
  const year = yearOf(s.fechaPublicacion)
  const accessed = today.toISOString().slice(0, 10)

  switch (fmt) {
    case 'url':
      return s.url

    case 'markdown':
      // What a blogger pastes. The visible text carries the article and the
      // version date, so the link says what it points at even out of context.
      return `[${art ? `${art.replace('art.', 'Art.')} de la ${name}` : name}${
        s.fecha ? ` (texto al ${s.fecha})` : ''
      }](${s.url})`

    case 'chile':
      // How Chilean legal writing cites: norm, article, official gazette, date.
      return [
        name,
        art,
        pub ? `${DO.replace(' de la República de Chile', '')}, ${pub}` : null,
      ].filter(Boolean).join(', ') + '.'

    case 'rchd':
    case 'rchd-nota': {
      // Per UC's "Cómo citar según la Revista Chilena de Derecho", which gives
      // the rule and one example for each of the two norm kinds:
      //
      //   Normas (Códigos y Constituciones)
      //     bibliografía:   CHILE, Constitución Política de la República (11/08/1980).
      //     cita abreviada: CONSTITUCIÓN POLÍTICA DE LA REPÚBLICA, Chile.
      //
      //   Normas (Leyes no codificadas)
      //     bibliografía:   CHILE, Ley N° 20.066 (22/09/2005) Ley de violencia intrafamiliar
      //     cita abreviada: LEY N° 20.066 de 2005
      //
      // The guide sets everything in versales (small caps), which plain text
      // cannot carry, so the copyable form uses ordinary capitals. Element
      // order, punctuation and the date format follow the examples exactly —
      // note that the ley entry carries no closing period and the Constitución
      // entry does.
      const named = s.tipo === 'cod'
      if (fmt === 'rchd-nota') {
        // The footnote form: name plus year, or the named norma plus the state.
        return named
          ? `${titleCase(s.titulo)}, Chile.`
          : `${rchdName(s)}${art ? `, ${art}` : ''}${year ? ` de ${year}` : ''}`
      }
      if (named) return `Chile, ${titleCase(s.titulo)}${when(s)}.`
      // "denominación legal si es que la tiene" — the short legal name, not the
      // official título. Falling back to the título when there is none keeps
      // the entry descriptive; see the note on sentenceCase for what that
      // fallback cannot recover.
      const denom = s.denominacion?.trim()
        ? titleCase(s.denominacion.trim())
        : sentenceCase(s.titulo)
      return `Chile, ${rchdName(s)}${art ? `, ${art}` : ''}${when(s)}${denom ? ` ${denom}` : ''}`
    }

    case 'apa':
      // APA 7 defers to local convention for non-US statutes; this follows its
      // reference shape — title, date, source, URL.
      return `${name}${art ? `, ${art}` : ''}. (${
        pub ? `${year}, ${pub.replace(` de ${year}`, '')}` : 's. f.'
      }). ${DO}. ${s.url}`

    case 'mla':
      return `"${name}${art ? `, ${art}` : ''}." ${DO}, ${
        shortDate(s.fechaPublicacion) ?? 's. f.'
      }, ${s.url.replace(/^https?:\/\//, '')}.`

    case 'chicago':
      // Notes-bibliography, the style Chilean legal scholarship tends to use.
      return `${name}${art ? `, ${art}` : ''}, ${DO.replace(' de la República de Chile', '')}, ${
        pub ?? 's. f.'
      }, ${s.url}.`

    case 'bibtex': {
      const key = `${s.tipo}${s.numero}`.replace(/[^a-zA-Z0-9]/g, '')
      // `institution` already carries the organismo, so the short name is used
      // here rather than repeating it inside the title.
      return [
        `@legislation{${key},`,
        `  title        = {${normaName(s)}${art ? `, ${art}` : ''}},`,
        s.titulo ? `  subtitle     = {${s.titulo}},` : null,
        `  journal      = {${DO}},`,
        year ? `  year         = {${year}},` : null,
        s.organismo ? `  institution  = {${s.organismo}},` : null,
        `  url          = {${s.url}},`,
        `  urldate      = {${accessed}},`,
        '}',
      ].filter(Boolean).join('\n')
    }

    case 'ris':
      // TY - STAT is the RIS type for a statute; Zotero and Mendeley both map it.
      return [
        'TY  - STAT',
        // PB carries the organismo; no need to repeat it in the title.
        `TI  - ${normaName(s)}${art ? `, ${art}` : ''}`,
        s.titulo ? `T2  - ${s.titulo}` : null,
        `JO  - ${DO}`,
        s.fechaPublicacion ? `DA  - ${s.fechaPublicacion.replace(/-/g, '/')}` : null,
        year ? `PY  - ${year}` : null,
        s.organismo ? `PB  - ${s.organismo}` : null,
        `UR  - ${s.url}`,
        `Y2  - ${accessed.replace(/-/g, '/')}`,
        'ER  - ',
      ].filter(Boolean).join('\n')
  }
}

export const CITE_FORMATS: { id: CiteFormat; label: string; hint?: string }[] = [
  { id: 'chile', label: 'Cita legal', hint: 'uso chileno' },
  // The hint is a warning, not a feature note: the corpus stores títulos in
  // capitals, so the recased title cannot know which words were proper nouns.
  // The journal's guide gives a bibliography entry and a footnote form for
  // every source type, and legal writing uses the footnote far more often, so
  // both are offered rather than only the reference-list entry.
  { id: 'rchd', label: 'Rev. Chilena de Derecho', hint: 'bibliografía' },
  { id: 'rchd-nota', label: 'RChD', hint: 'cita abreviada, a pie de página' },
  { id: 'apa', label: 'APA 7' },
  { id: 'mla', label: 'MLA 9' },
  { id: 'chicago', label: 'Chicago' },
  { id: 'bibtex', label: 'BibTeX', hint: 'Zotero, LaTeX' },
  { id: 'ris', label: 'RIS', hint: 'Mendeley, EndNote' },
  { id: 'markdown', label: 'Markdown', hint: 'para enlazar' },
  { id: 'url', label: 'Enlace' },
]
