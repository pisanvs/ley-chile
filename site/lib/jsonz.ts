import { gzipSync } from 'node:zlib'

/**
 * gzip for JSON route handlers.
 *
 * Next compresses the HTML it renders, but a route handler that returns its own
 * `Response` bypasses that entirely — measured against production, every JSON
 * route on this site shipped uncompressed while `/api` (HTML) came back gzipped:
 *
 *   /api/idx/titles          1.2 MB   uncompressed
 *   /api/idx/by-year/2022    4.6 MB   uncompressed
 *   /api/idx/landing          28 KB   uncompressed
 *   /api/v1/openapi.json      17 KB   uncompressed
 *
 * Legal titles repeat heavily, so these compress extremely well. `titles` and
 * `by-year` are on the landing page's own critical path, which makes this the
 * cheapest available win on page weight.
 */

/** Below roughly one MTU there is nothing to win, and the CPU and the
 *  `Vary` cache split both cost more than the bytes saved. */
const MIN_GZIP_BYTES = 1400

/** Serialize, and gzip when the client accepts it and the body is big enough.
 *
 *  `gzipSync` blocks the event loop — ~100-200 ms for the 4.6 MB worst case —
 *  which is acceptable only because every caller sets a cache header, so this
 *  runs once per cache period rather than once per request. A route without
 *  caching should not use this for large bodies. */
export function gzipJson(
  req: Request | undefined,
  json: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')

  const accepts = (req?.headers.get('accept-encoding') ?? '').toLowerCase().includes('gzip')
  if (!accepts || Buffer.byteLength(json) < MIN_GZIP_BYTES) {
    return new Response(json, { status: init.status ?? 200, headers })
  }

  headers.set('content-encoding', 'gzip')
  // Append rather than overwrite: Next already sets Vary on some responses, and
  // clobbering it would break its router caching.
  const existing = headers.get('vary')
  headers.set(
    'vary',
    existing && !existing.toLowerCase().includes('accept-encoding')
      ? `${existing}, Accept-Encoding`
      : existing ?? 'Accept-Encoding',
  )
  return new Response(gzipSync(json), { status: init.status ?? 200, headers })
}

/** Convenience wrapper for handlers that have an object rather than a string. */
export function jsonz(
  req: Request | undefined,
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return gzipJson(req, JSON.stringify(body), init)
}
