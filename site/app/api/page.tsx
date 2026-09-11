import type { Metadata } from 'next'
import Link from 'next/link'

import { SITE, SITE_NAME, OG_LOCALE } from '@/lib/site'
import { CopyBlock } from '@/components/CopyBlock'

/**
 * Public documentation for the REST API, at /api.
 *
 * Structure borrowed from Stripe's and Vercel's references — a sticky endpoint
 * nav, method-and-path as the section heading, parameters as a definition list
 * rather than a table (a 4-column table is unreadable at narrow widths), and a
 * real response body beside every endpoint instead of in an appendix.
 *
 * The look is this site's own: warm paper rather than the dark code slabs those
 * references use, Fraunces for headings, JetBrains Mono for code. A docs page
 * in a foreign visual language reads as a bolted-on afterthought.
 *
 * Deliberately public — a prospective consumer has to read this BEFORE they
 * have a key, so requiring one would be circular. No database access, so it
 * prerenders as static content.
 */

const OG_TITLE = 'API — el corpus jurídico chileno en JSON'
const DESCRIPTION =
  'API REST de sólo lectura sobre las 333.026 normas chilenas: búsqueda, articulado, ' +
  'versiones históricas y diffs entre ellas. Autenticada con API key.'

// `openGraph` replaces the root layout's object rather than merging into it,
// so siteName/locale are repeated here — see the note in lib/site.ts. Without
// this, sharing /api showed the homepage's title/description/url instead.
export const metadata: Metadata = {
  title: OG_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/api` },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: OG_LOCALE,
    title: OG_TITLE,
    description: DESCRIPTION,
    url: `${SITE}/api`,
  },
}

const BASE = `${SITE}/api/v1`

interface Param {
  name: string
  type: string
  required?: boolean
  desc: string
}

interface Endpoint {
  id: string
  path: string
  title: string
  blurb: string
  params?: Param[]
  req: string
  res: string
  note?: string
}

const ENDPOINTS: Endpoint[] = [
  {
    id: 'search',
    path: '/search',
    title: 'Buscar en el corpus',
    blurb:
      'Texto libre con `q`, o una cita con `tipo` + `numero`. Una cita devuelve todas las ' +
      'candidatas, nunca una adivinanza.',
    params: [
      { name: 'q', type: 'string', desc: 'Términos de búsqueda, mínimo 2 caracteres.' },
      { name: 'tipo', type: 'string', desc: 'Tipo de cita: ley, dl, dfl, dto, cod, res…' },
      { name: 'numero', type: 'string', desc: 'Número de la norma. Requiere `tipo`.' },
      { name: 'asOf', type: 'date', desc: 'YYYY-MM-DD. Busca el texto vigente a esa fecha. Por defecto hoy.' },
      { name: 'limit', type: 'integer', desc: '1–100, por defecto 20. Sólo en texto libre: una cita siempre devuelve todo.' },
    ],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/search?q=medio+ambiente&limit=2'`,
    res: `{
  "query": "medio ambiente",
  "asOf": "2026-09-10",
  "total": 2,
  "resultados": [
    {
      "idNorma": 30667,
      "tipo": "ley",
      "numero": "19300",
      "titulo": "APRUEBA LEY SOBRE BASES GENERALES DEL MEDIO AMBIENTE",
      "organismo": "MINISTERIO SECRETARÍA GENERAL DE LA PRESIDENCIA"
    }
  ]
}`,
  },
  {
    id: 'norma',
    path: '/normas/{idNorma}',
    title: 'Una norma y su índice de artículos',
    blurb:
      'Metadatos más el índice de artículos. **Nunca** el texto de los artículos: una norma ' +
      'puede pesar ~350 KB, así que los cuerpos se piden de uno en uno.',
    params: [
      { name: 'idNorma', type: 'integer', required: true, desc: 'En la ruta. El identificador único de LeyChile.' },
      { name: 'fecha', type: 'date', desc: 'YYYY-MM-DD. Devuelve la versión vigente a esa fecha.' },
    ],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/normas/29994'`,
    res: `{
  "idNorma": 29994,
  "tipo": "ley",
  "numero": "18603",
  "titulo": "LEY ORGANICA CONSTITUCIONAL DE LOS PARTIDOS POLITICOS",
  "organismo": "MINISTERIO DEL INTERIOR",
  "derogado": false,
  "fechaPublicacion": "1987-03-23",
  "fecha": "2016-04-15",
  "totalVersiones": 6,
  "articulos": [
    { "slug": "art-1", "label": "articulo 1", "rawHeading": "Artículo 1º" }
  ]
}`,
  },
  {
    id: 'articulos',
    path: '/normas/{idNorma}/articulos',
    title: 'Índice de artículos, o buscar dentro de la norma',
    blurb:
      'Sin `q`, el índice completo a una fecha. Con `q`, sólo los artículos que coinciden, ' +
      'cada uno con un `snippet`. Así se ubica el artículo relevante de un código con ' +
      'cientos sin descargar su texto.',
    params: [
      { name: 'idNorma', type: 'integer', required: true, desc: 'En la ruta.' },
      { name: 'q', type: 'string', desc: 'Términos a buscar dentro de la norma, mínimo 2 caracteres.' },
      { name: 'fecha', type: 'date', desc: 'YYYY-MM-DD. Por defecto la versión vigente.' },
    ],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/normas/29994/articulos?q=militante'`,
    res: `{
  "idNorma": 29994,
  "fecha": "2016-04-15",
  "query": "militante",
  "total": 5,
  "articulos": [
    {
      "slug": "art-23-bis",
      "label": "articulo 23 bis",
      "rawHeading": "Artículo 23 bis",
      "snippet": "…sus <b>militantes</b>. La infracción de esta prohibición…"
    }
  ]
}`,
  },
  {
    id: 'articulo',
    path: '/normas/{idNorma}/articulos/{slug}',
    title: 'El texto de un artículo',
    blurb:
      'Los cuerpos se cortan a 12.000 caracteres. Cuando `truncado` es `true` el texto está ' +
      'incompleto y `largoCompleto` da el largo real — nunca tomes un artículo truncado por ' +
      'el precepto entero.',
    params: [
      { name: 'idNorma', type: 'integer', required: true, desc: 'En la ruta.' },
      { name: 'slug', type: 'string', required: true, desc: 'En la ruta. Del índice de artículos.' },
      { name: 'fecha', type: 'date', desc: 'YYYY-MM-DD. Por defecto la versión vigente.' },
    ],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/normas/29994/articulos/art-1'`,
    res: `{
  "idNorma": 29994,
  "fecha": "2016-04-15",
  "slug": "art-1",
  "label": "articulo 1",
  "rawHeading": "Artículo 1º",
  "body": "Los partidos políticos son asociaciones autónomas y voluntarias…",
  "truncado": false,
  "largoCompleto": 970
}`,
  },
  {
    id: 'versiones',
    path: '/normas/{idNorma}/versiones',
    title: 'Historial de versiones',
    blurb:
      'Cada versión con la ventana en que rigió. Los `desde` son las fechas que se pasan como ' +
      '`fecha`, `from` y `to` en el resto de la API.',
    params: [{ name: 'idNorma', type: 'integer', required: true, desc: 'En la ruta.' }],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/normas/1984/versiones'`,
    res: `{
  "idNorma": 1984,
  "vigente": "2025-09-17",
  "total": 122,
  "versiones": [
    {
      "desde": "1874-11-12",
      "hasta": "1917-09-26",
      "causaId": null,
      "subject": "Código Penal publicada (1874-11-12)"
    }
  ]
}`,
    note: 'El Código Penal tiene 122 versiones desde 1874. Ése es el punto del corpus.',
  },
  {
    id: 'diff',
    path: '/normas/{idNorma}/diff',
    title: 'Qué cambió entre dos versiones',
    blurb:
      'La pregunta para la que existe este corpus. Devuelve operaciones estructuradas por ' +
      'artículo, no prosa. Una norma que no cambió devuelve `200` con `cambios` vacío: eso es ' +
      'una respuesta, no un error.',
    params: [
      { name: 'idNorma', type: 'integer', required: true, desc: 'En la ruta.' },
      { name: 'from', type: 'date', required: true, desc: 'YYYY-MM-DD. La versión anterior.' },
      { name: 'to', type: 'date', required: true, desc: 'YYYY-MM-DD. La versión posterior.' },
    ],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/normas/29994/diff?from=2015-05-05&to=2016-04-15'`,
    res: `{
  "idNorma": 29994,
  "from": "2015-05-05",
  "to": "2016-04-15",
  "resumen": { "modificados": 53, "añadidos": 16, "eliminados": 0 },
  "cambios": [
    {
      "slug": "art-1",
      "rawHeading": "Artículo 1º",
      "estado": "modificado",
      "ops": [
        { "op": "delete", "text": "voluntarias, dotadas de personalidad jurídica…" },
        { "op": "insert", "text": "autónomas y voluntarias organizadas democráticamente…" }
      ]
    }
  ]
}`,
  },
  {
    id: 'modificaciones',
    path: '/normas/{idNorma}/modificaciones',
    title: 'El grafo de modificaciones, en ambos sentidos',
    blurb:
      'Qué normas modificaron a ésta, y a cuáles modificó ella. Cada entrada trae su ' +
      '`idNorma`, así que nunca hay que resolver una cita ambigua.',
    params: [{ name: 'idNorma', type: 'integer', required: true, desc: 'En la ruta.' }],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/normas/29994/modificaciones'`,
    res: `{
  "idNorma": 29994,
  "modifica": [],
  "modificadaPor": [
    {
      "idNorma": 1089164,
      "tipo": "ley",
      "numero": "20915",
      "titulo": "FORTALECE EL CARÁCTER PÚBLICO Y DEMOCRÁTICO DE LOS PARTIDOS POLÍTICOS…",
      "fecha": "2016-04-15"
    }
  ]
}`,
  },
  {
    id: 'raw',
    path: '/normas/{idNorma}/raw',
    title: 'El enlace a la fuente autoritativa',
    blurb: 'Enlaces de vuelta a leychile.cl, para citar o verificar una versión.',
    params: [
      { name: 'idNorma', type: 'integer', required: true, desc: 'En la ruta.' },
      { name: 'fecha', type: 'date', desc: 'YYYY-MM-DD. Por defecto la versión vigente.' },
    ],
    req: `curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/normas/29994/raw?fecha=2016-04-15'`,
    res: `{
  "idNorma": 29994,
  "fecha": "2016-04-15",
  "url": "https://www.leychile.cl/Navegar?idNorma=29994&idVersion=2016-04-15",
  "xml": "https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma=29994&idVersion=2016-04-15"
}`,
  },
]

