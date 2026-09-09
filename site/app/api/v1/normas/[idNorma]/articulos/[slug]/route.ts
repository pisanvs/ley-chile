import { getNormaById, getArticlesAsOf, getVersions, currentFecha } from '@/lib/norma'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** Matches the cap the MCP server applies. A handful of articles in the corpus
 *  are enormous; `truncado` tells the caller the text is incomplete rather than
 *  letting them treat a cut-off article as the whole provision. */
const MAX_BODY = 12_000

export const GET = withApiKey('/v1/normas/{idNorma}/articulos/{slug}', async (req, ctx) => {
  const params = await ctx.params
  const idNorma = parseIdNorma(params.idNorma)
  const slug = params.slug

  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const versions = await getVersions(idNorma)
  const fecha = parseFecha(new URL(req.url).searchParams.get('fecha'), currentFecha(versions))
  const articulos = await getArticlesAsOf(idNorma, fecha)
  const art = articulos.find((a) => a.slug === slug)
  if (!art) throw new NotFound(`No article "${slug}" in idNorma ${idNorma} as of ${fecha}`)

  const truncado = art.body.length > MAX_BODY
  return jsonOk({
    idNorma, fecha, slug: art.slug, label: art.label, rawHeading: art.rawHeading,
    body: truncado ? art.body.slice(0, MAX_BODY) : art.body,
    truncado,
    largoCompleto: art.body.length,
  }, 300)
})
