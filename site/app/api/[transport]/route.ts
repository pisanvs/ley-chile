import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import {
  currentFecha, getArticlesAsOf, getAvisos, getCausaNormas, getModifiedBy, getModifies,
  getNormaById, getNormasByKey, getOrganismosByIds, getRefundido, getVersions,
  type Article, type Avisos, type Norma, type RefundidoLink,
} from '@/lib/norma'
import { runSearch, searchArticles } from '@/lib/search'
import { align, joinDiffText, wordDiff } from '@/lib/diff'
import { SITE } from '@/lib/jsonld'
import { canonicalHref } from '@/lib/href'
import { sortAvisos } from '@/lib/avisos'
import {
  availableLabels, causaLabel, checkFecha, checkOffset, checkRange, coverage, futureWarning,
  matchArticle, noReachableVersion, notYetInForce, paginate, truncationNotice, versionAt,
} from '@/lib/mcpguards'
import { vigenciaWarnings } from '@/lib/vigencia'
import { deferredVigenciaWarning, incompleteHistoryWarning } from '@/lib/corpus'

/**
 * Remote MCP server over the Chilean legal corpus — "para agentes y humanos".
 * Endpoint: {SITE}/api/mcp (Streamable HTTP). Read-only; no auth, no writes.
 *
 * Output is deliberately capped: a single law can be ~350 KB of text, which
 * would blow an agent's context. `get_law` returns metadata + an article index;
 * article bodies come one at a time via `get_article`.
 */

const TODAY = () => new Date().toISOString().slice(0, 10)
const MAX_BODY = 12_000       // chars of a single article body
const MAX_DIFF = 16_000       // chars of a rendered diff

/** Render a long body as one window plus, when anything was withheld, a
 *  machine-readable line saying exactly what and how to ask for it. The notice
 *  leads rather than trails: a caller that hit its own context limit mid-read
 *  still sees that the body is partial. */
function windowed(
  s: string, limit: number, offset = 0, rawUrl?: string,
): { text: string; page: ReturnType<typeof paginate> } {
  const page = paginate(s, limit, offset)
  const notice = truncationNotice(page, rawUrl)
  return { text: notice ? `${notice}\n\n${page.body}` : page.body, page }
}

/** The always-complete, never-truncated form of a norma's text at a date. */
function rawTextUrl(idNorma: number, fecha: string): string {
  return `${SITE}/api/text/${idNorma}/${fecha}`
}

const OFFSET_PARAM = z.number().int().min(0).optional().describe(
  'Carácter desde el que continuar, para leer un texto que vino truncado. Pásale el ' +
  'valor `fin=` que aparece en la línea [TRUNCADO] de la respuesta anterior. Por defecto 0.',
)

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] }
}

function lawUrl(
  n: { idNorma: number; tipo: string; numero: string; titulo: string },
  fecha?: string,
) {
  return canonicalHref(n, fecha, undefined, SITE)
}

/** One line identifying a norma unambiguously: organismo and año distinguish
 *  same-key siblings, idNorma is the stable handle to pass back in. */
function normaIdLine(n: Norma): string {
  const org = n.organismo ? ` · ${n.organismo}` : ''
  const pub = n.fechaPublicacion ? ` · publicada ${n.fechaPublicacion}` : ''
  return `- ${n.tipo.toUpperCase()} ${n.numero}${org} — ${n.titulo}\n  idNorma: ${n.idNorma}${pub}`
}

/** Full identity of the norma a response is actually about.
 *
 *  Every article- or version-level answer leads with this. An answer drawn from
 *  the wrong norma used to be invisible — asking for "DFL 4" and getting an
 *  article about política *energética* from the Ley de Servicios Eléctricos
 *  reads as a plausible hit unless the norma is named outright. */
function identityLine(n: Norma): string {
  const org = n.organismo ? ` · ${n.organismo}` : ''
  const year = n.fechaPublicacion ? ` · ${n.fechaPublicacion.slice(0, 4)}` : ''
  return `${n.tipo.toUpperCase()} ${n.numero}${org}${year} · idNorma ${n.idNorma}`
}