const ERRORS: [string, string, string][] = [
  ['400', 'bad_request', '`idNorma` o fecha mal formada, o falta un parámetro obligatorio.'],
  ['401', 'missing_api_key · invalid_api_key', 'Key ausente, desconocida o revocada.'],
  ['404', 'not_found', 'No existe esa norma, artículo o versión.'],
  ['503', 'service_unavailable', 'Servicio temporalmente no disponible.'],
]

/** Minimal inline markup: `code` and **strong**. Enough for this page's prose,
 *  and cheaper than pulling a markdown renderer into a static page. */
function rich(s: string) {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`')) {
      return (
        <code key={i} className="font-mono text-[0.9em] text-indigo">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**')) {
      return (
        <strong key={i} className="text-ink font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-rule pt-10 mt-14 first:mt-0 first:border-0 first:pt-0">
      {eyebrow && (
        <p className="text-[10.5px] uppercase tracking-[0.25em] text-ink-faint mb-3">{eyebrow}</p>
      )}
      <h2 className="font-display text-2xl md:text-[1.75rem] leading-tight text-balance mb-4">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function Page() {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <div className="px-6 md:px-12 max-w-6xl mx-auto pt-16 pb-24">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className="max-w-3xl">
          <p className="text-[10.5px] uppercase tracking-[0.25em] text-ink-faint mb-5">
            API · v1
          </p>
          <h1 className="font-display text-4xl md:text-[3.25rem] leading-[1.05] tracking-tight text-balance">
            El corpus jurídico chileno, <span className="text-ruby">en JSON</span>.
          </h1>
          <p className="mt-6 text-ink-soft text-[15.5px] leading-relaxed">
            333.026 normas, cada versión histórica de cada una, y el grafo de modificaciones
            entre ellas. Sólo lectura, autenticada con una API key. Los mismos datos que
            entrega el{' '}
            <a href="/api/mcp" className="text-indigo underline underline-offset-2 hover:text-ruby transition-colors">
              servidor MCP
            </a>
            {' '}— ése devuelve prosa para modelos, ésta devuelve JSON.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <code className="font-mono text-[12.5px] bg-paper-sunk border border-rule rounded-md px-2.5 py-1.5 text-ink-soft">
              {BASE}
            </code>
            <a
              href="/api/v1/openapi.json"
              className="text-xs font-ui px-3 py-1.5 rounded-md border border-rule text-ink-soft hover:text-ink hover:border-ink/40 transition"
            >
              OpenAPI 3.1
            </a>
            <a
              href="/llms.txt"
              className="text-xs font-ui px-3 py-1.5 rounded-md border border-rule text-ink-soft hover:text-ink hover:border-ink/40 transition"
            >
              llms.txt
            </a>
          </div>
        </header>

        <div className="mt-16 lg:grid lg:grid-cols-[1fr_13rem] lg:gap-14 items-start">
          {/* ── Content ────────────────────────────────────────────── */}
          <main className="min-w-0 max-w-3xl">
            <Section id="auth" eyebrow="Empezar" title="Autenticación">
              <p className="text-ink-soft text-[15px] leading-relaxed mb-5">
                {rich(
                  'Todos los endpoints exigen una key. Las emite el operador a mano — pídela. ' +
                  'Una key ausente, desconocida o revocada devuelve `401`.',
                )}
              </p>
              <CopyBlock
                caption="Cabecera"
                code={`Authorization: Bearer lc_live_…`}
                lang="http"
              />
              <p className="text-ink-faint text-[13.5px] leading-relaxed mt-4">
                {rich(
                  'De la key sólo se guarda su SHA-256, así que se muestra una única vez al ' +
                  'emitirla y después es irrecuperable. Guárdala como cualquier otro secreto.',
                )}
              </p>
            </Section>

            <Section id="idnorma" eyebrow="Lo primero que hay que entender" title="idNorma es el identificador que sirve">
              <p className="text-ink-soft text-[15px] leading-relaxed">
                {rich(
                  '**`(tipo, numero)` no identifica una norma chilena.** Hay 227 normas que son ' +
                  '“DFL 1”, 75 que son “DFL 4” y 525 que son “DTO 1”, de distintos organismos y ' +
                  'años. Peor: un `idNorma` interno puede coincidir con el `numero` de una ley sin ' +
                  'relación — `/ley/20780` llegó a resolver a un decreto cuyo `idNorma` era 20780.',
                )}
              </p>
              <p className="text-ink-soft text-[15px] leading-relaxed mt-4 mb-5">
                {rich(
                  'Por eso toda la API direcciona por `idNorma`, y una búsqueda por cita devuelve ' +
                  '**todas** las candidatas en vez de adivinar. Elige la que querías por su ' +
                  '`idNorma` y `organismo`, y usa ese `idNorma` de ahí en adelante.',
                )}
              </p>
              <CopyBlock
                code={`curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
  '${BASE}/search?tipo=dfl&numero=1'`}
              />
            </Section>

            {/* ── Endpoints ─────────────────────────────────────────── */}
            <div className="border-t border-rule pt-10 mt-14">
              <p className="text-[10.5px] uppercase tracking-[0.25em] text-ink-faint mb-3">
                Referencia
              </p>
              <h2 className="font-display text-2xl md:text-[1.75rem] leading-tight mb-2">
                Endpoints
              </h2>
              <p className="text-ink-soft text-[14.5px] leading-relaxed">
                Ocho, todos <code className="font-mono text-[0.9em] text-indigo">GET</code>, todos
                relativos a <code className="font-mono text-[0.9em] text-ink-soft">{BASE}</code>.
              </p>
            </div>

            {ENDPOINTS.map((e) => (
              <section key={e.id} id={e.id} className="scroll-mt-8 mt-12 pt-8 border-t border-rule/60">
                <div className="flex items-baseline gap-2.5 flex-wrap mb-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-ruby-soft text-ruby">
                    GET
                  </span>
                  <code className="font-mono text-[13.5px] text-ink break-all">{e.path}</code>
                </div>
                <h3 className="font-display text-[1.3rem] leading-snug mb-2.5">{e.title}</h3>
                <p className="text-ink-soft text-[14.5px] leading-relaxed max-w-2xl">
                  {rich(e.blurb)}
                </p>

                {e.params && (
                  <dl className="mt-6 space-y-3.5">
                    {e.params.map((p) => (
                      <div key={p.name}>
                        <dt className="flex items-baseline gap-2 flex-wrap">
                          <code className="font-mono text-[13px] text-ink">{p.name}</code>
                          <span className="font-ui text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
                            {p.type}
                          </span>
                          {p.required && (
                            <span className="font-ui text-[10.5px] uppercase tracking-[0.12em] text-ruby">
                              obligatorio
                            </span>
                          )}
                        </dt>
                        <dd className="text-ink-soft text-[13.5px] leading-relaxed mt-0.5">
                          {rich(p.desc)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="mt-6 grid gap-3 xl:grid-cols-2">
                  <CopyBlock code={e.req} />
                  <CopyBlock code={e.res} lang="json" />
                </div>

                {e.note && (
                  <p className="mt-3.5 font-display italic text-[14px] text-ink-faint">{e.note}</p>
                )}
              </section>
            ))}

            <Section id="errores" eyebrow="Comportamiento" title="Errores">
              <p className="text-ink-soft text-[15px] leading-relaxed mb-5">
                {rich('Siempre la misma envoltura, con el código HTTP que corresponde.')}
              </p>
              <CopyBlock
                lang="json"
                caption="Envoltura"
                code={`{ "error": { "code": "invalid_api_key", "message": "…" } }`}
              />
              <dl className="mt-6 space-y-3">
                {ERRORS.map(([status, code, desc]) => (
                  <div key={status} className="flex gap-4">
                    <dt className="font-mono text-[13px] text-ruby w-9 shrink-0">{status}</dt>
                    <dd className="min-w-0">
                      <code className="font-mono text-[12.5px] text-ink-soft">{code}</code>
                      <p className="text-ink-soft text-[13.5px] leading-relaxed mt-0.5">{rich(desc)}</p>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-ink-soft text-[14.5px] leading-relaxed mt-6">
                {rich(
                  'Un arreglo `resultados` o `cambios` vacío significa **que no hubo coincidencias**. ' +
                  'Nunca significa que el servicio esté roto: eso siempre es un `4xx` o un `5xx`.',
                )}
              </p>
              <p className="text-ink-soft text-[14.5px] leading-relaxed mt-3">
                {rich(
                  'Las fechas tienen que ser fechas reales del calendario: `2026-02-31` es un `400`, ' +
                  'no una sustitución silenciosa.',
                )}
              </p>
            </Section>

            <Section id="cache" eyebrow="Comportamiento" title="Caché">
              <p className="text-ink-soft text-[15px] leading-relaxed mb-5">
                {rich(
                  'Las lecturas de norma, artículo y versiones traen `ETag` y ' +
                  '`Cache-Control: private, max-age=300`. Devuelve el ETag como `If-None-Match` ' +
                  'y obtienes un `304` sin cuerpo.',
                )}
              </p>
              <CopyBlock
                code={`curl -H "Authorization: Bearer $LEYCHILE_KEY" \\
     -H 'If-None-Match: "82b8be35b76e4fdcfa40263691e1b912"' \\
  '${BASE}/normas/29994'`}
              />
              <p className="text-ink-faint text-[13.5px] leading-relaxed mt-4">
                {rich(
                  '`private` es deliberado: las respuestas van detrás de una cabecera ' +
                  '`Authorization` y no deben quedar en una caché compartida. La búsqueda no se ' +
                  'cachea.',
                )}
              </p>
            </Section>

            <Section id="registro" eyebrow="Transparencia" title="Qué se registra">
              <p className="text-ink-soft text-[15px] leading-relaxed">
                {rich(
                  'Por cada petición: **la API key, la plantilla de ruta, el código HTTP, la ' +
                  'duración y la hora.**',
                )}
              </p>
              <p className="text-ink-soft text-[15px] leading-relaxed mt-4">
                {rich(
                  '**No se registra:** qué buscaste, qué norma o artículo pediste, tu dirección IP, ' +
                  'ni tu user agent.',
                )}
              </p>
              <div className="mt-6 rounded-lg border border-rule bg-paper-sunk px-4 py-3.5">
                <p className="text-ink-soft text-[13.5px] leading-relaxed">
                  {rich(
                    'Se guarda la plantilla — `/v1/normas/{idNorma}` — nunca la ruta concreta. ' +
                    'Registrar `/v1/normas/29994` construiría un historial de qué leyes lee cada ' +
                    'titular de una key, y esta API no lo conserva. Las filas de uso se borran a ' +
                    'los **90 días**.',
                  )}
                </p>
              </div>
              <p className="text-ink-faint text-[13.5px] leading-relaxed mt-4">
                {rich(
                  'El corpus en sí es público y no recoge ninguna dimensión de usuario. La key ' +
                  'existe para que el operador vea volumen de llamadas y pueda revocar abusos, no ' +
                  'para seguir lecturas.',
                )}
              </p>
            </Section>

            <Section id="limites" eyebrow="Antes de integrar" title="Límites y detalles">
              <ul className="space-y-3 text-ink-soft text-[14.5px] leading-relaxed">
                <li className="flex gap-3">
                  <span className="text-ink-faint shrink-0">—</span>
                  <span>
                    {rich(
                      'Hoy no hay límite de tasa ni cuota. Puede cambiar si crece el tráfico, y se ' +
                      'avisaría antes. Sé razonable: son 333k normas servidas por una instancia chica.',
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-ink-faint shrink-0">—</span>
                  <span>
                    {rich(
                      'No se envían cabeceras CORS, así que un navegador no puede llamar a esta API ' +
                      'entre orígenes. Está pensada para servidor a servidor.',
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-ink-faint shrink-0">—</span>
                  <span>
                    {rich(
                      'Los nombres de campo usan los términos del dominio en español (`titulo`, ' +
                      '`numero`, `articulos`, `versiones`). `norma`, `dfl` y `dto` no tienen ' +
                      'equivalente honesto en inglés.',
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-ink-faint shrink-0">—</span>
                  <span>
                    {rich(
                      'Los datos derivan de leychile.cl y se reconstruyen desde un historial git del ' +
                      'corpus. `/raw` enlaza de vuelta a la fuente autoritativa.',
                    )}
                  </span>
                </li>
              </ul>
              <p className="text-ink-soft text-[14.5px] leading-relaxed mt-7">
                Todo esto también está en{' '}
                <a
                  href="/api/v1/openapi.json"
                  className="text-indigo underline underline-offset-2 hover:text-ruby transition-colors"
                >
                  OpenAPI 3.1
                </a>
                , si prefieres generar un cliente.{' '}
                <Link href="/" className="text-indigo underline underline-offset-2 hover:text-ruby transition-colors">
                  Volver al lector
                </Link>
                .
              </p>
            </Section>
          </main>

          {/* ── Sticky nav ─────────────────────────────────────────── */}
          <nav
            aria-label="Contenidos"
            className="hidden lg:block sticky top-8 text-[12.5px] font-ui"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
              En esta página
            </p>
            <ul className="space-y-1.5 border-l border-rule pl-3.5">
              <li><a href="#auth" className="text-ink-soft hover:text-ruby transition-colors">Autenticación</a></li>
              <li><a href="#idnorma" className="text-ink-soft hover:text-ruby transition-colors">idNorma</a></li>
            </ul>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mt-5 mb-3">
              Endpoints
            </p>
            <ul className="space-y-1.5 border-l border-rule pl-3.5">
              {ENDPOINTS.map((e) => (
                <li key={e.id}>
                  <a href={`#${e.id}`} className="font-mono text-[11.5px] text-ink-soft hover:text-ruby transition-colors break-all">
                    {e.path.replace('/normas/{idNorma}', '…')}
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mt-5 mb-3">
              Detalles
            </p>
            <ul className="space-y-1.5 border-l border-rule pl-3.5">
              <li><a href="#errores" className="text-ink-soft hover:text-ruby transition-colors">Errores</a></li>
              <li><a href="#cache" className="text-ink-soft hover:text-ruby transition-colors">Caché</a></li>
              <li><a href="#registro" className="text-ink-soft hover:text-ruby transition-colors">Qué se registra</a></li>
              <li><a href="#limites" className="text-ink-soft hover:text-ruby transition-colors">Límites</a></li>
            </ul>
          </nav>
        </div>
      </div>
    </div>
  )
}
