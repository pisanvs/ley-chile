import { getNormaById, getArticlesAsOf, getVersions, currentFecha } from '@/lib/norma'
import { searchArticles } from '@/lib/search'
import { withApiKey, jsonOk, NotFound } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

/** The article index at a fecha. With `q`, searches WITHIN the norma and
 *  returns only matching articles, each with a snippet — the way to locate the
 *  relevant article of a code with hundreds of them without pulling its text. */
export const GET = withApiKey('/v1/normas/{idNorma}/articulos', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const url = new URL(req.url)
  const versions = await getVersions(idNorma)
  const fecha = parseFecha(url.searchParams.get('fecha'), currentFecha(versions))
  const q = url.searchParams.get('q')?.trim() ?? ''

  if (q.length >= 2) {
    const hits = await searchArticles(idNorma, q, fecha)
    return jsonOk({
      idNorma, fecha, query: q, total: hits.length,
      articulos: hits.map((h) => ({
        slug: h.slug, label: h.label, rawHeading: h.rawHeading, snippet: h.snippet,
      })),
    })
  }

  const articulos = await getArticlesAsOf(idNorma, fecha)
  return jsonOk({
    idNorma, fecha, total: articulos.length,
    articulos: articulos.map((a) => ({
      slug: a.slug, label: a.label, rawHeading: a.rawHeading,
    })),
  }, 300, req)
})
