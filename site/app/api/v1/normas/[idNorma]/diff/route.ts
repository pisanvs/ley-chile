import { getNormaById, getArticlesAsOf } from '@/lib/norma'
import { align, wordDiff, joinDiffText } from '@/lib/diff'
import { withApiKey, jsonOk, NotFound, BadRequest } from '@/lib/apiroute'
import { parseIdNorma, parseFecha } from '@/lib/apiparams'

const MAX_ADDED_BODY = 4_000

/** What changed in a norma between two fechas.
 *
 *  This is the central question the corpus exists to answer — "how did this law
 *  read before the reform?" — so the diff is returned structured rather than
 *  rendered: callers get per-article insert/delete operations and can present
 *  them however they like. The MCP server renders the same data as prose. */
export const GET = withApiKey('/v1/normas/{idNorma}/diff', async (req, ctx) => {
  const idNorma = parseIdNorma((await ctx.params).idNorma)
  const url = new URL(req.url)
  const rawFrom = url.searchParams.get('from')
  const rawTo = url.searchParams.get('to')
  if (!rawFrom || !rawTo) {
    throw new BadRequest('Both from and to are required (YYYY-MM-DD).')
  }
  const from = parseFecha(rawFrom, '')
  const to = parseFecha(rawTo, '')

  const norma = await getNormaById(idNorma)
  if (!norma) throw new NotFound(`No norma with idNorma ${idNorma}`)

  const [prev, curr] = await Promise.all([
    getArticlesAsOf(idNorma, from),
    getArticlesAsOf(idNorma, to),
  ])
  if (prev.length === 0 && curr.length === 0) {
    throw new NotFound(`No text for idNorma ${idNorma} at either ${from} or ${to}`)
  }

  const changed = align(prev, curr).filter((a) => a.status !== 'unchanged')

  const cambios = changed.map((a) => {
    const art = a.curr ?? a.prev!
    const base = { slug: art.slug, rawHeading: art.rawHeading || art.label }
    if (a.status === 'modified' && a.prev && a.curr) {
      const ops = wordDiff(a.prev.body, a.curr.body)
        .filter((o) => o.op !== 'equal')
        .map((o) => ({ op: o.op, text: joinDiffText(o.text).trim() }))
        .filter((o) => o.text.length > 0)
      return { ...base, estado: 'modificado' as const, ops }
    }
    if (a.status === 'added') {
      return {
        ...base, estado: 'añadido' as const,
        body: art.body.slice(0, MAX_ADDED_BODY),
        truncado: art.body.length > MAX_ADDED_BODY,
      }
    }
    return { ...base, estado: 'eliminado' as const }
  })

  return jsonOk({
    idNorma, from, to,
    resumen: {
      modificados: cambios.filter((c) => c.estado === 'modificado').length,
      'añadidos': cambios.filter((c) => c.estado === 'añadido').length,
      eliminados: cambios.filter((c) => c.estado === 'eliminado').length,
    },
    cambios,
  }, 300, req)
})