// Counts are the live ones (get_law reports the same figures) — an agent that
// sees "79 DFL 4" here and "75" in the next response learns to distrust both.
const ID_NORMA_PARAM = z.number().int().optional().describe(
  'idNorma exacto — el identificador único de LeyChile. Necesario cuando varias normas ' +
  'comparten (tipo, número), que es el caso de más del 90% del corpus: hay 75 "DFL 4", ' +
  '227 "DFL 1" y 525 "DTO 1", de distintos organismos y años. Obtenlo de search_laws o ' +
  'de la lista que devuelven estas herramientas cuando la clave es ambigua.',
)

const AMBIGUITY_NOTE =
  '(tipo, número) NO identifica una norma chilena: si la clave es ambigua, esta ' +
  'herramienta devuelve la lista de candidatas en vez de adivinar. Pasa `idNorma` para ' +
  'elegir una.'

// Stated in every date parameter's description, enforced in the handler rather
// than as a zod `.regex()`. A schema violation surfaces as a terse protocol
// error; `checkFecha` returns prose that names the ambiguity and shows the
// correct spelling, which is the whole point for the input that caused this —
// "03-09-2024", where a bare "invalid format" leaves the caller guessing.
const ISO_HELP =
  'Fecha en ISO 8601 estricto (YYYY-MM-DD), ej. "2024-09-03". DD-MM-YYYY se rechaza ' +
  'por ambiguo.'

/** Warnings that must lead a response, before any article text.
 *
 *  This is the guardrail for the failure that prompted all of this: asked for a
 *  law whose text had been recast, a model fell back to the pre-refundido base
 *  and assumed the differences were small. They are not — a refundido RENUMBERS
 *  articles, so the answer came out with confident, wrong article numbers and
 *  cross-references. LeyChile publishes both the refundido relation and its own
 *  numbering observations; the corpus was throwing all of it away. */
function avisoLines(
  avisos: Avisos,
  refundido: { refunde: RefundidoLink[]; refundidaEn: RefundidoLink[] },
): string[] {
  const out: string[] = []
  for (const r of refundido.refundidaEn) {
    const org = r.organismo ? ` · ${r.organismo}` : ''
    const year = r.fechaPublicacion ? ` · ${r.fechaPublicacion.slice(0, 4)}` : ''
    out.push(
      `⚠ TEXTO REFUNDIDO: el texto vigente está refundido en ${r.tipo.toUpperCase()} ` +
      `${r.numero}${org}${year} (idNorma ${r.idNorma}). Un refundido RENUMERA los ` +
      'artículos: cita los números desde esa norma, no desde ésta.',
    )
  }
  if (refundido.refunde.length) {
    out.push(
      'Refunde: ' +
      refundido.refunde
        .map((r) => `${r.tipo.toUpperCase()} ${r.numero} (idNorma ${r.idNorma})`)
        .join(', '),
    )
  }
  if (avisos.dobleArticulado) {
    out.push(
      '⚠ DOBLE ARTICULADO: esta norma tiene dos series de artículos; una etiqueta ' +
      'como "Artículo 1" puede ser ambigua.',
    )
  }
  // Only numbering notes get the warning marker. 55% of normas carry an
  // observación but 99.7% are document-type noise ("EXTRACTO"); flagging all of
  // them would teach a model to ignore the marker entirely.
  const { numbering, notes } = sortAvisos(avisos.observaciones)
  for (const o of numbering) {
    out.push(`⚠ NUMERACIÓN (LeyChile): ${o}`)
  }
  if (notes.length) {
    // Still worth stating: "EXTRACTO" means the published text is partial.
    out.push(`Nota de LeyChile: ${notes.join(' · ')}`)
  }
  // Only when the typed edge is missing: the raw field is tipo-numero text that
  // cannot be resolved, so it is strictly worse than the relation above.
  if (avisos.refundidoPor && refundido.refundidaEn.length === 0) {
    out.push(`Refundido por (texto de LeyChile, sin idNorma): ${avisos.refundidoPor}`)
  }
  return out
}

