import { pool } from '@/lib/db'

/** Landing data: year-density histogram + recent publication events.
 *  Mirrors the old idx/landing.json. */
export async function GET() {
  const hist = (await pool.query(
    `SELECT extract(year FROM fecha_publicacion)::int AS year, count(*)::int AS count
       FROM norma WHERE fecha_publicacion IS NOT NULL
      GROUP BY year ORDER BY year`,
  )).rows

  const events = (await pool.query(
    `SELECT v.desde, v.causa_id, v.subject, n.id_norma, n.numero, n.tipo, n.titulo
       FROM version v JOIN norma n ON n.id_norma = v.id_norma
      WHERE n.titulo <> ''
      ORDER BY v.desde DESC
      LIMIT 60`,
  )).rows

  return Response.json({
    yearHistogram: hist.map((r) => ({ year: r.year, count: r.count })),
    recentEvents: events.map((r) => ({
      sha: r.desde,
      date: r.desde,
      causaId: r.causa_id ?? r.id_norma,
      subject: r.subject ?? '',
      idNorma: r.id_norma,
      numero: r.numero,
      tipo: r.tipo,
      titulo: r.titulo ?? '',
    })),
  })
}
