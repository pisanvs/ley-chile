import { pool } from '@/lib/db'

/** Distinct modifier laws of target `id`, aggregated — mirrors
 *  idx/modified_by/{id}.json. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const targetId = Number(id)
  if (!Number.isFinite(targetId)) return Response.json([])

  const { rows } = await pool.query(
    `SELECT n.id_norma AS modifier_id, n.tipo, n.numero, n.titulo,
            min(m.fecha) AS first_date, max(m.fecha) AS last_date,
            count(*)::int AS count, array_agg(DISTINCT m.fecha ORDER BY m.fecha) AS touched
       FROM modificacion m JOIN norma n ON n.id_norma = m.causa_id
      WHERE m.target_id = $1
      GROUP BY n.id_norma, n.tipo, n.numero, n.titulo
      ORDER BY max(m.fecha) DESC`,
    [targetId],
  )
  return Response.json(
    rows.map((r) => ({
      modifierId: r.modifier_id,
      modifierTipo: r.tipo,
      modifierNumero: r.numero,
      modifierTitulo: r.titulo ?? '',
      firstDate: r.first_date,
      lastDate: r.last_date,
      count: r.count,
      touchedDates: (r.touched ?? []).map((d: unknown) => String(d)),
    })),
  )
}
