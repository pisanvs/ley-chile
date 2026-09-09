# LeyChile API

A read-only JSON API over the Chilean legal corpus — 333,026 normas, every
historical version of each, and the modification graph between them.

**Base URL:** `https://leyes.pisanvs.cl/api/v1`

There is also an [MCP server](https://leyes.pisanvs.cl/api/mcp) over the same
data, for language models. It returns prose; this API returns JSON.

## Authentication

Every endpoint requires a key:

```
Authorization: Bearer lc_live_…
```

Keys are issued by hand — ask the operator. A missing, unknown or revoked key
returns `401`.

```bash
curl -H "Authorization: Bearer $LEYCHILE_KEY" \
  'https://leyes.pisanvs.cl/api/v1/search?q=medio+ambiente'
```

## `idNorma` is the identifier that works

**`(tipo, numero)` does not identify a Chilean norma.** There are 227 `DFL 1`,
75 `DFL 4` and 525 `DTO 1`, from different organismos and years. Worse, an
internal `idNorma` can coincide with an unrelated law's `numero` — `/ley/20780`
once resolved to a decreto whose `idNorma` happened to be 20780.

So every endpoint addresses normas by `idNorma`, and a citation lookup returns
**every** candidate rather than guessing:

```bash
curl -H "Authorization: Bearer $KEY" \
  'https://leyes.pisanvs.cl/api/v1/search?tipo=dfl&numero=1'
```

Pick the one you meant from `idNorma` + `organismo`, then use `idNorma` for
everything after.

## Endpoints

### `GET /search`

Free text (`q`, 2+ characters) or citation (`tipo` + `numero`).

| parameter | |
|---|---|
| `q` | search terms, minimum 2 characters |
| `tipo` + `numero` | citation lookup; returns all candidates |
| `asOf` | `YYYY-MM-DD`, defaults to today — searches the text in force on that date |
| `limit` | 1–100, default 20 (free-text only; a citation always returns every candidate) |

```bash
curl -H "Authorization: Bearer $KEY" \
  'https://leyes.pisanvs.cl/api/v1/search?q=partidos+politicos&limit=2'
```

```json
{
  "query": "partidos politicos",
  "asOf": "2026-09-09",
  "total": 2,
  "resultados": [
    {
      "idNorma": 29994,
      "tipo": "ley",
      "numero": "18603",
      "titulo": "LEY ORGANICA CONSTITUCIONAL DE LOS PARTIDOS POLITICOS",
      "organismo": "MINISTERIO DEL INTERIOR"
    }
  ]
}
```

### `GET /normas/{idNorma}`

Metadata plus an article **index**. Never article bodies — a single norma can
be ~350 KB, so bodies are fetched one at a time.

```json
{
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
}
```

`fecha` is the version described. Pass `?fecha=YYYY-MM-DD` for a historical one.

### `GET /normas/{idNorma}/articulos`

The article index at a date. With `q` (2+ chars) it searches **inside** the
norma and returns only matching articles, each with a `snippet` marked up with
`<b>` around the hit — the way to find the relevant article of a code with
hundreds of them without downloading its text.

```bash
curl -H "Authorization: Bearer $KEY" \
  'https://leyes.pisanvs.cl/api/v1/normas/29994/articulos?q=militante'
```

### `GET /normas/{idNorma}/articulos/{slug}`

One article body.

```json
{
  "idNorma": 29994, "fecha": "2016-04-15",
  "slug": "art-1", "label": "articulo 1", "rawHeading": "Artículo 1º",
  "body": "Los partidos políticos son asociaciones autónomas y voluntarias…",
  "truncado": false,
  "largoCompleto": 970
}
```

Bodies are capped at 12,000 characters. When `truncado` is `true` the text is
incomplete and `largoCompleto` gives the real length — never treat a truncated
article as the whole provision.

### `GET /normas/{idNorma}/versiones`

Every version, with the window each was in force.

```json
{
  "idNorma": 29994, "vigente": "2016-04-15", "total": 6,
  "versiones": [
    { "desde": "1987-03-23", "hasta": "2011-10-16", "causaId": null, "subject": "…" }
  ]
}
```

`desde` values are the dates to pass as `fecha`, `from` and `to` elsewhere.

### `GET /normas/{idNorma}/diff?from=&to=`

What changed between two versions — the question this corpus exists to answer.
Both dates are required.

```json
{
  "idNorma": 29994, "from": "2015-05-05", "to": "2016-04-15",
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
}
```

`estado` is `modificado`, `añadido` or `eliminado`. A norma that did not change
returns `200` with an empty `cambios` array — that is an answer, not an error.

### `GET /normas/{idNorma}/modificaciones`

Both directions of the modification graph. Every entry carries `idNorma`, so
you never have to resolve an ambiguous citation.

```json
{
  "idNorma": 29994,
  "modifica": [],
  "modificadaPor": [
    { "idNorma": 1089164, "tipo": "ley", "numero": "20915",
      "titulo": "FORTALECE EL CARÁCTER PÚBLICO Y DEMOCRÁTICO…", "fecha": "2016-04-15" }
  ]
}
```

### `GET /normas/{idNorma}/raw?fecha=`

Canonical links to the authoritative source at leychile.cl, for citing or
verifying.

## Errors

```json
{ "error": { "code": "invalid_api_key", "message": "…" } }
```

| status | meaning |
|---|---|
| `400` | malformed `idNorma` or date, or a missing required parameter |
| `401` | missing, malformed, unknown or revoked key |
| `404` | no such norma, article or version |
| `503` | the service is temporarily unavailable |

An empty `resultados` or `cambios` array means **nothing matched**. It never
means the service is broken — that is always a `4xx` or `5xx`.

Dates must be real calendar dates: `2026-02-31` is a `400`, not a silent
substitution.

## Caching

Norma, article and version reads carry an `ETag` and
`Cache-Control: private, max-age=300`. Send the ETag back as `If-None-Match` to
get a `304` and skip the payload:

```bash
curl -H "Authorization: Bearer $KEY" -H 'If-None-Match: "82b8be35…"' \
  'https://leyes.pisanvs.cl/api/v1/normas/29994'
```

`private` is deliberate: responses sit behind an `Authorization` header and must
not be stored by a shared cache. Search results are not cached.

## What is logged

Per request: **the API key, the route template, the HTTP status, the duration,
and the timestamp.**

**Not logged:** your search terms, which norma or article you requested, your IP
address, or your user agent.

The route template is stored — `/v1/normas/{idNorma}` — never the concrete path.
That is deliberate: recording `/v1/normas/29994` would build a record of which
laws a given key holder reads, and this API does not keep that. Usage rows are
deleted after **90 days**.

The corpus itself is public and collects no user dimension; the API key exists
so the operator can see call volume and revoke abuse, not to track reading.

## Limits

No rate limit or quota is enforced today. That may change as traffic grows, and
would be announced before it does. Be reasonable: the corpus is 333k normas
served by one small instance.

## Notes

- Field names use Spanish domain terms (`titulo`, `numero`, `articulos`,
  `versiones`). `norma`, `dfl` and `dto` have no honest English equivalents.
- Every endpoint is `GET` and read-only.
- No CORS headers are sent, so browsers cannot call this cross-origin. It is
  built for server-to-server use.
- The data is derived from leychile.cl and rebuilt from a git history of the
  corpus; `/raw` links back to the authoritative source.
