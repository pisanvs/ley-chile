import { needsColdPath, searchCold, searchHot } from '@/lib/search'

/** Lightweight JSON search endpoint for the ⌘K command palette. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const asOf = url.searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10)
  if (q.length < 2) return Response.json({ hits: [] })

  try {
    const hot = await searchHot(q, asOf)
    const cold = needsColdPath(hot.length) ? await searchCold(q, asOf) : []
    // Dedupe by norma so the palette shows one row per law.
    const seen = new Set<number>()
    const hits = [...hot, ...cold]
      .filter((h) => (seen.has(h.idNorma) ? false : (seen.add(h.idNorma), true)))
      .slice(0, 12)
      .map((h) => ({ idNorma: h.idNorma, tipo: h.tipo, numero: h.numero, titulo: h.titulo }))
    return Response.json({ hits })
  } catch {
    return Response.json({ hits: [] }, { status: 200 })
  }
}
