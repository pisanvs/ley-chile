import type { Segment } from './segment'
import type { Efecto } from './efectos'

/**
 * Pairing each effect with the modifier article that caused it.
 *
 * Extracted from EfectosPanel so it can be tested against real modificatorias:
 * every rule here was written against a law that it got wrong, and the fixtures
 * in `__fixtures__/efectos` are those laws.
 *
 * A Chilean modificatoria names its target inside each article — "Modifícase el
 * decreto con fuerza de ley N° 5, de 1967 … en el siguiente sentido:" — so the
 * target can be recovered from the article text and matched to the effect on
 * that same law. That is what lets a change sit beside the article that
 * produced it rather than in a flat list.
 *
 * Heuristic, not a parser. It requires a tipo cue near the number so an
 * incidental "artículo 5" is not read as "DFL 5"; what no pass claims falls to
 * "Otras modificaciones", which is a correct answer, just a less useful one.
 */

const TIPO_CUE: Record<string, string> = {
  dfl: 'fuerza de ley',
  dl: 'decreto\\s+ley',
  dto: 'decreto(?:\\s+supremo)?',
  ley: 'ley',
  cod: 'c[oó]digo',
}

/** Collapse thousands separators inside numbers ("19.882" → "19882") so a bare
 *  number match is reliable. */
export function collapseNums(s: string): string {
  let prev = ''
  let out = s
  while (out !== prev) {
    prev = out
    out = out.replace(/(\d)\.(\d)/g, '$1$2')
  }
  return out
}

export const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Códigos are named, not numbered: the Código Penal's `numero` is the literal
 * string "PENAL". Every numeric rule below is therefore a no-op for them, and
 * before this existed the entire Código Penal block of a criminal-law reform
 * fell to "Otras modificaciones" — the single most visible mis-alignment in the
 * panel, since a law amending the Código Penal says so in its first line.
 */
export function codPattern(numero: string): RegExp | null {
  const words = fold(numero)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && w !== 'del' && w !== 'las' && w !== 'los')
  if (words.length === 0) return null
  return new RegExp(`c[oó]digo[^.;:]{0,40}?${words.map(escapeRe).join('[^.;:]{0,20}?')}`, 'i')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Strict reference: the tipo cue and the number in proximity. Rules out an
 *  incidental "artículo 5" being read as "DFL 5". */
export function strictPattern(tipo: string, numero: string): RegExp | null {
  if (tipo === 'cod') return codPattern(numero)
  const num = numero.replace(/\D/g, '')
  const cue = TIPO_CUE[tipo]
  if (!num || !cue) return null
  return new RegExp(`${cue}[^.;:]{0,60}?n[°ºo]?\\s*${num}\\b`, 'i')
}

/**
 * Title words too generic to identify a law on their own.
 *
 * The minimum token length is 5, not 7: at 7 the discriminating word of most
 * códigos ("penal", "civil", "aguas", "minas") was silently excluded, which is
 * why nothing ever matched them by name. Dropping the floor means the stopword
 * list has to carry the weight instead, so it also holds the short generic
 * words that a legal title is full of.
 */
const NAME_STOPWORDS = new Set([
  'codigo', 'ley', 'leyes', 'sobre', 'general', 'generales', 'normas', 'norma',
  'sistema', 'nacional', 'servicio', 'servicios', 'ministerio', 'establece',
  'texto', 'refundido', 'coordinado', 'sistematizado', 'organica', 'organico',
  'constitucional', 'materia', 'materias', 'disposiciones', 'aprueba', 'crea',
  'fija', 'estatuto', 'sector', 'publico', 'del', 'los', 'las', 'para',
  // Short and generic — only reachable since the length floor dropped to 5.
  'otras', 'otros', 'nueva', 'nuevo', 'nuevas', 'nuevos', 'dicta', 'chile',
  'republica', 'decreto', 'decretos', 'fuerza', 'numero', 'articulo',
  'articulos', 'regula', 'modifica', 'introduce', 'contra', 'entre', 'segun',
  'dispone', 'aplica', 'vigente', 'anexo', 'parte', 'sera', 'este', 'esta',
])

const MIN_TOKEN = 5

/** Distinctive words from a target's title and common names ("aeronautico",
 *  "penal", "municipalidades") — specific enough to identify the law when a
 *  modifier article names it instead of numbering it. */
export function nameTokens(titulo: string, comunes: string[]): string[] {
  const seen = new Set<string>()
  for (const src of [...comunes, titulo]) {
    for (const w of fold(src).split(/[^a-z0-9]+/)) {
      if (w.length >= MIN_TOKEN && !NAME_STOPWORDS.has(w)) seen.add(w)
    }
  }
  return Array.from(seen)
}

