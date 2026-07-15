import { pool } from '@/lib/db'

/** Publication events for one year — mirrors idx/by-year/{year}.json. Powers the
 *  landing's year-filter drill-down (YearRibbon click). */
export async function GET(_req: Request, ctx: { params: Promise<{ year: string }> }) {
  const { year } = await ctx.params
  const y = Number(year)
  if (!Number.isFinite(y)) return Response.json([])

  const { rows } = await pool.query(
    `SELECT v.desde, v.causa_id, v.subject, n.id_norma, n.numero, n.tipo, n.titulo, n.organismo
       FROM version v JOIN norma n ON n.id_norma = v.id_norma
      WHERE extract(year FROM v.desde) = $1 AND n.titulo <> ''
      ORDER BY v.desde DESC
      LIMIT 400`,
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
  )
}
