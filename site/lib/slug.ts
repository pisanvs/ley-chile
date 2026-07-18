/** Decorative slug for the canonical norma URL: /norma/{idNorma}/{slug}.
 *
 *  It NEVER participates in resolution — idNorma alone identifies a norma — so
 *  it is free to change whenever the underlying data does. That is the entire
 *  point of the scheme. Measured over the corpus, no human-readable key is
 *  unique: (tipo, numero) leaves 91.7% of normas sharing an address, and even
 *  (tipo, numero, organismo, año) still collides for 45k of them. Worse, the
 *  readable parts are unstable — `organismo` is lossy (two thirds of normas
 *  carry several and the export keeps only the first) and drifts across 923
 *  spellings (ten variants of one ministry, differing by an accent or a
 *  trailing period), and `numero` is not URL-safe for nearly half the corpus
 *  (spaces, slashes, commas, "EXENTA").
 *
 *  So the id is authoritative and everything here is cosmetic: a stale, wrong,
 *  or absent slug 301s to the current one instead of 404ing, and re-slugging
 *  the whole corpus later costs nothing.
 */

const MAX_SLUG = 72

/** ASCII-fold + kebab-case. Chilean law titles carry diacritics, ordinals (Nº),
 *  and heavy punctuation; none of it belongs in a path. */
function kebab(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Clip at a word boundary so a slug never ends mid-token. Falls back to a hard
 *  cut when the first token alone exceeds the budget. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > max / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}

export interface SluggableNorma {
  tipo: string
  numero: string
  titulo: string
}

/** `{tipo}-{numero}-{título}`, folded and clipped. Leads with the citation so
 *  the URL still reads as a legal reference ("dfl-4-ley-organica-…"). */
export function normaSlug(n: SluggableNorma): string {
  const head = kebab(`${n.tipo} ${n.numero}`)
  const tail = kebab(n.titulo)
  const joined = [head, tail].filter(Boolean).join('-')
  // A norma with no tipo, numero or título at all still needs an address.
  return clip(joined, MAX_SLUG) || 'norma'
}
