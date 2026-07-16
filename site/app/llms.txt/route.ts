import { SITE } from '@/lib/jsonld'

/** /llms.txt — agent-readable instructions for this corpus.
 *
 *  The site is "para agentes y humanos": humans get the reader, agents get the
 *  MCP server. This file is the front door for the latter — it names the MCP
 *  endpoint first, then the plain HTTP shapes for agents that don't speak MCP.
 *  Static (no DB), so it never fails and never goes stale against the data. */
export const dynamic = 'force-static'

const REPO = 'https://github.com/pisanvs/ley-chile'

function body(): string {
  return `# LeyChile

> Cada versión de cada ley chilena, desde 1810. El corpus jurídico de Chile
> (leyes, decretos con fuerza de ley, decretos, códigos, resoluciones)
> reconstruido desde la Biblioteca del Congreso Nacional como un repositorio
> git: una publicación legislativa = un commit. Cada norma es navegable en
> cualquiera de sus versiones históricas, y cualquier par de versiones se puede
> comparar palabra por palabra.

Este sitio está hecho para agentes y humanos. Si eres un agente, usa el
servidor MCP: es la interfaz diseñada para ti.

## MCP (recomendado)

Servidor MCP remoto, Streamable HTTP, sólo lectura, sin autenticación:

    ${SITE}/api/mcp

Herramientas disponibles:

- search_laws(query, asOf?)                      — buscar normas en todo el corpus
- search_articles(tipo, numero, query, fecha?)   — buscar dentro de UNA norma
- get_law(tipo, numero, fecha?)                  — metadatos + índice de artículos + versiones
- get_article(tipo, numero, articulo, fecha?)    — el texto de un artículo
- list_versions(tipo, numero)                    — cada fecha en que la norma cambió, y qué la causó
- diff_versions(tipo, numero, desde, hasta)      — qué cambió entre dos versiones (diff palabra por palabra)
- get_modifications(tipo, numero)                — grafo modificadora → modificada

Añadirlo a Claude: Settings → Connectors → Add custom connector → ${SITE}/api/mcp
Claude Code: claude mcp add --transport http leychile ${SITE}/api/mcp

Nota: una norma puede tener ~350 KB de texto. get_law devuelve un índice de
artículos, no el texto completo; pide los artículos de a uno con get_article, o
usa search_articles para ubicar el artículo relevante primero.

## HTTP (si no hablas MCP)

- ${SITE}/{tipo}/{numero}              — versión vigente (HTML, server-rendered)
- ${SITE}/{tipo}/{numero}/{YYYY-MM-DD} — versión histórica a esa fecha
- ${SITE}/buscar?q={query}             — búsqueda
- ${SITE}/api/idx/commits/{idNorma}    — metadatos + todas las versiones (JSON)
- ${SITE}/api/text/{idNorma}/{fecha}   — texto markdown reconstruido de una versión
- ${SITE}/api/idx/modifies/{idNorma}   — normas que ESTA modificó (JSON)
- ${SITE}/api/idx/modified_by/{idNorma}— normas que modificaron a ESTA (JSON)
- ${SITE}/sitemap.xml                  — índice de sitemaps

\`tipo\` ∈ ley, dl, dfl, dto, cod, res, … · \`numero\` es el número de la norma
(no el idNorma interno). Ojo: algunos numeros contienen caracteres especiales
("S/N" = sin número) — codifícalos en la URL.

## git (la fuente de verdad)

Postgres y Meilisearch son modelos derivados y desechables. La fuente canónica
es la rama \`historial\` de ${REPO}: un commit por publicación legislativa.

    git clone -b historial ${REPO}

Para comparar dos versiones sin clonar nada, GitHub sirve el diff directamente
— añade .diff a la URL del commit en vez de reconstruirlo a mano:

    ${REPO}/commit/{sha}.diff

Y el historial de una norma:

    git log --follow --format='%h %cs %s' -- leyes/{numero}/texto.md

## Advertencias

- El texto es derivado de fuentes públicas de la BCN; no es una fuente oficial.
  Para efectos legales, la referencia es la Biblioteca del Congreso Nacional
  (https://www.leychile.cl).
- Las fechas son de publicación/vigencia, no de promulgación.
- Fechas pre-1970 se normalizan (git rechaza timestamps negativos); la fecha
  real vive en el subject del commit, no en su committer date.

## Más

- Repositorio: ${REPO}
- Sitio: ${SITE}
`
}

export function GET() {
  return new Response(body(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
