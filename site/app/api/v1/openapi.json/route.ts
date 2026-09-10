import { SITE } from '@/lib/site'
import { jsonz } from '@/lib/jsonz'

/**
 * OpenAPI 3.1 description of the public API.
 *
 * Deliberately UNAUTHENTICATED: a schema is not corpus data, and a consumer
 * needs to read it before they have a key. It is also the one endpoint that
 * must not require the thing it documents how to obtain.
 *
 * Hand-written rather than generated. The route handlers are plain functions
 * with no schema decorators to derive from, so generating it would mean adding
 * a validation layer purely to feed a document — and a wrong-but-generated
 * schema is worse than an accurate hand-written one. The trade is that this
 * file must be updated alongside any endpoint change; the eight paths below
 * mirror `KNOWN_ENDPOINTS` in lib/apiusage.ts, which a test already pins.
 */

const IDNORMA_PARAM = {
  name: 'idNorma',
  in: 'path' as const,
  required: true,
  schema: { type: 'integer' as const, minimum: 1 },
  description:
    'LeyChile\'s unique identifier. Use this rather than (tipo, numero), which is not unique — ' +
    '227 normas share "DFL 1". Obtain it from /search.',
  example: 29994,
}

const FECHA_PARAM = {
  name: 'fecha',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, format: 'date' as const },
  description: 'YYYY-MM-DD. Returns the text in force on that date. Defaults to the current version.',
  example: '2016-04-15',
}

