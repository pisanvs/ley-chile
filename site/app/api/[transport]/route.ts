import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import {
  currentFecha, getArticlesAsOf, getModifiedBy, getModifies, getNorma, getVersions,
  type Article, type Version,
} from '@/lib/norma'
import { needsColdPath, searchArticles, searchCold, searchHot } from '@/lib/search'
import { align, joinDiffText, wordDiff } from '@/lib/diff'
import { SITE } from '@/lib/jsonld'
import { normaHref } from '@/lib/href'

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

async function resolve(tipo: string, numero: string) {
  const norma = await getNorma(tipo, numero)
  if (!norma) return null
  return norma
}

function lawUrl(tipo: string, numero: string, fecha?: string) {
  return normaHref(tipo, numero, fecha, undefined, SITE)
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
        const lines = hits.map(
          (h) => `- ${h.tipo.toUpperCase()} ${h.numero} — ${h.titulo}\n  ${lawUrl(h.tipo, h.numero)}`,
        )
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
          'get_article. Funciona sobre cualquier norma del corpus, no sólo las indexadas.',
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma, ej. "19300"'),
          query: z.string().min(2).describe('Términos a buscar dentro de la norma'),
          fecha: z.string().optional().describe('Fecha YYYY-MM-DD; por defecto la versión vigente'),
        },
      },
      async ({ tipo, numero, query, fecha }) => {
        const norma = await resolve(tipo, numero)
        if (!norma) return text(`No se encontró ${tipo} ${numero}.`)
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const hits = await searchArticles(norma.idNorma, query, at)
        if (hits.length === 0) {
          return text(`Sin coincidencias para "${query}" en ${tipo.toUpperCase()} ${numero} (al ${at}).`)
        }
        const blocks = hits.map(
          (h) =>
            `## ${h.rawHeading || h.label}\n${lawUrl(tipo, numero, at)}#art-${h.slug}\n${h.snippet}`,
        )
        return text(
          [
            `${hits.length} artículo(s) coinciden con "${query}" en ${tipo.toUpperCase()} ${numero} — ${norma.titulo}`,
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
        },
      },
      async ({ tipo, numero, fecha }) => {
        const norma = await resolve(tipo, numero)
        if (!norma) return text(`No se encontró ${tipo} ${numero}.`)
        const versions = await getVersions(norma.idNorma)
        const at = fecha ?? currentFecha(versions)
        const articles = await getArticlesAsOf(norma.idNorma, at)
        const index = articles.map((a: Article) => `  - ${a.label}${a.rawHeading ? ` (${a.rawHeading})` : ''}`)
        return text(
          [
            `${tipo.toUpperCase()} ${numero} — ${norma.titulo}`,
            norma.organismo ? `Organismo: ${norma.organismo}` : '',
            `Publicación: ${norma.fechaPublicacion ?? '—'}${norma.derogado ? ' · DEROGADA' : ''}`,
            `Texto vigente al: ${at}`,
            `Versiones (${versions.length}): ${versions.map((v) => v.desde).join(', ')}`,
            `URL: ${lawUrl(tipo, numero, at)}`,
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
        description: 'Texto de un artículo específico de una norma, en su versión vigente a una fecha.',
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          articulo: z.string().describe('Etiqueta o slug del artículo, ej. "Artículo 1" o "articulo 1"'),
          fecha: z.string().optional().describe('Fecha YYYY-MM-DD; por defecto la versión vigente'),
        },
      },
      async ({ tipo, numero, articulo, fecha }) => {
        const norma = await resolve(tipo, numero)
        if (!norma) return text(`No se encontró ${tipo} ${numero}.`)
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
            `No se encontró el artículo "${articulo}" en ${tipo} ${numero} (al ${at}). ` +
            `Disponibles: ${articles.slice(0, 40).map((a: Article) => a.label).join(', ')}…`,
          )
        }
        return text(
          [
            `${tipo.toUpperCase()} ${numero} · ${hit.rawHeading || hit.label} · vigente al ${at}`,
            `${lawUrl(tipo, numero, at)}#art-${hit.slug}`,
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
          'y qué norma causó el cambio. Una publicación = un commit.',
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
        },
      },
      async ({ tipo, numero }) => {
        const norma = await resolve(tipo, numero)
        if (!norma) return text(`No se encontró ${tipo} ${numero}.`)
        const versions = await getVersions(norma.idNorma)
        const lines = versions.map(
          (v, i) => `${i + 1}. ${v.desde}${v.hasta ? ` → ${v.hasta}` : ' → vigente'}${v.subject ? ` · ${v.subject}` : ''}`,
        )
        return text(
          `${tipo.toUpperCase()} ${numero} — ${norma.titulo}\n` +
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
          'Devuelve enlaces, no el texto: una norma puede pesar cientos de KB.',
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          asOf: z
            .string()
            .optional()
            .describe('Fecha YYYY-MM-DD; por defecto la versión vigente'),
        },
      },
      async ({ tipo, numero, asOf }) => {
        const norma = await resolve(tipo, numero)
        if (!norma) return text(`No se encontró ${tipo} ${numero}.`)
        const versions = await getVersions(norma.idNorma)
        const fecha = asOf ?? currentFecha(versions)
        const v = versionAt(versions, fecha)
        if (!v) {
          return text(
            `${tipo.toUpperCase()} ${numero} no tenía texto vigente al ${fecha}. ` +
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
          `${tipo.toUpperCase()} ${numero} — ${norma.titulo}`,
          `Versión vigente al ${fecha} (rige desde ${v.desde}${v.hasta ? ` hasta ${v.hasta}` : ', vigente'}).`,
          '',
          `Texto completo (markdown, sin recortar):`,
          `  ${SITE}/api/text/${norma.idNorma}/${fecha}`,
          '',
          `Metadatos y todas las versiones (JSON):`,
          `  ${SITE}/api/idx/commits/${norma.idNorma}`,
          '',
          `Página legible: ${lawUrl(tipo, numero, fecha)}`,
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
          '"¿cómo se leía esta ley antes de la reforma?".',
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
          desde: z.string().describe('Fecha de la versión ANTERIOR (YYYY-MM-DD)'),
          hasta: z.string().describe('Fecha de la versión POSTERIOR (YYYY-MM-DD)'),
        },
      },
      async ({ tipo, numero, desde, hasta }) => {
        const norma = await resolve(tipo, numero)
        if (!norma) return text(`No se encontró ${tipo} ${numero}.`)
        const [prev, curr] = await Promise.all([
          getArticlesAsOf(norma.idNorma, desde),
          getArticlesAsOf(norma.idNorma, hasta),
        ])
        if (prev.length === 0 && curr.length === 0) {
          return text(`Sin texto para ${tipo} ${numero} en esas fechas.`)
        }
        const aligned = align(prev, curr)
        const changed = aligned.filter((a) => a.status !== 'unchanged')
        if (changed.length === 0) {
          return text(`Sin cambios de texto en ${tipo} ${numero} entre ${desde} y ${hasta}.`)
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
            `${tipo.toUpperCase()} ${numero} — cambios entre ${desde} y ${hasta}`,
            `${counts.modificados} modificados · ${counts.añadidos} añadidos · ${counts.eliminados} eliminados`,
            `${lawUrl(tipo, numero, hasta)}`,
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
          'modificadora → modificada que el corpus existe para exponer.',
        inputSchema: {
          tipo: z.string().describe('Tipo: ley, dl, dfl, dto, cod, res…'),
          numero: z.string().describe('Número de la norma'),
        },
      },
      async ({ tipo, numero }) => {
        const norma = await resolve(tipo, numero)
        if (!norma) return text(`No se encontró ${tipo} ${numero}.`)
        const [modifiedBy, modifies] = await Promise.all([
          getModifiedBy(norma.idNorma),
          getModifies(norma.idNorma),
        ])
        const fmt = (rows: typeof modifiedBy) =>
          rows.slice(0, 60).map((m) => `- ${m.tipo.toUpperCase()} ${m.numero} (${m.fecha}) — ${m.titulo}`).join('\n')
        return text(
          [
            `${tipo.toUpperCase()} ${numero} — ${norma.titulo}`,
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
