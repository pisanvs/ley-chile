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

export async function getNorma(tipo: string, numero: string): Promise<Norma | null> {
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo, organismo, derogado, fecha_publicacion, law_dir
       FROM norma WHERE tipo = $1 AND numero = $2 LIMIT 1`,
    [tipo, numero],
  )
  if (!rows[0]) return null
  const r = rows[0]
  return {
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    organismo: r.organismo, derogado: r.derogado,
    fechaPublicacion: r.fecha_publicacion, lawDir: r.law_dir,
  }
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
