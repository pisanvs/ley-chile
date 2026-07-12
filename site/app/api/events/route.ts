import { recordEvent } from '@/lib/analytics'

export async function POST(req: Request) {
  const body = await req.json()
  if (body.kind !== 'result_click' || typeof body.idNorma !== 'number') {
    return new Response('bad request', { status: 400 })
  }
  recordEvent({ kind: 'result_click', idNorma: body.idNorma, clickedRank: body.clickedRank })
  return new Response(null, { status: 204 })
}
