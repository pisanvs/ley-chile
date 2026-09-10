import { createHash } from 'node:crypto'
import { verifyApiKey } from './apikey'
import { recordUsage } from './apiusage'
import { gzipJson } from './jsonz'

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
 *  header and must not be stored by a shared cache.
 *
 *  An ETag is attached only when `cacheSeconds > 0` — that scopes it to
 *  exactly the cacheable reads (norma, article, version) the spec names, and
 *  leaves uncacheable responses like /v1/search without one. When `req`
 *  carries a matching `If-None-Match`, the body is dropped and a 304 is
 *  returned instead — still routed through the caller's normal usage
 *  recording, since this is a Response like any other. */
export function jsonOk(body: unknown, cacheSeconds = 0, req?: Request): Response {
  const json = JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cacheSeconds > 0) {
    headers['cache-control'] = `private, max-age=${cacheSeconds}`
    // The ETag is computed over the SERIALIZED body, before any compression, so
    // it identifies the resource rather than a particular encoding of it. A
    // client that switches Accept-Encoding still gets its 304.
    const etag = `"${createHash('sha256').update(json).digest('hex').slice(0, 32)}"`
    headers['etag'] = etag
    if (req?.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers })
    }
  }
  // Route handlers returning their own Response bypass Next's compression, so
  // every /v1 payload shipped uncompressed. Article bodies and repeated legal
  // titles compress well; small responses fall through untouched.
  return gzipJson(req, json, { status: 200, headers })
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

    let key
    try {
      key = await verifyApiKey(m[1])
    } catch (err) {
      console.error(`[api] ${endpoint} auth lookup failed:`, err)
      return apiError(503, 'service_unavailable', 'The service is temporarily unavailable.')
    }
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
