import { getNormaById, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma } from '@/lib/apiparams'

/** Every version of a norma with its validity window. `desde`/`hasta` are the
 *  fechas to pass to the article and diff endpoints. */
export const GET = withApiKey('/v1/normas/{idNorma}/versiones', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  return jsonOk({
    idNorma,
    vigente: currentFecha(versions),
    total: versions.length,
    versiones: versions.map((v) => ({
      desde: v.desde, hasta: v.hasta, causaId: v.causaId, subject: v.subject,
    })),
  }, 300, req)
})
