import { pool } from './db'
import { align, type Segment } from './diff'
import { getArticlesAsOf } from './norma'

/** One changed article inside a target law, with the text before and after the
 *  modificatoria took effect. The redline is computed client-side from these
 *  two bodies (word-level), so the payload stays plain data. */
export interface EfectoArticle {
  slug: string
  label: string
  rawHeading: string
  status: 'modified' | 'added' | 'removed'
  prevBody: string
  currBody: string
}

/** Everything one modificatoria did to one target law on one date. */
export interface Efecto {
  target: {
    idNorma: number
    tipo: string
    numero: string
    titulo: string
  }
  fecha: string
  articles: EfectoArticle[]
  /** How many changed articles exist beyond those returned (cap applied). */
  more: number
}

// Bounds so a sweeping modificatoria ("modifica diversos cuerpos legales") can't
// turn one panel into hundreds of full-law diffs. Surfaced in the payload when hit.
const MAX_TARGETS = 60
const MAX_ARTICLES_PER_TARGET = 40

function toSegment(a: { slug: string; label: string; rawHeading: string; body: string }): Segment {
  return { label: a.label, slug: a.slug, rawHeading: a.rawHeading, body: a.body }
}

/** What a modificatoria changed, law by law.
 *
 *  Backed by `version.causa_id`, NOT the `modificacion` table: the latter holds
 *  ~12k scraped edges and is empty for most modifiers (a recent ley shows
 *  nothing), whereas every one of the ~344k versions records the norma that
 *  caused it. So this reflects the real effect of the law.
 *
 *  For each target version this law caused, the changed articles are the diff
 *  between that version and the one immediately before it — aligned by label,
 *  which now pairs duplicate article numbers positionally (see lib/diff).
 */
export async function getEfectos(
  modifierId: number,
): Promise<{ efectos: Efecto[]; truncated: boolean }> {
  // Target versions caused by this law (its own versions excluded: a law's
  // first version is "caused" by itself and is not an effect on another norma).
  const { rows: caused } = await pool.query(
    `SELECT v.id_norma AS target_id, v.desde,
            n.tipo, n.numero, n.titulo,
            (SELECT max(p.desde) FROM version p
              WHERE p.id_norma = v.id_norma AND p.desde < v.desde) AS prev_desde
       FROM version v
       JOIN norma n ON n.id_norma = v.id_norma
      WHERE v.causa_id = $1 AND v.id_norma <> $1
      ORDER BY v.desde DESC, v.id_norma
      LIMIT ${MAX_TARGETS + 1}`,
    [modifierId],
  )

  const truncated = caused.length > MAX_TARGETS
  const rows = caused.slice(0, MAX_TARGETS)

  const efectos: Efecto[] = []
  for (const r of rows) {
    const fecha: string = String(r.desde)
    const [curr, prev] = await Promise.all([
      getArticlesAsOf(r.target_id, fecha),
      r.prev_desde ? getArticlesAsOf(r.target_id, String(r.prev_desde)) : Promise.resolve([]),
    ])

    const changed = align(prev.map(toSegment), curr.map(toSegment))
      .filter((a) => a.status !== 'unchanged')

    if (changed.length === 0) continue // metadata-only or empty diff — not an effect worth showing

    const articles: EfectoArticle[] = changed.slice(0, MAX_ARTICLES_PER_TARGET).map((a) => {
      const s = a.curr ?? a.prev!
      return {
        slug: s.slug,
        label: s.label,
        rawHeading: s.rawHeading,
        status: a.status as EfectoArticle['status'],
        prevBody: a.prev?.body ?? '',
        currBody: a.curr?.body ?? '',
      }
    })

    efectos.push({
      target: { idNorma: r.target_id, tipo: r.tipo, numero: r.numero, titulo: r.titulo ?? '' },
      fecha,
      articles,
      more: Math.max(0, changed.length - articles.length),
    })
  }

  return { efectos, truncated }
}
