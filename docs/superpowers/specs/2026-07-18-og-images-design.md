# OG image generation for law pages — design

## Problem

`leyes.pisanvs.cl` (the Next.js 16 SSR port in `site/`) currently ships one
static `app/opengraph-image.png` for every URL. Shared links to a specific
law, guía, or cambios page all render the same generic card in Slack/Twitter/
Discord/iMessage previews — no title, no law identity, nothing that
distinguishes one of ~350k laws from another.

GitHub solves the equivalent problem (`opengraph.githubassets.com`) by
rendering a per-repo card on demand rather than baking one per repo ahead of
time. We do the same thing here using Next's built-in `next/og` /
`ImageResponse` convention, which is only possible on the SSR site — the
static Vite SPA (`web/`, GitHub Pages) has no server to render on request and
was ruled out (pre-baking ~350k static PNGs doesn't scale).

## Scope

Three routes get a custom OG image, each via Next's `opengraph-image.tsx`
file convention (auto-wires `<meta property="og:image">`, no manual
`generateMetadata` change needed):

- `site/app/norma/[id]/[[...rest]]/opengraph-image.tsx` — the canonical law
  page (covers both the undated and dated/versioned URL, since they share one
  route file)
- `site/app/guia/[tipo]/[numero]/opengraph-image.tsx`
- `site/app/cambios/[tipo]/[numero]/opengraph-image.tsx`

Out of scope: `/blog`, `/temas`, `/buscar`, the site root — they keep the
existing static default image.

## Data

All three routes reuse the data-loading helpers the pages already call
(`getNormaById`/`getSeoNorma`, `getVersions`, `getGuiaStats`,
`getModifiedBy`) — no new queries, no new tables. `opengraph-image.tsx` runs
as a separate request from the page itself (crawlers fetch the image URL
independently), so a second DB round-trip per image request is expected and
acceptable; norma rows are small, single-row lookups.

## Shared card renderer

One function, `renderLawCard(props)` in `site/lib/og.tsx`, shared by all
three routes and parameterized by:

| field | source | notes |
|---|---|---|
| `kicker` | route-specific constant | `"LEY"` (norma default), `"GUÍA"` (guia), `"HISTORIAL DE CAMBIOS"` (cambios) |
| `tipo` / `numero` | `norma.tipo` / `norma.numero` | e.g. "LEY · Nº 21.719" |
| `titulo` | `norma.titulo` | wrapped/truncated to fit |
| `organismo` | `norma.organismo` | omitted when empty |
| `fechaPublicacion` | `norma.fechaPublicacion` | formatted via existing `fechaLarga` |
| `estado` | `norma.derogado` | "Vigente" (moss) / "Derogada" (ruby) |
| `versiones` | `versions.length` | stat row |
| `articulos` | `stats.articles` (guía only) | stat row, guía variant only |

Returns JSX consumed by `ImageResponse`. `size = { width: 1200, height: 630 }`
(standard OG dimensions), `contentType = 'image/png'`.

## Fonts

Satori needs real font bytes (not CSS `font-family` names). Load static
`.ttf` instances of Fraunces (display/title) and Inter (labels/meta) — the
site's existing type pairing (`app/globals.css`) — once at module scope in
`site/lib/og.tsx`, read from `site/public/fonts/` or resolved from the
`@fontsource*` packages already in `package.json`.

## Visual direction — 3 candidates

Built and rendered as real PNGs (not mockups) against a real law, for a
side-by-side pick:

1. **Editorial ledger** — warm paper background (`--color-paper`), large
   serif Fraunces headline, thin rule lines, small moss/ruby status dot,
   quiet "ley·chile" wordmark bottom-right. Closest to the site's actual
   reading-room aesthetic.
2. **Ink stamp** — dark ink background (site's dark-mode palette), gold/ruby
   border evoking an official seal, centered composition, monospace stat row
   for versions/articles.
3. **Split card** — left third solid indigo block with tipo/número stacked
   large; right two-thirds paper block with título + meta. More graphic,
   closer to a GitHub repo card at a glance.

The chosen variant becomes the one shipped `renderLawCard` implementation;
the other two are discarded (not kept behind a flag — YAGNI).

## Caching

No explicit `revalidate` override — Next's default caching for `opengraph-image`
applies. Law metadata (título, fecha, organismo) essentially never changes
after publication, so default caching is more than sufficient; no need to
wire this into the existing `revalidateTag` infra used by `/api/revalidate`.

## Testing / verification

- `pnpm build` in `site/` succeeds (type-checks the new files, matches the
  pinned TypeScript 5.x constraint already documented in this repo's
  `CLAUDE.md`).
- Local `curl -o /dev/null -w '%{http_code} %{content_type}\n'` against
  `/norma/{id}/opengraph-image`, `/guia/{tipo}/{numero}/opengraph-image`,
  `/cambios/{tipo}/{numero}/opengraph-image` in dev — expect `200
  image/png`.
- Visual check: open each URL directly in a browser and eyeball composition
  and truncation on long títulos. The rendered PNG is a fixed image (it does
  not switch with OS theme), so contrast and legibility must hold up on
  their own regardless of which palette (light/paper or dark/ink) the chosen
  variant uses.
- No automated snapshot tests for the rendered image (pixel-diffing SVG/PNG
  output is brittle and not how the existing test suite operates); type
  coverage and manual visual check are enough here.
