/**
 * The canonical public origin — the single source of truth for every absolute
 * URL the app emits: canonicals, JSON-LD `url`, the sitemap, llms.txt and the
 * MCP endpoint.
 *
 * Hardcode the real domain as the default. This used to fall back to a
 * placeholder (`leychile.dev`) carried over from the design doc, which meant a
 * missing SITE_URL would silently publish canonical + sitemap URLs pointing at
 * a domain we don't own — the kind of thing that only surfaces once Google has
 * indexed it. `SITE_URL` still overrides for previews/local.
 */
export const SITE = (process.env.SITE_URL ?? 'https://leyes.pisanvs.cl').replace(/\/$/, '')

/** The remote MCP endpoint. Agents connect here; see /llms.txt. */
export const MCP_PATH = '/api/mcp'
