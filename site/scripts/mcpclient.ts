/**
 * Minimal MCP client over Streamable HTTP, for probing a deployed server.
 *
 * Dependency-free on purpose: the probe suite exists to tell us the truth about
 * what the live endpoint does, and an SDK sitting between us and the wire is
 * one more thing that could be normalising away the very defect we are hunting.
 * The server answers a bare stateless `tools/call` — no session handshake — so
 * this is a POST and one SSE frame.
 */

export interface McpResult {
  /** Concatenated text content of the response. */
  text: string
  /** True when the server flagged the call as an error rather than a result. */
  isError: boolean
  /** Milliseconds on the wire. */
  ms: number
}

/** Pace outbound calls so a long sweep stays a polite neighbour to production. */
export class RateLimiter {
  private next = 0
  constructor(private readonly minIntervalMs: number) {}

  static perSecond(rps: number): RateLimiter {
    return new RateLimiter(rps > 0 ? 1000 / rps : 0)
  }

  async take(): Promise<void> {
    const now = Date.now()
    const at = Math.max(now, this.next)
    this.next = at + this.minIntervalMs
    if (at > now) await new Promise((r) => setTimeout(r, at - now))
  }
}

/** Pull the JSON payloads out of an SSE body. */
export function parseSse(body: string): unknown[] {
  const out: unknown[] = []
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('data:')) continue
    const payload = t.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      out.push(JSON.parse(payload))
    } catch {
      // A frame we cannot parse is itself a finding; surface it as text rather
      // than throwing, so one malformed response does not end a whole sweep.
      out.push({ __unparseable: payload })
    }
  }
  return out
}

/** Flatten an MCP tool result into the text a model would actually read. */
export function resultText(msg: any): { text: string; isError: boolean } {
  if (msg?.error) {
    return { text: `JSONRPC ERROR ${msg.error.code}: ${msg.error.message}`, isError: true }
  }
  const content = msg?.result?.content
  if (!Array.isArray(content)) {
    return { text: JSON.stringify(msg?.result ?? msg ?? null), isError: false }
  }
  const text = content
    .map((c: any) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
    .join('\n')
  return { text, isError: Boolean(msg.result?.isError) }
}

export class McpClient {
  private id = 0

  constructor(
    private readonly endpoint: string,
    private readonly limiter = RateLimiter.perSecond(5),
    private readonly timeoutMs = 60_000,
  ) {}

  async call(name: string, args: Record<string, unknown>): Promise<McpResult> {
    await this.limiter.take()
    const started = Date.now()
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs)
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++this.id,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      })
      const body = await res.text()
      const ms = Date.now() - started
      if (!res.ok) {
        return { text: `HTTP ${res.status}: ${body.slice(0, 400)}`, isError: true, ms }
      }
      const frames = parseSse(body)
      if (frames.length === 0) {
        // Not SSE after all — some deployments answer application/json.
        try {
          return { ...resultText(JSON.parse(body)), ms }
        } catch {
          return { text: `UNPARSEABLE BODY: ${body.slice(0, 400)}`, isError: true, ms }
        }
      }
      return { ...resultText(frames[frames.length - 1]), ms }
    } catch (e) {
      return {
        text: `TRANSPORT ERROR: ${(e as Error).message}`,
        isError: true,
        ms: Date.now() - started,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
