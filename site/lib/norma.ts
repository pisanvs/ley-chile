import { pool } from './db'
import { normaHref } from './href'

export interface Norma {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  organismo: string
  derogado: boolean
  fechaPublicacion: string | null
  lawDir: string
}

export interface Version {
  desde: string
  hasta: string | null
  commitSha: string
  causaId: number | null
  subject: string
}

export interface Article {
  slug: string
  label: string
  rawHeading: string
  body: string
  ord: number
}

function toNorma(r: Record<string, any>): Norma {
  return {
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    organismo: r.organismo, derogado: r.derogado,
    fechaPublicacion: r.fecha_publicacion, lawDir: r.law_dir,
  }
}

/** Route params arrive percent-encoded. Next canonicalizes each dynamic segment
 *  to `encodeURIComponent(decodeURIComponent(part))`, so a numero with a space
 *  or slash — "DE COMERCIO", "3883 EXENTO", "S/N" — reaches a Server Component
 *  as "DE%20COMERCIO", not "DE COMERCIO", and an equality match against the DB
 *  misses. Decode before querying. Guard exactly as Next does: a malformed
 *  sequence throws in decodeURIComponent, so fall back to the raw value rather
 *  than 500. Idempotent for the common case — decoding a plain "21643" or
 *  "PENAL" is a no-op. */
function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export async function getNorma(tipo: string, numero: string): Promise<Norma | null> {
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo, organismo, derogado, fecha_publicacion, law_dir
       FROM norma WHERE tipo = $1 AND numero = $2 LIMIT 1`,
    [decodeSegment(tipo), decodeSegment(numero)],
  )
  return rows[0] ? toNorma(rows[0]) : null
}

/** Every norma sharing a (tipo, numero) key, most-reformed first (tie → lowest
 *  idNorma). The pair is NOT unique: ~7 different "DFL 1" laws exist, one per
 *  organismo (law_dir disambiguates them by organismo-slug, the URL doesn't).
 *  Callers that must pick one deterministically take [0]; callers that must
 *  disambiguate for a human/agent show the whole list with organismo + idNorma. */
export async function getNormasByKey(tipo: string, numero: string): Promise<Norma[]> {
  const { rows } = await pool.query(
    `SELECT n.id_norma, n.tipo, n.numero, n.titulo, n.organismo, n.derogado,
            n.fecha_publicacion, n.law_dir
       FROM norma n
       LEFT JOIN version v ON v.id_norma = n.id_norma
      WHERE n.tipo = $1 AND n.numero = $2
      GROUP BY n.id_norma, n.tipo, n.numero, n.titulo, n.organismo, n.derogado,
               n.fecha_publicacion, n.law_dir
      ORDER BY count(v.*) DESC, n.id_norma ASC`,
    [decodeSegment(tipo), decodeSegment(numero)],
  )
  return rows.map(toNorma)
}

/** organismo per idNorma, for one batched lookup. Search hits carry no
 *  organismo; the MCP enriches them with this so same-key results (e.g. several
 *  "DFL 1") are told apart. */
export async function getOrganismosByIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const { rows } = await pool.query(
    `SELECT id_norma, organismo FROM norma WHERE id_norma = ANY($1)`,
    [ids],
  )
  return new Map(rows.map((r) => [r.id_norma as number, (r.organismo ?? '') as string]))
}

export async function getVersions(idNorma: number): Promise<Version[]> {
  const { rows } = await pool.query(
    `SELECT desde, hasta, commit_sha, causa_id, subject
       FROM version WHERE id_norma = $1 ORDER BY desde`,
    [idNorma],
  )
  return rows.map(r => ({
    desde: r.desde, hasta: r.hasta,
    commitSha: r.commit_sha, causaId: r.causa_id, subject: r.subject ?? '',
  }))
}

/** One range-containment query against the GiST index on articulo_span. */
export async function getArticlesAsOf(idNorma: number, fecha: string): Promise<Article[]> {
  const { rows } = await pool.query(
    `SELECT a.slug, a.label, a.raw_heading, a.body, s.ord
       FROM articulo_span s
       JOIN articulo a ON a.id = s.articulo_id
      WHERE a.id_norma = $1 AND s.vigencia @> $2::date
      ORDER BY s.ord`,
    [idNorma, fecha],
  )
  return rows.map(r => ({
    slug: r.slug, label: r.label, rawHeading: r.raw_heading, body: r.body, ord: r.ord,
  }))
}

/** Resolve a norma by its internal BCN idNorma.
 *
 *  Causa links (blame badges, "modificada por", chronology jumps) address a
 *  norma by idNorma, not numero — the SPA's resolveToIdNorma accepted either.
 *  The reader routes use this to redirect an idNorma URL to its canonical
 *  /{tipo}/{numero}. Returns null when the causa isn't in the corpus: ~1.8k of
 *  the ~334k referenced causas have no norma row, because the export only emits
 *  normas that have their own law_dir + texto.md in historial.
 */
export async function getNormaById(idNorma: number): Promise<Norma | null> {
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo, organismo, derogado, fecha_publicacion, law_dir
       FROM norma WHERE id_norma = $1 LIMIT 1`,
    [idNorma],
  )
  return rows[0] ? toNorma(rows[0]) : null
}

