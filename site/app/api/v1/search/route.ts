import { runSearch } from '@/lib/search'
import { getNormasByKey, getOrganismosByIds } from '@/lib/norma'
import { withApiKey, jsonOk, BadRequest } from '@/lib/apiroute'

const MAX_LIMIT = 100
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

interface Result {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  organismo: string
}

/** Search the corpus, either by free text (`q`) or by citation
 *  (`tipo` + `numero`).
 *
 *  A citation returns EVERY candidate rather than a best guess: (tipo, numero)
 *  is not unique — there are many "DFL 1", one per organismo — and picking one
 *  silently is how /ley/20780 once resolved to an unrelated decreto. Callers
 *  disambiguate on `idNorma`, which is unique. */
export const GET = withApiKey('/v1/search', async (req) => {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const tipo = url.searchParams.get('tipo')?.trim() ?? ''
  const numero = url.searchParams.get('numero')?.trim() ?? ''
  const asOf = url.searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10)

  if (!FECHA_RE.test(asOf)) {
    throw new BadRequest(`asOf must be YYYY-MM-DD, got "${asOf}"`)
  }

  const rawLimit = Number(url.searchParams.get('limit') ?? 20)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : 20

  let resultados: Result[]

  if (tipo && numero) {
    const normas = await getNormasByKey(tipo, numero)
    resultados = normas.slice(0, limit).map((n) => ({
      idNorma: n.idNorma, tipo: n.tipo, numero: n.numero,
      titulo: n.titulo, organismo: n.organismo,
    }))
  } else if (q.length >= 1) {
    const hits = await runSearch(q, asOf, limit)
    const orgs = await getOrganismosByIds(hits.map((h) => h.idNorma))
    resultados = hits.map((h) => ({
      idNorma: h.idNorma, tipo: h.tipo, numero: h.numero,
      titulo: h.titulo, organismo: orgs.get(h.idNorma) ?? '',
    }))
  } else {
    throw new BadRequest(
      'Provide q for free-text search, or tipo and numero for a citation.',
    )
  }

  return jsonOk({ query: q || `${tipo} ${numero}`.trim(), asOf, total: resultados.length, resultados })
})
