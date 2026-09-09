import { getNormaById, getArticlesAsOf, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** Metadata plus an article INDEX — never article bodies.
 *
 *  One norma can be ~350 KB of text. Returning it whole would make the common
 *  case (identify a law, then read one article) pay for the rare one. Bodies
 *  come from /articulos/{slug}, one at a time. */
export const GET = withApiKey('/v1/normas/{idNorma}', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  const fecha = parseFecha(new URL(req.url).searchParams.get('fecha'), currentFecha(versions))
  const articulos = await getArticlesAsOf(idNorma, fecha)

  return jsonOk({
    idNorma: norma.idNorma,
    tipo: norma.tipo,
    numero: norma.numero,
    titulo: norma.titulo,
    organismo: norma.organismo,
    derogado: norma.derogado,
    fechaPublicacion: norma.fechaPublicacion,
    fecha,
    totalVersiones: versions.length,
    articulos: articulos.map((a) => ({
      slug: a.slug, label: a.label, rawHeading: a.rawHeading,
    })),
  }, 300)
})
