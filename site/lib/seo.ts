import { pool } from './db'
import {
  getCanonicalNorma, getKeyPage, getNormaById, type Norma, type Version,
} from './norma'
import { normaHref } from './href'
import { normaSlug } from './slug'

/** Tipos that carry substantive articulado worth a guide. `res`/`dto` are the
 *  bulk of the corpus (~298k of ~333k) and are overwhelmingly one-liners —
 *  a guide for each would be 300k near-duplicate pages, which demotes the site. */
export const GUIA_TIPOS = ['ley', 'dl', 'dfl', 'cod', 'otras'] as const

/** A guide must have enough of its own text to be a page rather than a stub.
 *  Article count is the whole gate, and it is deliberately the ONLY criterion.
 *
 *  The obvious better gate is "enough characters of body text", and the first
 *  version of this used `sum(length(body)) >= 2000`. It has to go: `body` is
 *  TOAST'd, so summing its length over the ~872k articulo rows detoasts every
 *  body in the corpus. Run in bulk (the /guia index and the content sitemap)
 *  that spilled to temp files and took production Postgres down with
 *  `could not write to file "base/pgsql_tmp/...": No space left on device` —
 *  a 500 on two live routes. Counting rows is index-friendly and costs nothing.
 *
 *  Measured against the live corpus (2026-07-16): 22,618 normas match
 *  GUIA_TIPOS; 6,602 clear >=5 articles. Of those, only 429 carry under 2,000
 *  chars and the thinnest still has 801 — real legal text plus a modification
 *  graph that is unique to it, so none of them is a thin duplicate. The other
 *  ~16k are deliberately absent (404), not noindexed, so they cost no crawl
 *  budget.
 *
 *  This one number is the gate for BOTH the page and the sitemap. They must
 *  never diverge: a cheap gate in the sitemap and a strict one on the page
 *  would publish URLs that 404. */
export const MIN_GUIA_ARTICLES = 5

export interface GuiaStats {
  articles: number
}

export async function getGuiaStats(idNorma: number): Promise<GuiaStats> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS articles FROM articulo WHERE id_norma = $1`,
    [idNorma],
  )
  return { articles: rows[0]?.articles ?? 0 }
}

export function qualifiesForGuia(n: Norma, s: GuiaStats): boolean {
  return (
    (GUIA_TIPOS as readonly string[]).includes(n.tipo) &&
    s.articles >= MIN_GUIA_ARTICLES
  )
}

/** A change page needs a change to describe: more than one version AND at least
 *  one recorded modificacion. 5,390 normas qualify. */
export function qualifiesForCambios(versions: Version[], mods: number): boolean {
  return versions.length > 1 && mods > 0
}

export async function countModifiedBy(idNorma: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS c FROM modificacion WHERE target_id = $1`,
    [idNorma],
  )
  return rows[0]?.c ?? 0
}

/** Resolve a norma for a /guia or /cambios URL. Returns null when the norma
 *  doesn't exist — callers notFound(). No aliasing here: unlike the reader,
 *  nothing external links to a wrong-tipo guide URL, so guessing buys nothing.
 *
 *  Uses the canonical (most-reformed) for a colliding key so /guia/dfl/1 and the
 *  reader /dfl/1 land on the SAME norma (the Código del Trabajo), not two
 *  different DFL 1s. */
export async function getSeoNorma(tipo: string, numero: string): Promise<Norma | null> {
  const resolved = await getCanonicalNorma(tipo, numero)
  return resolved?.norma ?? null
}

/** How a /guia or /cambios request resolves. Shared by both routes so the two
 *  cannot drift apart on identity handling. */
export type SeoRouteResolution =
  | { kind: 'render'; norma: Norma }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' }

/** Resolve `/{guia|cambios}/...` under the same rule as the reader: idNorma
 *  addresses, the slug decorates, and an ambiguous legacy key is never guessed.
 *
 *  Accepts both shapes because they are indistinguishable by length:
 *    /guia/{idNorma}/{slug}   — canonical; a wrong or missing slug 301s
 *    /guia/{tipo}/{numero}    — legacy; 301s to canonical when the key names
 *                               exactly one norma, and to the norma hub when it
 *                               does not (choose a norma, then read about it).
 *
 *  The first segment discriminates: no tipo in the corpus is numeric. */
