import { revalidateTag } from 'next/cache'

export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.REVALIDATE_TOKEN}`) {
    return new Response('unauthorized', { status: 401 })
  }
  const { idNormas } = await req.json()
  if (!Array.isArray(idNormas)) return new Response('bad request', { status: 400 })

  // stale-while-revalidate: this is not read-your-writes, so revalidateTag,
  // not updateTag.
  for (const id of idNormas) revalidateTag(`norma:${id}`, 'max')
  return Response.json({ revalidated: idNormas.length })
}
