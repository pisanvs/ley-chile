import { getArticlesAsOf, getNormaById, getVersions } from '@/lib/norma'
import { parseIdNorma } from '@/lib/apiparams'
import { BadRequest } from '@/lib/apiroute'
import { checkFecha, coverage, notYetInForce } from '@/lib/mcpguards'

/** Reconstructs a version's markdown text (as of `fecha`) from articulo_span —
 *  the SSR replacement for fetching texto.md from GitHub raw.
 *
 *  Headings get a `#### ` prefix. Segmentation stores the REWRITTEN heading
 *  ("Artículo 1º") with the `####` stripped, but the reader re-segments this
 *  text with segment(), which needs the `#### ` marker (`_MD_HEADING_RE`) to
 *  split into articles. Without it segment() returns one `__doc__` blob and the
 *  redline word-diffs the whole document instead of aligning per article.
 *
 *  THE BODY IS PURE MARKDOWN AND MUST STAY THAT WAY. Anything prepended before
 *  the first `#### ` heading is not inert: segment() emits it as a
 *  `__preamble__` segment, so a banner would show up as a phantom article in
 *  the Outline, in the redline, and in every blame computation (lib/blame.ts
 *  fetches this route once per commit). Out-of-band signals therefore go in
 *  HTTP headers — see `X-Corpus-Horizon` below.
 *
 *  `fecha` used to be passed straight into `$2::date` with no validation, which
 *  handed the interpretation to Postgres's DateStyle — MDY in production. So
 *  `/api/text/207436/01-06-2024`, which a Chilean lawyer writes meaning 1 June,
 *  silently resolved to 6 January and returned a different text of the Código
 *  del Trabajo (698,235 bytes instead of 708,079), while `13-09-2024` was a
 *  bare 500. This route is the permalink `get_raw_link` advertises as "estable:
 *  (norma, fecha) siempre devuelve el mismo texto", so a date it cannot read
 *  unambiguously has to be refused, not guessed. */

const TODAY = () => new Date().toISOString().slice(0, 10)

function text(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...extra },
  })
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; fecha: string }> },
) {
  const { id, fecha } = await ctx.params

  // Both validators already exist; neither is re-implemented here.
  //
  // `parseIdNorma` throws BadRequest, which the /v1 routes let withApiKey turn
  // into a 400. This route is not wrapped by withApiKey, so the throw is caught
  // and mapped here — one try/catch is cheaper than a second parser.
  //
  // `checkFecha` returns a result object, which is the shape that fits a route
  // that assembles its own Responses. It is also the *same* guard the MCP tools
  // apply to the same (norma, fecha) pair, and its message already names the
  // exact failure this bug is about: that DD-MM-YYYY is ambiguous, with the ISO
  // spelling to use instead. Sharing it keeps the advertised permalink and the
  // tool that advertises it from disagreeing about what a valid fecha is.
  let idNorma: number
  try {
    idNorma = parseIdNorma(id)
  } catch (e) {
    if (!(e instanceof BadRequest)) throw e
    return text(400, e.message)
  }

  const checked = checkFecha(fecha)
  if (!checked.ok) return text(400, checked.message)
  const at = checked.value

  // The version series is needed to tell "no text" apart from "no norma" and to
  // place the date against the corpus horizon. Issued alongside the text query
  // rather than before it, so the common case costs one round trip, not two.
  const [versions, articles] = await Promise.all([
    getVersions(idNorma),
    getArticlesAsOf(idNorma, at),
  ])
  const today = TODAY()
  const cov = coverage(versions, at, today)

  // An empty body with status 200 is the failure this endpoint is being fixed
  // for: /api/text/999999999/2024-01-01 and a pre-enactment date both answered
  // "here is the text, it is zero bytes long", which a caller cannot tell from
  // a law that genuinely says nothing. Every miss is a 404 that says which kind
  // of miss it is.
  if (articles.length === 0) return text(404, await missMessage(idNorma, at, cov, versions))

  const md = articles
    .map((a) => (a.rawHeading ? `#### ${a.rawHeading}\n${a.body}` : a.body))
    .join('\n\n')

  // Where the answer sits relative to what the corpus knows, as a header rather
  // than as body text, for the reason given at the top: the body is markdown
  // that gets re-segmented and word-diffed. Always emitted, so `state=covered`
  // is a positive assertion and a caller can distinguish it from an old deploy
  // that sends no header at all.
  //
  // `state=future` is the extrapolation signal: the last version of a live
  // norma carries `hasta: null`, which stretches to any date asked of it, so
  // 2030 is answered from text that predates it. mcpguards' futureWarning()
  // says exactly this in prose, but it cannot be reused here — it opens with
  // "⚠" (U+26A0), and a header value is a ByteString, so setting it throws
  // outright — and it cannot go in the body without becoming a phantom
  // article. The fields below carry the same facts in a parseable form.
  const horizon =
    cov.kind === 'future'
      ? `state=future; fecha=${at}; today=${today}; last-version=${cov.last.desde}; extrapolation`
      : cov.kind === 'covered'
        ? `state=covered; fecha=${at}; today=${today}; version=${cov.version.desde}`
        : `state=${cov.kind}; fecha=${at}; today=${today}`

  return text(200, md, { 'x-corpus-horizon': horizon })
}

/** Why there is no text, in the caller's terms. */
async function missMessage(
  idNorma: number,
  fecha: string,
  cov: ReturnType<typeof coverage>,
  versions: { desde: string; hasta: string | null }[],
): Promise<string> {
  if (cov.kind === 'empty') {
    const norma = await getNormaById(idNorma)
    return norma
      ? `${norma.tipo.toUpperCase()} ${norma.numero} (idNorma ${idNorma}) está en el corpus ` +
        'pero no tiene ninguna versión con texto importada, así que no hay fecha que ' +
        'devuelva contenido.'
      : `No existe ninguna norma con idNorma ${idNorma} en el corpus. Los enlaces de esta ` +
        'API se direccionan por idNorma de BCN, no por número de ley.'
  }

  // `before` is also what coverage() reports for a date that falls after the
  // last CLOSED version of a derogated norma — the date is not covered and it
  // is not in the future — so notYetInForce, which says "su primera versión
  // rige desde …", is only correct when the date really does precede the first
  // version. The other shapes fall through to the range answer below.
  if (cov.kind === 'before' && fecha < cov.first.desde) {
    const norma = await getNormaById(idNorma)
    // 404 rather than 200-with-a-note: a text that did not exist yet is a
    // missing resource, it is what the reader page at /norma/{id}/{slug}/{fecha}
    // already returns for the same date, and fetchRawText() only inspects
    // res.ok — a 200 carrying an explanation would be rendered as the law.
    if (norma) return notYetInForce(norma, cov.first, fecha)
    return (
      `idNorma ${idNorma} no estaba vigente al ${fecha}: su primera versión en el corpus ` +
      `rige desde el ${cov.first.desde}.`
    )
  }

  const first = versions[0]
  const last = versions[versions.length - 1]
  const range = first ? ` El corpus tiene ${versions.length} versión(es), de ${first.desde} a ` +
    `${last.hasta ?? 'vigente'}.` : ''
  return (
    `No hay texto vigente al ${fecha} para idNorma ${idNorma}.${range} ` +
    `Usa /api/idx/commits/${idNorma} para ver las fechas con texto.`
  )
}
