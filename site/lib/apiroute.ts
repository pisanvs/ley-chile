import { verifyApiKey } from './apikey'
import { recordUsage } from './apiusage'

export type RouteCtx = { params: Promise<Record<string, string>> }
export type ApiHandler = (req: Request, ctx: RouteCtx) => Promise<Response>

/** Handler-thrown signals the wrapper maps to status codes, so route handlers
 *  return data or throw meaning, and never assemble error responses. */
export class NotFound extends Error {}
export class BadRequest extends Error {}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

/** `private`, never `public`: these responses sit behind an Authorization
 *  header and must not be stored by a shared cache. */
export function jsonOk(body: unknown, cacheSeconds = 0): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cacheSeconds > 0) headers['cache-control'] = `private, max-age=${cacheSeconds}`
  return new Response(JSON.stringify(body), { status: 200, headers })
}

/** Authenticate, time, record, and normalise errors for one endpoint.
 *
 *  `endpoint` MUST be the route template ('/v1/normas/{idNorma}'), because it
 *  is what gets logged — see lib/apiusage.ts.
 *
 *  An unrecognised throw becomes 503, not 200-with-nothing. On 2026-09-07 a
 *  dependency failure was reported as an empty successful result and a total
 *  outage looked, to monitoring, like a wall of healthy 200s. */
export function withApiKey(endpoint: string, handler: ApiHandler) {
  return async (req: Request, ctx: RouteCtx): Promise<Response> => {
    const started = Date.now()
    const auth = req.headers.get('authorization') ?? ''
    const m = /^Bearer\s+(\S+)$/i.exec(auth)
    if (!m) {
      return apiError(401, 'missing_api_key',
        'Provide an API key as: Authorization: Bearer lc_live_…')
    }

    const key = await verifyApiKey(m[1])
    if (!key) {
      return apiError(401, 'invalid_api_key', 'The API key is unknown or has been revoked.')
    }

    let res: Response
    try {
      res = await handler(req, ctx)
    } catch (err) {
      if (err instanceof NotFound) {
        res = apiError(404, 'not_found', err.message)
      } else if (err instanceof BadRequest) {
        res = apiError(400, 'bad_request', err.message)
      } else {
        console.error(`[api] ${endpoint} failed:`, err)
        res = apiError(503, 'service_unavailable', 'The service is temporarily unavailable.')
      }
    }

    // Dispatched, not awaited: recording must add no latency. The site runs a
    // single persistent Node replica, so the insert completes after the
    // response is sent. `.catch` because recordUsage's own guard could still be
    // bypassed by a rejection at dispatch time.
    void recordUsage(key.id, endpoint, res.status, Date.now() - started)
      .catch((e) => console.error('[api] usage dispatch failed:', e))

    return res
  }
}
