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
  | 'chile' | 'rchd' | 'apa' | 'mla' | 'chicago' | 'bibtex' | 'ris' | 'markdown' | 'url'

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
 * Differs from `normaName` in its ordinal mark: the journal writes "Nº" (N +
 * masculine ordinal) where the rest of the site writes "N°" (N + degree sign).
 * They look nearly identical and are not the same character; a reference list
 * that mixes them is visibly inconsistent to the copy editor reading it.
 */
function rchdName(s: CiteSource): string {
  const label: Record<string, string> = {
    ley: 'Ley', dl: 'Decreto Ley', dfl: 'Decreto con Fuerza de Ley',
    dto: 'Decreto', res: 'Resolución',
  }
  const kind = label[s.tipo] ?? s.tipo.toUpperCase()
  return `${kind} Nº ${prettyNumero(s.numero)}`
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

    case 'rchd': {
      // Revista Chilena de Derecho's legislation entry:
      //   Chile, Ley Nº 19.628. Sobre protección de la vida privada (28/08/1999).
      //   Chile, Constitución Política de la República (11/08/1980).
      //
      // Jurisdiction first, then the norma, then its title in sentence case,
      // then the publication date as DD/MM/YYYY. No Diario Oficial and no URL —
      // neither appears in the journal's entries.
      //
      // A named norma (a código, the Constitución) carries its title as its
      // name, so it is printed once rather than repeated.
      const named = s.tipo === 'cod'
      const head = named ? titleCase(s.titulo) : rchdName(s)
      const body = named ? '' : sentenceCase(s.titulo)
      const when = slashDate(s.fechaPublicacion)
      // The examples are reference-list entries for whole normas, so the
      // article is an extension of the style rather than something observed in
      // it; it goes where the rest of the identifier goes.
      return (
        `Chile, ${head}${art ? `, ${art}` : ''}` +
        (body ? `. ${body}` : '') +
        (when ? ` (${when})` : '') +
        '.'
      )
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
  { id: 'rchd', label: 'Rev. Chilena de Derecho', hint: 'revisa nombres propios' },
  { id: 'apa', label: 'APA 7' },
  { id: 'mla', label: 'MLA 9' },
  { id: 'chicago', label: 'Chicago' },
  { id: 'bibtex', label: 'BibTeX', hint: 'Zotero, LaTeX' },
  { id: 'ris', label: 'RIS', hint: 'Mendeley, EndNote' },
  { id: 'markdown', label: 'Markdown', hint: 'para enlazar' },
  { id: 'url', label: 'Enlace' },
]
