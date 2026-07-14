import { pool } from '@/lib/db'

/** Laws that the causa `id` modified — mirrors idx/modifies/{id}.json. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const causaId = Number(id)
  if (!Number.isFinite(causaId)) return Response.json([])

  const { rows } = await pool.query(
    `SELECT n.id_norma, n.tipo, n.numero, n.titulo, m.fecha, m.commit_sha
       FROM modificacion m JOIN norma n ON n.id_norma = m.target_id
      WHERE m.causa_id = $1
      ORDER BY m.fecha DESC`,
    [causaId],
  )
  return Response.json(
    rows.map((r) => ({
      idNorma: r.id_norma,
      date: r.fecha,
      sha: r.commit_sha ?? r.fecha,
      titulo: r.titulo ?? '',
      tipo: r.tipo,
      numero: r.numero,
    })),
  )
}
