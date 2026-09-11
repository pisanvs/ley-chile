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
  | 'chile' | 'apa' | 'mla' | 'chicago' | 'bibtex' | 'ris' | 'markdown' | 'url'

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

/** "art. 12" from "Artículo 12" — citation styles abbreviate. */
function artShort(articulo?: string): string | null {
  if (!articulo) return null
  const n = articulo.replace(/^[Aa]rt[íi]culo\s*/, '').trim()
  return n ? `art. ${n}` : null
}

const DO = 'Diario Oficial de la República de Chile'

export function renderCite(fmt: CiteFormat, s: CiteSource, today = new Date()): string {
  const name = normaName(s)
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
      return [
        `@legislation{${key},`,
        `  title        = {${name}${art ? `, ${art}` : ''}},`,
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
        `TI  - ${name}${art ? `, ${art}` : ''}`,
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
  { id: 'apa', label: 'APA 7' },
  { id: 'mla', label: 'MLA 9' },
  { id: 'chicago', label: 'Chicago' },
  { id: 'bibtex', label: 'BibTeX', hint: 'Zotero, LaTeX' },
  { id: 'ris', label: 'RIS', hint: 'Mendeley, EndNote' },
  { id: 'markdown', label: 'Markdown', hint: 'para enlazar' },
  { id: 'url', label: 'Enlace' },
]
