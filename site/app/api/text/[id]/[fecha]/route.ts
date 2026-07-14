import { getArticlesAsOf } from '@/lib/norma'

/** Reconstructs a version's markdown text (as of `fecha`) from articulo_span —
 *  the SSR replacement for fetching texto.md from GitHub raw. The shape mirrors
 *  content_text(): "{rawHeading}\n{body}" per article, blank-line separated, so
 *  it round-trips through segment(). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; fecha: string }> },
) {
  const { id, fecha } = await ctx.params
  const idNorma = Number(id)
  if (!Number.isFinite(idNorma)) return new Response('bad id', { status: 400 })

  const articles = await getArticlesAsOf(idNorma, fecha)
  const md = articles
    .map((a) => (a.rawHeading ? `${a.rawHeading}\n${a.body}` : a.body))
    .join('\n\n')

  return new Response(md, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
