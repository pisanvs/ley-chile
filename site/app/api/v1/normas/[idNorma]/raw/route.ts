import { getNormaById, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** The canonical leychile.cl URL for one version — the authoritative source
 *  this corpus is derived from, for anyone who needs to cite or verify it. */
export const GET = withApiKey('/v1/normas/{idNorma}/raw', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  const fecha = parseFecha(new URL(req.url).searchParams.get('fecha'), currentFecha(versions))

  return jsonOk({
    idNorma,
    fecha,
    url: `https://www.leychile.cl/Navegar?idNorma=${idNorma}&idVersion=${fecha}`,
    xml: `https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma=${idNorma}&idVersion=${fecha}`,
  }, 300, req)
})
