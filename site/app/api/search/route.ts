import { runSearch } from '@/lib/search'

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
    const hits = (await runSearch(q, asOf, 12)).map((h) => ({
      idNorma: h.idNorma, tipo: h.tipo, numero: h.numero, titulo: h.titulo,
    }))
    return Response.json({ hits })
  } catch {
    return Response.json({ hits: [] }, { status: 200 })
  }
}
