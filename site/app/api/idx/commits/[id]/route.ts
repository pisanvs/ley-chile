import { pool } from '@/lib/db'

/** Mirrors the old static `idx/commits/{id}.json` shard, from Postgres.
 *  `id` may be an idNorma or a bare `numero`; resolves either. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const n = Number(id)

  const norma = (await pool.query(
    `SELECT id_norma, numero, tipo, titulo, organismo, fecha_publicacion
       FROM norma
      WHERE id_norma = $1 OR numero = $2
      ORDER BY (id_norma = $1) DESC
      LIMIT 1`,
    [Number.isFinite(n) ? n : -1, id],
  )).rows[0]

  if (!norma) return new Response('not found', { status: 404 })

  const versions = (await pool.query(
    `SELECT desde, commit_sha, causa_id, subject, magnitude
       FROM version WHERE id_norma = $1 ORDER BY desde`,
    [norma.id_norma],
  )).rows

  return Response.json({
    norma: {
      id_norma: norma.id_norma,
      numero: norma.numero,
      tipo: norma.tipo,
      titulo: norma.titulo,
      organismo: norma.organismo,
      fecha_publicacion: norma.fecha_publicacion,
    },
    // The reader keys versions by `sha` + `date`; we use the version's `desde`
    // as the stable identifier (there is one commit per publication date).
    commits: versions.map((v) => ({
      sha: v.desde,
      date: v.desde,
      causa_id: v.causa_id ?? norma.id_norma,
      subject: v.subject ?? '',
      magnitude: v.magnitude ?? 0,
    })),
    rel_dir: String(norma.id_norma),
  })
}