/**
 * One segment of the modificatoria, with whatever it changed.
 *
 * There is a row for *every* segment, including those that changed nothing.
 * The panel used to render only rows with effects, which silently deleted the
 * rest of the law: a modificatoria's quoted insertions carry their own
 * `#### Artículo N` heading, so `segment()` emits them as articles of the
 * modifier — they are nothing of the sort, they are the text being written into
 * the target. Ley 21.579 consequently ended at "Agrégase el siguiente artículo
 * 7° transitorio, nuevo:" with the inserted article nowhere on the page.
 *
 * Keeping every segment is also the only honest rendering: this is the tab that
 * claims to show what a law did, and a reader cannot check that against a text
 * with holes in it. Segments with no effects render full-width in the panel, so
 * completeness costs no empty columns.
 */
export interface AlignedRow {
  article: Segment
  efectos: Efecto[]
}

/**
 * Whether an effect is a re-transcription of the whole target rather than a
 * legislative change to part of it.
 *
 * Some normas have a version whose stored text is not the text that was in
 * force on that date. Decreto ley 3.346 is the clearest case: its *earliest*
 * version, 1980-05-22, carries the text of the 2016 reform that renamed the
 * ministry — so diffing the 2012 version against it reports all 19 articles as
 * modified, and reports them backwards, with the 2016 wording as the "before".
 * Ley 20.587 then showed a wall of redlines claiming it rewrote a law it
 * touched in two places. That is the "complete disconnection between cause and
 * effect" in the report, and its cause is the corpus, not the diff.
 *
 * The site cannot repair the text, but it can decline to present a corpus
 * artifact as legislative history. A genuine modificatoria edits a handful of
 * articles; one that appears to rewrite nearly every article of its target at
 * once is almost always a re-transcription, so the panel labels it and folds it
 * away instead of rendering dozens of false redlines.
 */
export function isWholesaleRewrite(e: Efecto): boolean {
  const changed = e.articles.length + e.more
  return changed >= WHOLESALE_MIN_ARTICLES && changed >= e.totalArticles * WHOLESALE_RATIO
}

const WHOLESALE_MIN_ARTICLES = 8
const WHOLESALE_RATIO = 0.75

/** Don't stack more than a few effects on one article — keeps a fuzzy pass from
 *  dumping several laws onto one long article. */
const MAX_PER_ROW = 3

/**
 * Pair each effect with the modifier article that caused it, then slice the
 * document so every segment belongs to exactly one row.
 *
 * Passes, most confident first:
 *   1. strict — tipo cue + number in proximity ("fuerza de ley N° 5"), or for a
 *      código, the cue plus its name ("Código Penal").
 *   2. number-only — a distinctive number (≥4 digits, so not confusable with an
 *      article number) anywhere in an as-yet-unmatched article.
 *   3. by name — a distinctive word of the target's title or common names, for
 *      laws cited by name rather than number.
 */
export function alignEffects(
  articles: Segment[],
  efectos: Efecto[],
): { rows: AlignedRow[]; unmatched: Efecto[] } {
  const bodies = articles.map((a) => collapseNums(a.body))
  const folded = bodies.map(fold)
  const claimed = new Map<number, Efecto[]>()
  const taken = new Set<number>()

  // The preamble is the law's own title and recitals. It names the target as
  // loudly as any article does — ley 21.562's is literally "MODIFICA LEY N°
  // 19.300, SOBRE BASES GENERALES DEL MEDIO AMBIENTE" — but it modifies
  // nothing, so letting it match put every effect of that law against a block
  // of front matter instead of against the article that did the work.
  const eligible = (i: number) =>
    articles[i].label !== '__preamble__' && articles[i].label !== '__doc__'

  const free = (ai: number) => eligible(ai) && (claimed.get(ai)?.length ?? 0) < MAX_PER_ROW
  const claim = (ai: number, ei: number, e: Efecto) => {
    const list = claimed.get(ai)
    if (list) list.push(e)
    else claimed.set(ai, [e])
    taken.add(ei)
  }

  const assign = (test: (body: string, e: Efecto, ei: number) => boolean) => {
    efectos.forEach((e, ei) => {
      if (taken.has(ei)) return
      const ai = bodies.findIndex((b, i) => free(i) && test(b, e, ei))
      if (ai >= 0) claim(ai, ei, e)
    })
  }

  const strict = efectos.map((e) => strictPattern(e.target.tipo, e.target.numero))
  assign((body, _e, ei) => !!strict[ei] && strict[ei]!.test(body))

  assign((body, e) => {
    const num = e.target.numero.replace(/\D/g, '')
    return num.length >= 4 && new RegExp(`(^|\\D)${num}(\\D|$)`).test(body)
  })

  const tokens = efectos.map((e) => nameTokens(e.target.titulo, e.target.nombresUsoComun))
  efectos.forEach((e, ei) => {
    if (taken.has(ei)) return
    const toks = tokens[ei]
    if (toks.length === 0) return
    const ai = folded.findIndex((fb, i) => free(i) && toks.some((t) => fb.includes(t)))
    if (ai >= 0) claim(ai, ei, e)
  })

  const rows: AlignedRow[] = articles.map((article, i) => ({
    article,
    efectos: claimed.get(i) ?? [],
  }))
  const unmatched = efectos.filter((_, i) => !taken.has(i))
  return { rows, unmatched }
}
