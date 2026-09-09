import { getNormaById, getModifies, getModifiedBy } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma } from '@/lib/apiparams'

/** Both directions of the modification graph.
 *
 *  Every entry carries `idNorma`, so a caller can address the related norma
 *  directly instead of resolving (tipo, numero) — which for a "DFL 4"
 *  reference is ambiguous many times over. */
export const GET = withApiKey('/v1/normas/{idNorma}/modificaciones', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const [modifica, modificadaPor] = await Promise.all([
    getModifies(idNorma),
    getModifiedBy(idNorma),
  ])
  const shape = (m: { idNorma: number; tipo: string; numero: string; titulo: string; fecha: string }) => ({
    idNorma: m.idNorma, tipo: m.tipo, numero: m.numero, titulo: m.titulo, fecha: m.fecha,
  })

  return jsonOk({ idNorma, modifica: modifica.map(shape), modificadaPor: modificadaPor.map(shape) }, 300, req)
})