export async function resolveSeoRoute(
  rest: string[],
  hrefFor: (n: Norma) => string,
): Promise<SeoRouteResolution> {
  if (rest.length < 1 || rest.length > 2) return { kind: 'notFound' }

  if (/^\d+$/.test(rest[0])) {
    const norma = await getNormaById(Number(rest[0]))
    if (!norma) return { kind: 'notFound' }
    if (rest[1] !== normaSlug(norma)) return { kind: 'redirect', to: hrefFor(norma) }
    return { kind: 'render', norma }
  }

  if (rest.length !== 2) return { kind: 'notFound' }
  const [tipo, numero] = rest
  const { members, total } = await getKeyPage(tipo, numero, 1)
  if (total === 0) return { kind: 'notFound' }
  if (total === 1) return { kind: 'redirect', to: hrefFor(members[0]) }
  return { kind: 'redirect', to: normaHref(tipo, numero) }
}

export interface GuiaArticle {
  slug: string
  label: string
  rawHeading: string
  body: string
  ord: number
}

/** The articles in force at `fecha`, capped. The guide renders real legal text
 *  server-side — this is the whole point, since the reader ships an empty shell
 *  to crawlers. The cap keeps a 350KB norma from producing a 350KB document. */
export async function getGuiaArticles(
  idNorma: number,
  fecha: string,
  limit = 12,
): Promise<GuiaArticle[]> {
  const { rows } = await pool.query(
    `SELECT a.slug, a.label, a.raw_heading, a.body, s.ord
       FROM articulo_span s
       JOIN articulo a ON a.id = s.articulo_id
      WHERE a.id_norma = $1 AND s.vigencia @> $2::date
      ORDER BY s.ord
      LIMIT $3`,
    [idNorma, fecha, limit],
  )
  return rows.map((r) => ({
    slug: r.slug,
    label: r.label,
    rawHeading: r.raw_heading,
    body: r.body,
    ord: r.ord,
  }))
}

export interface SeoUrlRow {
  /** idNorma + titulo so the content sitemap can emit canonical
   *  /guia/{id}/{slug} URLs instead of the ambiguous key form. */
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  lastmod: string | null
}

/** Every norma that clears the guide gate. Drives the content sitemap.
 *  Counts only — never sum(length(body)) here. See MIN_GUIA_ARTICLES. */
export async function listGuiaUrls(): Promise<SeoUrlRow[]> {
  const { rows } = await pool.query(
    `SELECT n.id_norma, n.tipo, n.numero, n.titulo, n.fecha_publicacion AS lastmod
       FROM norma n
       JOIN (
         SELECT id_norma, count(*) AS arts FROM articulo GROUP BY id_norma
       ) a ON a.id_norma = n.id_norma
      WHERE n.tipo = ANY($1)
        AND a.arts >= $2`,
    [GUIA_TIPOS as unknown as string[], MIN_GUIA_ARTICLES],
  )
  return rows.map(toSeoUrlRow)
}

/** Every norma with a real change history. */
export async function listCambiosUrls(): Promise<SeoUrlRow[]> {
  const { rows } = await pool.query(
    `SELECT n.id_norma, n.tipo, n.numero, n.titulo, max(v.desde)::text AS lastmod
       FROM norma n
       JOIN version v ON v.id_norma = n.id_norma
      WHERE EXISTS (SELECT 1 FROM modificacion m WHERE m.target_id = n.id_norma)
      GROUP BY n.tipo, n.numero, n.titulo, n.id_norma
     HAVING count(v.*) > 1`,
  )
  return rows.map(toSeoUrlRow)
}

function toSeoUrlRow(r: Record<string, any>): SeoUrlRow {
  return {
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero,
    titulo: r.titulo ?? '', lastmod: r.lastmod,
  }
}

/** Human label for a tipo. Mirrors buscar/page.tsx's TIPO_LABEL, extended with
 *  `otras` — BCN files ~700 real leyes under it (ley 21.659 is /otras/21659),
 *  and calling those "OTRAS" in a title reads as a bug to a searcher. */
export const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley',
  dl: 'Decreto Ley',
  dfl: 'DFL',
  dto: 'Decreto',
  cod: 'Código',
  res: 'Resolución',
  otras: 'Ley',
}

export function tipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo.toUpperCase()
}

/** "Ley 21.643" — Chileans write and search law numbers dotted. */
export function prettyNumero(numero: string): string {
  if (!/^\d+$/.test(numero)) return numero
  return Number(numero).toLocaleString('es-CL')
}

export function normaLabel(n: Norma): string {
  return `${tipoLabel(n.tipo)} ${prettyNumero(n.numero)}`
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** '2024-01-15' → '15 de enero de 2024'. Parsed by hand: `new Date(s)` reads a
 *  bare date as UTC midnight and then shifts it in any negative-offset zone —
 *  Chile is UTC-3/-4, so every date would render one day early. */
export function fechaLarga(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}
