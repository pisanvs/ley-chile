import { getEfectos } from '@/lib/efectos'

/** What a modificatoria changed, law by law — backing the reader's "Efectos"
 *  tab. `id` is the modifier's idNorma. Empty `efectos` means the law amended
 *  nothing (it is not a modificatoria, or its changes produced no article-level
 *  diff). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const modifierId = Number(id)
  if (!Number.isFinite(modifierId)) return Response.json({ efectos: [], truncated: false })

  try {
    return Response.json(await getEfectos(modifierId))
  } catch {
    return Response.json({ efectos: [], truncated: false }, { status: 200 })
  }
}
