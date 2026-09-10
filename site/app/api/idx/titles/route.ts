import { pool } from '@/lib/db'
import { jsonz } from '@/lib/jsonz'

/** All norma titles for the ⌘K MiniSearch index — mirrors idx/titles.json. */
export async function GET(req: Request) {
  const { rows } = await pool.query(
    `SELECT id_norma, numero, tipo, titulo, organismo, fecha_publicacion
       FROM norma WHERE titulo <> '' ORDER BY id_norma DESC LIMIT 5000`,
  )
  return jsonz(
    req,
    rows.map((r) => ({
      idNorma: r.id_norma,
      numero: r.numero,
      tipo: r.tipo,
      titulo: r.titulo,
      organismo: r.organismo ?? '',
      fechaPublicacion: r.fecha_publicacion,
    })),
    // Every landing visitor fetches this. It changes only when the loader runs,
    // and it was shipping 1.2 MB uncompressed with no cache header at all.
    { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } },
  )
}
