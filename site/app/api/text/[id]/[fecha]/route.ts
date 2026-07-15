import { getArticlesAsOf } from '@/lib/norma'

/** Reconstructs a version's markdown text (as of `fecha`) from articulo_span —
 *  the SSR replacement for fetching texto.md from GitHub raw.
 *
 *  Headings get a `#### ` prefix. Segmentation stores the REWRITTEN heading
 *  ("Artículo 1º") with the `####` stripped, but the reader re-segments this
 *  text with segment(), which needs the `#### ` marker (`_MD_HEADING_RE`) to
 *  split into articles. Without it segment() returns one `__doc__` blob and the
 *  redline word-diffs the whole document instead of aligning per article. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; fecha: string }> },
) {
  const { id, fecha } = await ctx.params
  const idNorma = Number(id)
  if (!Number.isFinite(idNorma)) return new Response('bad id', { status: 400 })

  const articles = await getArticlesAsOf(idNorma, fecha)
  const md = articles
    .map((a) => (a.rawHeading ? `#### ${a.rawHeading}\n${a.body}` : a.body))
    .join('\n\n')

  return new Response(md, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