type Resolution =
  | { ok: true; norma: Norma }
  | { ok: false; message: string }

/** Resolve to exactly one norma, or refuse.
 *
 *  This is the whole fix. (tipo, numero) addresses 91.7% of the corpus
 *  ambiguously, and every tool here except get_law used to paper over that by
 *  silently taking the first match under a "most reformed, tie → lowest
 *  idNorma" rule — deterministic, but with no legal meaning whatsoever. That is
 *  how a request for the Ley Orgánica Constitucional de Partidos Políticos
 *  (DFL 4 de Segpres, 2017) was answered with the Ley General de Servicios
 *  Eléctricos (DFL 4 de Economía, 2007), confidently and without a warning.
 *
 *  Ambiguity is now a refusal carrying the candidate list, not a guess. */
async function resolveNorma(
  tipo: string, numero: string, idNorma?: number,
): Promise<Resolution> {
  if (idNorma !== undefined) {
    const n = await getNormaById(idNorma)
    return n
      ? { ok: true, norma: n }
      : { ok: false, message: `No se encontró una norma con idNorma ${idNorma}.` }
  }
  const matches = await getNormasByKey(tipo, numero)
  if (matches.length === 0) return { ok: false, message: `No se encontró ${tipo} ${numero}.` }
  if (matches.length === 1) return { ok: true, norma: matches[0] }

  // Some keys collide heavily (dto 1 → 541), so cap the list; ordered
  // most-reformed first, and search_laws is the way to narrow by text.
  const CAP = 30
  const shown = matches.slice(0, CAP)
  const rest = matches.length - shown.length
  return {
    ok: false,
    message: [
      `Hay ${matches.length} normas con clave ${tipo.toUpperCase()} ${numero}, distinguibles ` +
        'por organismo y año. (tipo, número) no identifica una norma chilena — LeyChile usa ' +
        'idNorma. Vuelve a llamar con el idNorma deseado' +
        (rest > 0 ? ' (o usa search_laws para acotar por texto)' : '') + ':',
      '',
      ...shown.map(normaIdLine),
      rest > 0 ? `\n…y ${rest} más (ordenadas de más a menos reformada).` : '',
    ].filter(Boolean).join('\n'),
  }
}

/** Validate every date argument a tool received, or hand back the first
 *  complaint. Dates reach these tools as free-form strings from a model, and an
 *  unvalidated one is worse than a refusal: `03-09-2024` used to resolve to
 *  3 September and be echoed back as if the caller had asked for it. */
function checkFechas(
  args: Record<string, string | undefined>,
): { ok: true } | { ok: false; message: string } {
  for (const [param, raw] of Object.entries(args)) {
    if (raw === undefined) continue
    const r = checkFecha(raw, param)
    if (!r.ok) return r
  }
  return { ok: true }
}

/** What the corpus knows about its own gaps, for one norma.
 *
 *  Both warnings are about the ANSWER's trustworthiness rather than its
 *  content, so they lead. A history missing a third of its versions answers a
 *  dated query from the wrong version and looks identical to a complete one —
 *  measured corpus-wide, 54% of known version records are never served. Saying
 *  so is the difference between a tool that knows its own limits and one that
 *  does not. */
function corpusCaveats(idNorma: number, servedVersions: number): string[] {
  return [
    incompleteHistoryWarning(idNorma, servedVersions),
    deferredVigenciaWarning(idNorma),
  ].filter((w): w is string => w !== null).map((w) => `${w}\n`)
}

/** Shared preamble for an answer about a norma at a date the corpus cannot
 *  vouch for. Returns the lines to lead with, or null when the date is covered.
 *
 *  `before` is a refusal — there is no text to show and the honest answer is
 *  about the *norma*, not the article. `future` is a warning: the last known
 *  text is still the best available answer, it just isn't a record. */
