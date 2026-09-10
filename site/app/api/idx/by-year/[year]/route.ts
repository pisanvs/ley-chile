import { pool } from '@/lib/db'

/** Publication events for one year — mirrors idx/by-year/{year}.json. Powers the
 *  landing's year-filter drill-down (YearRibbon click).
 *
 *  Returns EVERY event in the year. This used to carry `LIMIT 400` under a
 *  comment claiming it fetched "the full shard for that year", which it did
 *  not: 64 of the corpus's 189 populated years exceed 400 events, so a third of
 *  the ribbon's bars drilled down into a silently truncated list. Clicking 2022
 *  showed 400 of 12,766. Worse, the truncation was invisible — the UI had no
 *  way to say "there are more", so the density graph and its own drill-down
 *  disagreed with each other.
 *
 *  Unbounded is affordable here: the worst year measures 47 ms and ~3.3 MB of
 *  JSON before gzip, over a `version` table of ~344k rows that grows by a few
 *  thousand a year. If that ever stops being true, the fix is pagination with a
 *  total count — not a silent cap.
 *
 *  The year is matched as a half-open date range rather than
 *  `extract(year FROM desde)`, which is index-eligible if an index on
 *  `version.desde` is ever added. Identical semantics, no numeric cast. */
export async function GET(_req: Request, ctx: { params: Promise<{ year: string }> }) {
  const { year } = await ctx.params

  // Strict: `Number.isFinite` alone accepted "2022.5" and "1e9", which then
  // reached make_date() as garbage.
  if (!/^\d{4}$/.test(year)) return Response.json([])
  const y = Number(year)
  if (y < 1800 || y > 2100) return Response.json([])

  const { rows } = await pool.query(
    `SELECT v.desde, v.causa_id, v.subject, n.id_norma, n.numero, n.tipo, n.titulo, n.organismo
       FROM version v JOIN norma n ON n.id_norma = v.id_norma
      WHERE v.desde >= make_date($1, 1, 1)
        AND v.desde <  make_date($1 + 1, 1, 1)
        AND n.titulo <> ''
      ORDER BY v.desde DESC`,
    [y],
  )

  return Response.json(
    rows.map((r) => ({
      sha: r.desde,
      date: r.desde,
      causaId: r.causa_id ?? r.id_norma,
      subject: r.subject ?? '',
      idNorma: r.id_norma,
      numero: r.numero,
      tipo: r.tipo,
      titulo: r.titulo ?? '',
      organismo: r.organismo ?? '',
    })),
    {
      // A past year's events never change, and even the current year changes
      // only when the loader runs. Worth caching now that the payload is the
      // real thing rather than a 400-row slice.
      headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' },
    },
  )
}
