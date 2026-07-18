import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import {
  currentFecha, getArticlesAsOf, getModifiedBy, getModifies, getNormaById,
  getNormasByKey, getOrganismosByIds, getVersions,
  type Article, type Norma, type Version,
} from '@/lib/norma'
import { needsColdPath, searchArticles, searchCold, searchHot } from '@/lib/search'
import { align, joinDiffText, wordDiff } from '@/lib/diff'
import { SITE } from '@/lib/jsonld'
import { canonicalHref } from '@/lib/href'

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

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}\n\n…[truncado: ${s.length - n} caracteres más]`
}

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

/** The version in force on `fecha`. `hasta` is INCLUSIVE — it holds the day
 *  before the next version's `desde` (…hasta 2026-02-04, then desde
 *  2026-02-05), so the comparison must be <=, not <. With <, the final day of
 *  every version reports as having no text. */
function versionAt(versions: Version[], fecha: string): Version | undefined {
  return versions.find((v) => v.desde <= fecha && (v.hasta === null || fecha <= v.hasta))
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
          asOf: z.string().optional().describe('Fecha YYYY-MM-DD; por defecto hoy (texto vigente)'),
        },
      },
      async ({ query, asOf }) => {
        const fecha = asOf ?? TODAY()
        const hot = await searchHot(query, fecha)
        const cold = needsColdPath(hot.length) ? await searchCold(query, fecha) : []
        const seen = new Set<number>()
        const hits = [...hot, ...cold]
          .filter((h) => (seen.has(h.idNorma) ? false : (seen.add(h.idNorma), true)))
          .slice(0, 20)
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
          fecha: z.string().optional().describe('Fecha YYYY-MM-DD; por defecto la versión vigente'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, query, fecha, idNorma }) => {
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const hits = await searchArticles(norma.idNorma, query, at)
        if (hits.length === 0) {
          return text(
            `Sin coincidencias para "${query}" en ${identityLine(norma)} — ${norma.titulo} (al ${at}).`,
          )
        }
        const blocks = hits.map(
          (h) =>
            `## ${h.rawHeading || h.label}\n${lawUrl(norma, at)}#art-${h.slug}\n${h.snippet}`,
        )
        return text(
          [
            `${hits.length} artículo(s) coinciden con "${query}" en:`,
            `${identityLine(norma)} — ${norma.titulo}`,
            `Texto vigente al ${at}. Pide el texto completo con get_article.`,
            '',
            truncate(blocks.join('\n\n'), MAX_DIFF),
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
          fecha: z.string().optional().describe('Fecha YYYY-MM-DD; por defecto la versión vigente'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, fecha, idNorma }) => {
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const articles = await getArticlesAsOf(norma.idNorma, at)
        const index = articles.map((a: Article) => `  - ${a.label}${a.rawHeading ? ` (${a.rawHeading})` : ''}`)
        return text(
          [
            `${norma.tipo.toUpperCase()} ${norma.numero} — ${norma.titulo}`,
            `idNorma: ${norma.idNorma}`,
            norma.organismo ? `Organismo: ${norma.organismo}` : '',
            `Publicación: ${norma.fechaPublicacion ?? '—'}${norma.derogado ? ' · DEROGADA' : ''}`,
            `Texto vigente al: ${at}`,
            `Versiones (${versions.length}): ${versions.map((v) => v.desde).join(', ')}`,
            `URL: ${lawUrl(norma, at)}`,
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
          AMBIGUITY_NOTE,
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          articulo: z.string().describe('Etiqueta o slug del artículo, ej. "Artículo 1" o "articulo 1"'),
          fecha: z.string().optional().describe('Fecha YYYY-MM-DD; por defecto la versión vigente'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, articulo, fecha, idNorma }) => {
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const articles = await getArticlesAsOf(norma.idNorma, at)
        const want = articulo.toLowerCase().replace(/\s+/g, ' ').trim()
        const hit =
          articles.find((a: Article) => a.label.toLowerCase() === want) ??
          articles.find((a: Article) => a.slug.toLowerCase() === want.replace(/\s+/g, '-')) ??
          articles.find((a: Article) => a.label.toLowerCase().includes(want))
        if (!hit) {
          return text(
            `No se encontró el artículo "${articulo}" en ${identityLine(norma)} (al ${at}). ` +
            `Disponibles: ${articles.slice(0, 40).map((a: Article) => a.label).join(', ')}…`,
          )
        }
        return text(
          [
            `${identityLine(norma)} — ${norma.titulo}`,
            `${hit.rawHeading || hit.label} · vigente al ${at}`,
            `${lawUrl(norma, at)}#art-${hit.slug}`,
            '',
            truncate(hit.body, MAX_BODY),
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
        const lines = versions.map(
          (v, i) => `${i + 1}. ${v.desde}${v.hasta ? ` → ${v.hasta}` : ' → vigente'}${v.subject ? ` · ${v.subject}` : ''}`,
        )
        return text(
          `${identityLine(norma)} — ${norma.titulo}\n` +
          `${versions.length} versión(es):\n\n${lines.join('\n')}\n\n` +
          `Compara dos con diff_versions.`,
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
            .describe('Fecha YYYY-MM-DD; por defecto la versión vigente'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, asOf, idNorma }) => {
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
        const versions = await getVersions(norma.idNorma)
        const fecha = asOf ?? currentFecha(versions)
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
          desde: z.string().describe('Fecha de la versión ANTERIOR (YYYY-MM-DD)'),
          hasta: z.string().describe('Fecha de la versión POSTERIOR (YYYY-MM-DD)'),
          idNorma: ID_NORMA_PARAM,
        },
      },
      async ({ tipo, numero, desde, hasta, idNorma }) => {
        const r = await resolveNorma(tipo, numero, idNorma)
        if (!r.ok) return text(r.message)
        const norma = r.norma
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
          return text(`Sin cambios de texto en ${identityLine(norma)} entre ${desde} y ${hasta}.`)
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
        return text(
          [
            `${identityLine(norma)} — cambios entre ${desde} y ${hasta}`,
            `${norma.titulo}`,
            `${counts.modificados} modificados · ${counts.añadidos} añadidos · ${counts.eliminados} eliminados`,
            `${lawUrl(norma, hasta)}`,
            '',
            truncate(blocks.join('\n\n'), MAX_DIFF),
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