function horizonLines(cov: ReturnType<typeof coverage>, fecha: string, today: string): string[] {
  // One element, trailing newline rather than an empty second element: some
  // callers below run the array through `.filter(Boolean)`, which would drop a
  // bare '' separator and glue the warning to the title.
  return cov.kind === 'future' ? [`${futureWarning(cov.last, fecha, today)}\n`] : []
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'search_laws',
      {
        title: 'Buscar leyes',
        description:
          'Busca en el corpus jurídico chileno completo (leyes, decretos, códigos, resoluciones) ' +
          'por texto libre. Devuelve normas coincidentes con su tipo, número y título. ' +
          'Usa `asOf` para buscar el texto vigente en una fecha histórica (YYYY-MM-DD).',
        inputSchema: {
          query: z.string().min(2).describe('Términos de búsqueda, ej. "arrendamiento" o "medio ambiente"'),
          asOf: z.string().optional().describe(ISO_HELP + ' Por defecto hoy (texto vigente).'),
        },
      },
      async ({ query, asOf }) => {
        const fechas = checkFechas({ asOf })
        if (!fechas.ok) return text(fechas.message)
        const fecha = asOf ?? TODAY()
        // Number matches first, then full text. An agent asking for "20000"
        // gets ley 20.000, not a law that merely cites the figure.
        const hits = await runSearch(query, fecha, 20)
        if (hits.length === 0) return text(`Sin resultados para "${query}" (vigente al ${fecha}).`)
        // Same (tipo, numero) can appear more than once (e.g. several "DFL 1",
        // one per organismo). Enrich with organismo + idNorma so an agent can
        // tell them apart and address a specific one via idNorma.
        //
        // The URL is canonical (/norma/{id}/{slug}), which is the link that was
        // actively causing wrong answers: this tool returned the correct
        // idNorma next to a /{tipo}/{numero} URL that resolved to a *different*
        // norma, and models followed the link rather than the id.
        const orgs = await getOrganismosByIds(hits.map((h) => h.idNorma))
        const lines = hits.map((h) => {
          const org = orgs.get(h.idNorma)
          return `- ${h.tipo.toUpperCase()} ${h.numero}${org ? ` · ${org}` : ''} — ${h.titulo}\n  idNorma: ${h.idNorma} · ${lawUrl(h)}`
        })
        return text(`${hits.length} resultados para "${query}" (vigente al ${fecha}):\n\n${lines.join('\n')}`)
      },
    )

    server.registerTool(
      'search_articles',
      {
        title: 'Buscar dentro de una norma',
        description:
          'Busca texto DENTRO de una norma y devuelve los artículos que coinciden, con un ' +
          'extracto. Úsalo para ubicar el artículo relevante de una ley larga (un código puede ' +
          'tener cientos de artículos) sin traer su texto completo; luego pide el artículo con ' +
          'get_article. Funciona sobre cualquier norma del corpus, no sólo las indexadas. ' +
          AMBIGUITY_NOTE,
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma, ej. "19300"'),
          query: z.string().min(2).describe('Términos a buscar dentro de la norma'),
          fecha: z.string().optional().describe(ISO_HELP + ' Por defecto la versión vigente.'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, query, fecha, idNorma }) => {
        const fechas = checkFechas({ fecha })
        if (!fechas.ok) return text(fechas.message)
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const today = TODAY()
        const cov = coverage(versions, at, today)
        if (cov.kind === 'unreachable') return text(noReachableVersion(norma, cov.versions))
        if (cov.kind === 'before') {
          return text(notYetInForce(norma, cov.first, at, await getModifies(norma.idNorma)))
        }
        const hits = await searchArticles(norma.idNorma, query, at)
        if (hits.length === 0) {
          return text(
            [
              ...horizonLines(cov, at, today),
              `Sin coincidencias para "${query}" en ${identityLine(norma)} — ${norma.titulo} (al ${at}).`,
            ].join('\n'),
          )
        }
        const blocks = hits.map(
          (h) =>
            `## ${h.rawHeading || h.label}\n${lawUrl(norma, at)}#art-${h.slug}\n${h.snippet}`,
        )
        return text(
          [
            ...horizonLines(cov, at, today),
            `${hits.length} artículo(s) coinciden con "${query}" en:`,
            `${identityLine(norma)} — ${norma.titulo}`,
            `Texto vigente al ${at}. Pide el texto completo con get_article.`,
            '',
            windowed(blocks.join('\n\n'), MAX_DIFF).text,
          ].join('\n'),
        )
      },
    )

    server.registerTool(
      'get_law',
      {
        title: 'Obtener una norma',
        description:
          'Metadatos de una norma chilena más su índice de artículos y su historial de versiones. ' +
          'NO devuelve el texto completo (una norma puede tener cientos de miles de caracteres): ' +
          'usa `get_article` para el texto de un artículo.',
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma, ej. "20330"'),
          fecha: z.string().optional().describe(ISO_HELP + ' Por defecto la versión vigente.'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, fecha, idNorma }) => {
        const fechas = checkFechas({ fecha })
        if (!fechas.ok) return text(fechas.message)
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const today = TODAY()
        const cov = coverage(versions, at, today)
        if (cov.kind === 'unreachable') return text(noReachableVersion(norma, cov.versions))
        if (cov.kind === 'before') {
          return text(notYetInForce(norma, cov.first, at, await getModifies(norma.idNorma)))
        }
        const [articles, avisos, refundido] = await Promise.all([
          getArticlesAsOf(norma.idNorma, at),
          getAvisos(norma.idNorma),
          getRefundido(norma.idNorma),
        ])
        const index = articles.map((a: Article) => `  - ${a.label}${a.rawHeading ? ` (${a.rawHeading})` : ''}`)
        const avisos_ = avisoLines(avisos, refundido)
        return text(
          [
            ...horizonLines(cov, at, today),
            ...corpusCaveats(norma.idNorma, versions.length),
            `${norma.tipo.toUpperCase()} ${norma.numero} — ${norma.titulo}`,
            `idNorma: ${norma.idNorma}`,
            norma.organismo ? `Organismo: ${norma.organismo}` : '',
            `Publicación: ${norma.fechaPublicacion ?? '—'}${norma.derogado ? ' · DEROGADA' : ''}`,
            `Texto vigente al: ${at}`,
            `Versiones (${versions.length}): ${versions.map((v) => v.desde).join(', ')}`,
            `URL: ${lawUrl(norma, at)}`,
            // Before the articulado, never after: a warning about article
            // numbering is worthless once the numbers have been read.
            ...(avisos_.length ? ['', ...avisos_] : []),
            '',
            `Artículos (${articles.length}) — usa get_article para el texto:`,
            ...index.slice(0, 300),
            articles.length > 300 ? `  …y ${articles.length - 300} más` : '',
          ].filter(Boolean).join('\n'),
        )
      },
    )

    server.registerTool(
      'get_article',
      {
        title: 'Obtener un artículo',
        description:
          'Texto de un artículo específico de una norma, en su versión vigente a una fecha. ' +
          'OJO: el corpus guarda el texto consolidado y lo aplica desde la fecha de ' +
          'PUBLICACIÓN de la reforma. Cuando una reforma tiene entrada en vigencia diferida ' +
          'o gradual, esa no es la fecha en que empieza a regir; la respuesta lo advierte y ' +
          'dice qué regla regía ese día. ' + AMBIGUITY_NOTE,
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          articulo: z.string().describe('Etiqueta o slug del artículo. Se aceptan las grafías habituales: "Artículo 22", "Art. 22", "art. 22°", "articulo-22".'),
          fecha: z.string().optional().describe(ISO_HELP + ' Por defecto la versión vigente.'),
          offset: OFFSET_PARAM,
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, articulo, fecha, offset, idNorma }) => {
        const fechas = checkFechas({ fecha })
        if (!fechas.ok) return text(fechas.message)
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const today = TODAY()
        // Before any lookup: a date the norma did not exist on is a fact about
        // the *norma*. Reporting it as a missing article — which is what this
        // did — teaches a model that ley 20.000 has no Artículo 22.
        const cov = coverage(versions, at, today)
        if (cov.kind === 'unreachable') return text(noReachableVersion(norma, cov.versions))
        if (cov.kind === 'before') {
          return text(notYetInForce(norma, cov.first, at, await getModifies(norma.idNorma)))
        }
        const articles = await getArticlesAsOf(norma.idNorma, at)
        const hit = matchArticle(articles, articulo)
        if (!hit) {
          return text(
            [
              ...horizonLines(cov, at, today),
              `No se encontró el artículo "${articulo}" en ${identityLine(norma)} (al ${at}).`,
              availableLabels(articles.map((a: Article) => a.label)),
            ].join('\n'),
          )
        }
        const off = checkOffset(offset, hit.body.length)
        if (!off.ok) return text(off.message)
        const { text: body } = windowed(
          hit.body, MAX_BODY, off.value, rawTextUrl(norma.idNorma, at),
        )
        // Before the text, never after. The corpus stores the consolidated
        // text and applies it from the publication date, but a reform with
        // deferred entry does not bind from that date — article 22 of the
        // Código del Trabajo read "cuarenta horas" for dates on which the
        // limit was still forty-five. A warning placed under the text is
        // worthless: the number has already been read.
        const vigencia = vigenciaWarnings(hit.body, at)
        return text(
          [
            ...horizonLines(cov, at, today),
            ...corpusCaveats(norma.idNorma, versions.length),
            ...vigencia.map((w) => `${w}\n`),
            `${identityLine(norma)} — ${norma.titulo}`,
            `${hit.rawHeading || hit.label} · vigente al ${at}`,
            `${lawUrl(norma, at)}#art-${hit.slug}`,
            '',
            body,
          ].join('\n'),
        )
      },
    )

    server.registerTool(
      'list_versions',
      {
        title: 'Historial de versiones',
        description:
          'Todas las versiones históricas de una norma: cada fecha en que su texto cambió, ' +
          'y qué norma causó el cambio. Una publicación = un commit. ' + AMBIGUITY_NOTE,
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, idNorma }) => {
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        // One batched lookup resolves every causa's real identity; the stored
        // subject is only a fallback now. See causaLabel.
        const causas = await getCausaNormas(
          versions.map((v) => v.causaId).filter((id): id is number => id !== null),
        )
        const lines = versions.map((v, i) => {
          const range = v.hasta ? `${v.desde} → ${v.hasta}` : `${v.desde} → vigente`
          return `${i + 1}. ${range} · ${causaLabel(v, v.causaId === null ? undefined : causas.get(v.causaId))}`
        })
        const unresolved = versions.filter(
          (v) => v.causaId !== null && !causas.has(v.causaId),
        ).length
        return text(
          [
            ...corpusCaveats(norma.idNorma, versions.length),
            `${identityLine(norma)} — ${norma.titulo}`,
            `${versions.length} versión(es), con la norma que causó cada una:`,
            '',
            ...lines,
            '',
            unresolved > 0
              ? `${unresolved} causa(s) no están en el corpus — su idNorma se reporta igual, ` +
                'pero no hay metadatos para nombrarlas.'
              : '',
            'Compara dos con diff_versions.',
          ].filter(Boolean).join('\n'),
        )
      },
    )

    server.registerTool(
      'get_raw_link',
      {
        title: 'Enlace al texto completo',
        description:
          'Enlaces al texto íntegro y sin recortar de una norma, para descargarlo directamente. ' +
          'Úsalo cuando get_law o get_article devuelvan texto truncado, cuando necesites la ley ' +
          'completa de una vez, o cuando quieras citar el texto exacto vigente en una fecha. ' +
          'El enlace es estable: (norma, fecha) siempre devuelve el mismo texto. ' +
          'Devuelve enlaces, no el texto: una norma puede pesar cientos de KB. ' + AMBIGUITY_NOTE,
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          asOf: z
            .string()
            .optional()
            .describe(ISO_HELP + ' Por defecto la versión vigente.'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, asOf, idNorma }) => {
        const fechas = checkFechas({ asOf })
        if (!fechas.ok) return text(fechas.message)
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const fecha = asOf ?? currentFecha(versions)
        const today = TODAY()
        const cov = coverage(versions, fecha, today)
        if (cov.kind === 'unreachable') return text(noReachableVersion(norma, cov.versions))
        if (cov.kind === 'before') {
          return text(notYetInForce(norma, cov.first, fecha, await getModifies(norma.idNorma)))
        }
        const v = versionAt(versions, fecha)
        if (!v) {
          return text(
            `${identityLine(norma)} no tenía texto vigente al ${fecha}. ` +
            `Su primera versión es del ${versions[0]?.desde}. Usa list_versions.`,
          )
        }

        // Every link points at this site on purpose. The text also exists as
        // texto.md in the git repo, pinned to the commit below, but GitHub
        // rate-limits and challenges automated clients on UA heuristics — so a
        // github.com link is a promise we can't keep for the agents this tool
        // exists to serve. Our own endpoints we control. The sha is still
        // reported: it identifies the commit for anyone who clones the repo.
        const lines = [
          ...horizonLines(cov, fecha, today),
          `${identityLine(norma)} — ${norma.titulo}`,
          `Versión vigente al ${fecha} (rige desde ${v.desde}${v.hasta ? ` hasta ${v.hasta}` : ', vigente'}).`,
          '',
          `Texto completo (markdown, sin recortar):`,
          `  ${SITE}/api/text/${norma.idNorma}/${fecha}`,
          '',
          `Metadatos y todas las versiones (JSON):`,
          `  ${SITE}/api/idx/commits/${norma.idNorma}`,
          '',
          `Página legible: ${lawUrl(norma, fecha)}`,
          '',
          `Publicada por el commit ${v.commitSha}${v.subject ? ` (${v.subject})` : ''} en la rama`,
          `historial del repositorio. Para ver qué cambió, usa diff_versions.`,
        ]
        return text(lines.join('\n'))
      },
    )

    server.registerTool(
      'diff_versions',
      {
        title: 'Comparar versiones',
        description:
          'Qué cambió en una norma entre dos fechas: artículos añadidos, eliminados y modificados, ' +
          'con el diff palabra por palabra. Esta es la pregunta central del corpus: ' +
          '"¿cómo se leía esta ley antes de la reforma?". ' + AMBIGUITY_NOTE,
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          desde: z.string().describe('Fecha de la versión ANTERIOR. ' + ISO_HELP + ' Debe ser ANTERIOR a `hasta`.'),
          hasta: z.string().describe('Fecha de la versión POSTERIOR. ' + ISO_HELP + ' Debe ser POSTERIOR a `desde`.'),
          offset: OFFSET_PARAM,
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, desde, hasta, offset, idNorma }) => {
        const fechas = checkFechas({ desde, hasta })
        if (!fechas.ok) return text(fechas.message)
        // Order before anything else: a reversed range renders a repeal as an
        // enactment, formatted exactly like a correct answer.
        const range = checkRange(desde, hasta)
        if (!range.ok) return text(range.message)
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const today = TODAY()
        const covDesde = coverage(versions, desde, today)
        const covHasta = coverage(versions, hasta, today)
        if (covDesde.kind === 'unreachable' || covHasta.kind === 'unreachable') {
          return text(noReachableVersion(norma, versions))
        }
        if (covDesde.kind === 'before' && covHasta.kind === 'before') {
          return text(notYetInForce(norma, covDesde.first, hasta, await getModifies(norma.idNorma)))
        }
        const [prev, curr] = await Promise.all([
          getArticlesAsOf(norma.idNorma, desde),
          getArticlesAsOf(norma.idNorma, hasta),
        ])
        if (prev.length === 0 && curr.length === 0) {
          return text(`Sin texto para ${identityLine(norma)} en esas fechas.`)
        }
        const aligned = align(prev, curr)
        const changed = aligned.filter((a) => a.status !== 'unchanged')
        if (changed.length === 0) {
          return text(
            [
              ...horizonLines(covHasta, hasta, today),
              `Sin cambios de texto en ${identityLine(norma)} entre ${desde} y ${hasta}.`,
            ].join('\n'),
          )
        }
        const counts = {
          modificados: changed.filter((a) => a.status === 'modified').length,
          añadidos: changed.filter((a) => a.status === 'added').length,
          eliminados: changed.filter((a) => a.status === 'removed').length,
        }
        const blocks: string[] = []
        for (const a of changed) {
          const art = a.curr ?? a.prev!
          if (a.status === 'modified' && a.prev && a.curr) {
            const ops = wordDiff(a.prev.body, a.curr.body)
              .filter((o) => o.op !== 'equal')
              .map((o) => `${o.op === 'insert' ? '[+]' : '[-]'} ${joinDiffText(o.text).trim()}`)
              .filter((s) => s.length > 4)
            blocks.push(`## ${art.rawHeading || art.label} — MODIFICADO\n${ops.join('\n')}`)
          } else if (a.status === 'added') {
            blocks.push(`## ${art.rawHeading || art.label} — AÑADIDO\n${art.body.slice(0, 800)}`)
          } else {
            blocks.push(`## ${art.rawHeading || art.label} — ELIMINADO`)
          }
        }
        const rendered = blocks.join('\n\n')
        const off = checkOffset(offset, rendered.length)
        if (!off.ok) return text(off.message)
        const { text: diffBody } = windowed(
          rendered, MAX_DIFF, off.value, rawTextUrl(norma.idNorma, hasta),
        )
        return text(
          [
            ...horizonLines(covHasta, hasta, today),
            ...corpusCaveats(norma.idNorma, versions.length),
            // A phase-in inside either endpoint means the text shown did not
            // bind on that date, so a diff between them overstates what was
            // actually in force.
            ...vigenciaWarnings(curr.map((a: Article) => a.body).join('\n'), hasta)
              .map((w) => `${w}\n`),
            // Otherwise the whole articulado renders as "AÑADIDO", which reads
            // as a reform that rewrote every article rather than as the norma
            // simply not existing at `desde`.
            ...(covDesde.kind === 'before'
              ? [
                  `Nota: ${identityLine(norma)} no estaba vigente al ${desde} (primera ` +
                  `versión: ${covDesde.first.desde}). Lo que sigue es su articulado inicial, ` +
                  'no una reforma.\n',
                ]
              : []),
            `${identityLine(norma)} — cambios entre ${desde} y ${hasta}`,
            `${norma.titulo}`,
            `${counts.modificados} modificados · ${counts.añadidos} añadidos · ${counts.eliminados} eliminados`,
            `${lawUrl(norma, hasta)}`,
            '',
            diffBody,
          ].join('\n'),
        )
      },
    )

    server.registerTool(
      'get_modifications',
      {
        title: 'Grafo de modificaciones',
        description:
          'Qué normas modificaron a esta, y a qué normas modificó ella. La relación ' +
          'modificadora → modificada que el corpus existe para exponer. ' + AMBIGUITY_NOTE,
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, idNorma }) => {
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const [modifiedBy, modifies] = await Promise.all([
          getModifiedBy(norma.idNorma),
          getModifies(norma.idNorma),
        ])
        // idNorma on every row: a related norma cited only as "DFL 4" cannot be
        // fetched back — that key names 79 different norms.
        const fmt = (rows: typeof modifiedBy) =>
          rows.slice(0, 60).map(
            (m) => `- ${m.tipo.toUpperCase()} ${m.numero} (${m.fecha}) · idNorma ${m.idNorma} — ${m.titulo}`,
          ).join('\n')
        return text(
          [
            `${identityLine(norma)} — ${norma.titulo}`,
            '',
            `MODIFICADA POR (${modifiedBy.length}):`,
            modifiedBy.length ? fmt(modifiedBy) : '  (ninguna)',
            '',
            `MODIFICA A (${modifies.length}):`,
            modifies.length ? fmt(modifies) : '  (ninguna)',
          ].join('\n'),
        )
      },
    )
  },
  {
    serverInfo: { name: 'leychile', version: '1.0.0' },
    capabilities: { tools: {} },
  },
  {
    basePath: '/api',   // must match this route's location: app/api/[transport]
    maxDuration: 60,
  },
)

export { handler as GET, handler as POST, handler as DELETE }