const ERRORS = {
  BadRequest: { $ref: '#/components/responses/BadRequest' },
  Unauthorized: { $ref: '#/components/responses/Unauthorized' },
  NotFound: { $ref: '#/components/responses/NotFound' },
  Unavailable: { $ref: '#/components/responses/Unavailable' },
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
})

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'LeyChile API',
    version: '1.0.0',
    description:
      'Read-only JSON API over the Chilean legal corpus: 333,026 normas, every historical ' +
      'version of each, and the modification graph between them.\n\n' +
      '`(tipo, numero)` does not identify a Chilean norma — always address them by `idNorma`.\n\n' +
      'Logged per request: the API key, the route template, the status, the duration and the ' +
      'timestamp. Not logged: search terms, which norma was read, IP, or user agent. Usage rows ' +
      'are deleted after 90 days.',
    contact: { url: `${SITE}/api` },
  },
  servers: [{ url: `${SITE}/api/v1`, description: 'Production' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'search', description: 'Find normas across the corpus' },
    { name: 'normas', description: 'Read one norma, its articles, versions and relations' },
  ],
  paths: {
    '/search': {
      get: {
        tags: ['search'],
        summary: 'Search the corpus by text or citation',
        description:
          'Either free text (`q`) or a citation (`tipo` + `numero`). A citation returns EVERY ' +
          'candidate rather than guessing, because (tipo, numero) is ambiguous across most of ' +
          'the corpus.',
        operationId: 'search',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 2 },
            description: 'Free-text terms, minimum 2 characters.', example: 'medio ambiente' },
          { name: 'tipo', in: 'query', schema: { type: 'string' },
            description: 'Citation type: ley, dl, dfl, dto, cod, res…', example: 'ley' },
          { name: 'numero', in: 'query', schema: { type: 'string' },
            description: 'Citation number. Requires `tipo`.', example: '18603' },
          { name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' },
            description: 'YYYY-MM-DD. Searches the text in force on that date. Defaults to today.' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            description: 'Free-text only. A citation always returns every candidate.' },
        ],
        responses: {
          200: {
            description: 'Matching normas.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchResult' } } },
          },
          400: ERRORS.BadRequest, 401: ERRORS.Unauthorized, 503: ERRORS.Unavailable,
        },
      },
    },
    '/normas/{idNorma}': {
      get: {
        tags: ['normas'],
        summary: 'Norma metadata and article index',
        description:
          'Metadata plus an index of article slugs. Never article bodies — a single norma can ' +
          'be ~350 KB. Fetch bodies one at a time from /normas/{idNorma}/articulos/{slug}.',
        operationId: 'getNorma',
        parameters: [IDNORMA_PARAM, FECHA_PARAM],
        responses: {
          200: {
            description: 'The norma.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Norma' } } },
            headers: {
              ETag: { schema: { type: 'string' }, description: 'Send back as If-None-Match for a 304.' },
            },
          },
          304: { description: 'Not modified — the ETag you sent still matches.' },
          400: ERRORS.BadRequest, 401: ERRORS.Unauthorized, 404: ERRORS.NotFound, 503: ERRORS.Unavailable,
        },
      },
    },
    '/normas/{idNorma}/articulos': {
      get: {
        tags: ['normas'],
        summary: 'Article index, or search within the norma',
        description:
          'Without `q`, the full article index at a date. With `q`, only matching articles, ' +
          'each carrying a `snippet` with <b> around the hit — how to locate the relevant ' +
          'article of a code with hundreds of them without downloading its text.',
        operationId: 'listArticulos',
        parameters: [
          IDNORMA_PARAM, FECHA_PARAM,
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 2 },
            description: 'Search terms, minimum 2 characters.', example: 'militante' },
        ],
        responses: {
          200: {
            description: 'Article index, with snippets when `q` is given.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ArticuloList' } } },
          },
          400: ERRORS.BadRequest, 401: ERRORS.Unauthorized, 404: ERRORS.NotFound, 503: ERRORS.Unavailable,
        },
      },
    },
    '/normas/{idNorma}/articulos/{slug}': {
      get: {
        tags: ['normas'],
        summary: 'One article body',
        operationId: 'getArticulo',
        parameters: [
          IDNORMA_PARAM,
          { name: 'slug', in: 'path', required: true, schema: { type: 'string' },
            description: 'Article slug from the index.', example: 'art-1' },
          FECHA_PARAM,
        ],
        responses: {
          200: {
            description:
              'The article. Bodies are capped at 12,000 characters; when `truncado` is true the ' +
              'text is incomplete and `largoCompleto` is the real length.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Articulo' } } },
            headers: { ETag: { schema: { type: 'string' } } },
          },
          304: { description: 'Not modified.' },
          400: ERRORS.BadRequest, 401: ERRORS.Unauthorized, 404: ERRORS.NotFound, 503: ERRORS.Unavailable,
        },
      },
    },
    '/normas/{idNorma}/versiones': {
      get: {
        tags: ['normas'],
        summary: 'Version history',
        description:
          'Every version with the window it was in force. `desde` values are the dates to pass ' +
          'as `fecha`, `from` and `to` elsewhere.',
        operationId: 'listVersiones',
        parameters: [IDNORMA_PARAM],
        responses: {
          200: {
            description: 'Versions, oldest first.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/VersionList' } } },
            headers: { ETag: { schema: { type: 'string' } } },
          },
          304: { description: 'Not modified.' },
          400: ERRORS.BadRequest, 401: ERRORS.Unauthorized, 404: ERRORS.NotFound, 503: ERRORS.Unavailable,
        },
      },
    },
    '/normas/{idNorma}/diff': {
      get: {
        tags: ['normas'],
        summary: 'What changed between two versions',
        description:
          'The question the corpus exists to answer. Returns structured per-article insert and ' +
          'delete operations. A norma that did not change returns 200 with an empty `cambios` ' +
          'array — that is an answer, not an error.',
        operationId: 'diffVersiones',
        parameters: [
          IDNORMA_PARAM,
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' },
            description: 'The earlier version date.', example: '2015-05-05' },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' },
            description: 'The later version date.', example: '2016-04-15' },
        ],
        responses: {
          200: {
            description: 'The change set.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Diff' } } },
            headers: { ETag: { schema: { type: 'string' } } },
          },
          304: { description: 'Not modified.' },
          400: errorResponse('Missing or malformed `from` / `to`.'),
          401: ERRORS.Unauthorized,
          404: errorResponse('No such norma, or no text at either date.'),
          503: ERRORS.Unavailable,
        },
      },
    },
    '/normas/{idNorma}/modificaciones': {
      get: {
        tags: ['normas'],
        summary: 'The modification graph, both directions',
        description:
          'What modified this norma, and what it modified. Every entry carries `idNorma`, so a ' +
          'caller never has to resolve an ambiguous citation.',
        operationId: 'getModificaciones',
        parameters: [IDNORMA_PARAM],
        responses: {
          200: {
            description: 'Both directions.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Modificaciones' } } },
            headers: { ETag: { schema: { type: 'string' } } },
          },
          304: { description: 'Not modified.' },
          400: ERRORS.BadRequest, 401: ERRORS.Unauthorized, 404: ERRORS.NotFound, 503: ERRORS.Unavailable,
        },
      },
    },
    '/normas/{idNorma}/raw': {
      get: {
        tags: ['normas'],
        summary: 'Canonical links to the authoritative source',
        description: 'Links back to leychile.cl, for citing or verifying a version.',
        operationId: 'getRawLinks',
        parameters: [IDNORMA_PARAM, FECHA_PARAM],
        responses: {
          200: {
            description: 'Upstream links.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RawLinks' } } },
            headers: { ETag: { schema: { type: 'string' } } },
          },
          304: { description: 'Not modified.' },
          400: ERRORS.BadRequest, 401: ERRORS.Unauthorized, 404: ERRORS.NotFound, 503: ERRORS.Unavailable,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'A key issued by the operator: `Authorization: Bearer lc_live_…`',
      },
    },
    responses: {
      BadRequest: errorResponse('Malformed `idNorma` or date, or a missing required parameter. Dates must be real calendar dates — 2026-02-31 is a 400.'),
      Unauthorized: errorResponse('Missing, malformed, unknown or revoked key.'),
      NotFound: errorResponse('No such norma, article or version.'),
      Unavailable: errorResponse('Temporarily unavailable. An empty result array never means this — that is always a 4xx or 5xx.'),
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: ['bad_request', 'missing_api_key', 'invalid_api_key', 'not_found', 'service_unavailable'],
              },
              message: { type: 'string' },
            },
          },
        },
        example: { error: { code: 'invalid_api_key', message: 'The API key is unknown or has been revoked.' } },
      },
      NormaRef: {
        type: 'object',
        required: ['idNorma', 'tipo', 'numero', 'titulo'],
        properties: {
          idNorma: { type: 'integer', example: 29994 },
          tipo: { type: 'string', example: 'ley' },
          numero: { type: 'string', example: '18603' },
          titulo: { type: 'string', example: 'LEY ORGANICA CONSTITUCIONAL DE LOS PARTIDOS POLITICOS' },
          organismo: { type: 'string', example: 'MINISTERIO DEL INTERIOR' },
        },
      },
      SearchResult: {
        type: 'object',
        required: ['query', 'asOf', 'total', 'resultados'],
        properties: {
          query: { type: 'string' },
          asOf: { type: 'string', format: 'date' },
          total: { type: 'integer' },
          resultados: { type: 'array', items: { $ref: '#/components/schemas/NormaRef' } },
        },
      },
      ArticuloIndexEntry: {
        type: 'object',
        required: ['slug', 'label', 'rawHeading'],
        properties: {
          slug: { type: 'string', example: 'art-1', description: 'Use this to fetch the body.' },
          label: { type: 'string', example: 'articulo 1' },
          rawHeading: { type: 'string', example: 'Artículo 1º' },
          snippet: { type: 'string', description: 'Present only when `q` was given. Contains <b> around the hit.' },
        },
      },
      Norma: {
        type: 'object',
        required: ['idNorma', 'tipo', 'numero', 'titulo', 'fecha', 'totalVersiones', 'articulos'],
        properties: {
          idNorma: { type: 'integer', example: 29994 },
          tipo: { type: 'string', example: 'ley' },
          numero: { type: 'string', example: '18603' },
          titulo: { type: 'string' },
          organismo: { type: 'string', example: 'MINISTERIO DEL INTERIOR' },
          derogado: { type: 'boolean' },
          fechaPublicacion: { type: ['string', 'null'], format: 'date', example: '1987-03-23' },
          fecha: { type: 'string', format: 'date', description: 'The version described.', example: '2016-04-15' },
          totalVersiones: { type: 'integer', example: 6 },
          articulos: { type: 'array', items: { $ref: '#/components/schemas/ArticuloIndexEntry' } },
        },
      },
      ArticuloList: {
        type: 'object',
        required: ['idNorma', 'fecha', 'total', 'articulos'],
        properties: {
          idNorma: { type: 'integer' },
          fecha: { type: 'string', format: 'date' },
          query: { type: 'string', description: 'Echoed only when `q` was given.' },
          total: { type: 'integer' },
          articulos: { type: 'array', items: { $ref: '#/components/schemas/ArticuloIndexEntry' } },
        },
      },
      Articulo: {
        type: 'object',
        required: ['idNorma', 'fecha', 'slug', 'label', 'body', 'truncado', 'largoCompleto'],
        properties: {
          idNorma: { type: 'integer' },
          fecha: { type: 'string', format: 'date' },
          slug: { type: 'string', example: 'art-1' },
          label: { type: 'string', example: 'articulo 1' },
          rawHeading: { type: 'string', example: 'Artículo 1º' },
          body: { type: 'string' },
          truncado: { type: 'boolean', description: 'True when the body was cut at 12,000 characters.' },
          largoCompleto: { type: 'integer', description: 'The real body length, in characters.' },
        },
      },
      Version: {
        type: 'object',
        required: ['desde', 'hasta'],
        properties: {
          desde: { type: 'string', format: 'date', example: '1987-03-23' },
          hasta: { type: ['string', 'null'], format: 'date', description: 'Null for the version in force.' },
          causaId: { type: ['integer', 'null'], description: 'idNorma of the norma that caused this version.' },
          subject: { type: 'string' },
        },
      },
      VersionList: {
        type: 'object',
        required: ['idNorma', 'vigente', 'total', 'versiones'],
        properties: {
          idNorma: { type: 'integer' },
          vigente: { type: 'string', format: 'date', description: 'The version currently in force.' },
          total: { type: 'integer', example: 122 },
          versiones: { type: 'array', items: { $ref: '#/components/schemas/Version' } },
        },
      },
      DiffOp: {
        type: 'object',
        required: ['op', 'text'],
        properties: {
          op: { type: 'string', enum: ['insert', 'delete'] },
          text: { type: 'string' },
        },
      },
      Cambio: {
        type: 'object',
        required: ['slug', 'rawHeading', 'estado'],
        properties: {
          slug: { type: 'string' },
          rawHeading: { type: 'string' },
          estado: { type: 'string', enum: ['modificado', 'añadido', 'eliminado'] },
          ops: {
            type: 'array', items: { $ref: '#/components/schemas/DiffOp' },
            description: 'Present when `estado` is `modificado`.',
          },
          body: { type: 'string', description: 'Present when `estado` is `añadido`.' },
          truncado: { type: 'boolean' },
        },
      },
      Diff: {
        type: 'object',
        required: ['idNorma', 'from', 'to', 'resumen', 'cambios'],
        properties: {
          idNorma: { type: 'integer' },
          from: { type: 'string', format: 'date' },
          to: { type: 'string', format: 'date' },
          resumen: {
            type: 'object',
            properties: {
              modificados: { type: 'integer' },
              'añadidos': { type: 'integer' },
              eliminados: { type: 'integer' },
            },
          },
          cambios: { type: 'array', items: { $ref: '#/components/schemas/Cambio' } },
        },
      },
      ModLink: {
        type: 'object',
        required: ['idNorma', 'tipo', 'numero', 'titulo', 'fecha'],
        properties: {
          idNorma: { type: 'integer', example: 1089164 },
          tipo: { type: 'string' },
          numero: { type: 'string' },
          titulo: { type: 'string' },
          fecha: { type: 'string', format: 'date' },
        },
      },
      Modificaciones: {
        type: 'object',
        required: ['idNorma', 'modifica', 'modificadaPor'],
        properties: {
          idNorma: { type: 'integer' },
          modifica: {
            type: 'array', items: { $ref: '#/components/schemas/ModLink' },
            description: 'Normas this one modified.',
          },
          modificadaPor: {
            type: 'array', items: { $ref: '#/components/schemas/ModLink' },
            description: 'Normas that modified this one.',
          },
        },
      },
      RawLinks: {
        type: 'object',
        required: ['idNorma', 'fecha', 'url', 'xml'],
        properties: {
          idNorma: { type: 'integer' },
          fecha: { type: 'string', format: 'date' },
          url: { type: 'string', format: 'uri' },
          xml: { type: 'string', format: 'uri' },
        },
      },
    },
  },
} as const

export async function GET(req: Request) {
  return jsonz(req, spec, {
    headers: {
      // Public, unlike every other /v1 response: this is a schema, identical
      // for everyone, and not behind a key.
      'cache-control': 'public, max-age=3600',
    },
  })
}
