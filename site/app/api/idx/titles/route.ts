import { pool } from '@/lib/db'

/** All norma titles for the ⌘K MiniSearch index — mirrors idx/titles.json. */
export async function GET() {
  const { rows } = await pool.query(
    `SELECT id_norma, numero, tipo, titulo, organismo, fecha_publicacion
       FROM norma WHERE titulo <> '' ORDER BY id_norma DESC LIMIT 5000`,
  )
  return Response.json(
    rows.map((r) => ({
      idNorma: r.id_norma,
      numero: r.numero,
      tipo: r.tipo,
      titulo: r.titulo,
      organismo: r.organismo ?? '',
      fechaPublicacion: r.fecha_publicacion,
    })),
  )
}