/** Last resort for a URL that missed as {tipo}/{numero}, covering the two ways
 *  a legitimate norma gets addressed wrong:
 *
 *  1. An idNorma in the numero slot. Causa links (blame badges, "modificada
 *     por", chronology jumps) carry an idNorma; the SPA's resolveToIdNorma
 *     accepted either, the server routes resolve (tipo, numero) strictly.
 *  2. The right numero under the wrong tipo. BCN files ~700 leyes as `otras`
 *     (ley 21.659 lives at /otras/21659), so /ley/{numero} is the natural — and
 *     wrong — guess a human or a search engine makes.
 *
 *  Only redirect when the answer is unambiguous: numero is not unique across
 *  tipos, and small idNormas collide with numeros outright (/ley/20780 once
 *  served a decreto that way). A guess here is worse than a 404, so a numero
 *  matching more than one norma falls through.
 */
export async function resolveAlias(numero: string): Promise<Norma | null> {
  if (!/^\d+$/.test(numero)) return null
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo, organismo, derogado, fecha_publicacion, law_dir
       FROM norma WHERE numero = $1 LIMIT 2`,
    [numero],
  )
  if (rows.length === 1) return toNorma(rows[0])
  if (rows.length > 1) return null // ambiguous across tipos — don't guess
  const id = Number(numero)
  return Number.isSafeInteger(id) ? getNormaById(id) : null
}

export interface ModLink {
  tipo: string
  numero: string
  titulo: string
  fecha: string
}

/** Laws that have modified this one (distinct causa normas, newest first). */
export async function getModifiedBy(idNorma: number): Promise<ModLink[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (n.id_norma) n.tipo, n.numero, n.titulo, m.fecha
       FROM modificacion m JOIN norma n ON n.id_norma = m.causa_id
      WHERE m.target_id = $1
      ORDER BY n.id_norma, m.fecha DESC`,
    [idNorma],
  )
  return rows
    .map((r) => ({ tipo: r.tipo, numero: r.numero, titulo: r.titulo ?? '', fecha: r.fecha }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Laws this one modifies (distinct target normas, newest first). */
export async function getModifies(idNorma: number): Promise<ModLink[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (n.id_norma) n.tipo, n.numero, n.titulo, m.fecha
       FROM modificacion m JOIN norma n ON n.id_norma = m.target_id
      WHERE m.causa_id = $1
      ORDER BY n.id_norma, m.fecha DESC`,
    [idNorma],
  )
  return rows
    .map((r) => ({ tipo: r.tipo, numero: r.numero, titulo: r.titulo ?? '', fecha: r.fecha }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export function currentFecha(versions: Version[]): string {
  const open = versions.find(v => v.hasta === null)
  if (open) return open.desde
  return versions.map(v => v.desde).sort().at(-1)!
}

export function isMultiVersion(versions: Version[]): boolean {
  return versions.length > 1
}

/** SEO: ~350k single-version normas would otherwise serve byte-identical pages
 *  at /ley/X and /ley/X/<fecha>. Point the dated one at the undated one. */
export function canonicalPath(n: Norma, fecha: string, versions: Version[]): string {
  if (!isMultiVersion(versions)) return normaHref(n.tipo, n.numero)
  return fecha === currentFecha(versions) ? normaHref(n.tipo, n.numero) : normaHref(n.tipo, n.numero, fecha)
}
