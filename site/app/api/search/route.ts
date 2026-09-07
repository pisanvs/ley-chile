import { runSearchDetailed } from '@/lib/search'

/** Lightweight JSON search endpoint for the ⌘K command palette. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const asOf = url.searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10)
  if (q.length < 2) return Response.json({ hits: [] })

  try {
    // Number matches first, then full text — the single ranked path shared with
    // /buscar and the MCP tool. Typing a law number surfaces that law, not
    // whatever body happens to mention the number.
    const { hits, degraded } = await runSearchDetailed(q, asOf, 12)
    return Response.json({
      hits: hits.map((h) => ({
        idNorma: h.idNorma, tipo: h.tipo, numero: h.numero, titulo: h.titulo,
      })),
      degraded,
    })
  } catch (err) {
    // Never answer a broken search with `{hits: []}` and a 200. That is how a
    // total outage — Meilisearch gone, taking the two Postgres tiers with it —
    // presented to users as "no results found" and to monitoring as a wall of
    // healthy 200s. A dependency failure is a 503 and says so.
    console.error('[api/search] search failed:', err)
    return Response.json({ error: 'search_unavailable' }, { status: 503 })
  }
}
