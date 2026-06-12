# Copy & SEO — Design Spec
_2026-06-12_

## Context

ley·chile is two things:

1. **A git repository** — the entire Chilean legislative corpus as a git history (one commit per legislative publication event). This is unique in the world: nobody else has done this with Chilean law. Valuable for developers, researchers, and LLM pipelines.
2. **A web UI** — a frontend for the git repo because GitHub can't handle pre-1970 dates and can't load thousands of files. Also makes the repo accessible to non-technical users (lawyers, students, journalists).

Data source: Biblioteca del Congreso Nacional (BCN), which publishes all Chilean law via an open API. BCN has the data; what it doesn't have is a readable way to explore it.

### Three core use cases for the web UI

1. **Read modification laws** — when a law modifies another, BCN shows you the modifying law as prose. ley·chile shows you the diff: exactly what changed, line by line.
2. **Compare versions of the same law** — pick any two dates and see what a law looked like at each point, side by side or as a redline.
3. **Track legal evolution (historiographic)** — a time machine for Chilean law. Understand how legislation has evolved since promulgation — useful for historians, journalists, researchers, and policy analysts.

This historiographic purpose is one of the most distinctive angles: ley·chile is not just a better reader, it's a historical record.

---

## Brand & Voice

### Tagline (canonical)
```
El corpus jurídico chileno, en formato amigable.
Para agentes y humanos.
```

"Para agentes y humanos" signals LLM/AI readiness without alienating non-techies. Both audiences find it intriguing for different reasons.

### Voice principles
- Plain language first — the problem being solved is that law is unreadable. The copy can't be either.
- BCN as trust signal — "datos oficiales de la BCN" answers "¿puedo confiar en esto?" immediately.
- Git metaphor for developers, diff metaphor for everyone else — "diff" needs no explanation; "git repo" only appears in the developer callout.
- Time machine framing for the historiographic angle — "¿Qué decía esta ley en 2005?" is more evocative than "historial de versiones".
- Two audiences, one page — non-techies read straight through; devs find the git callout.

---

## Copy Changes

### `index.html` `<title>`
```
ley·chile — El corpus jurídico chileno
```

### Site-wide `<meta name="description">`
```
Leyes, decretos y códigos de Chile con diff visual entre versiones,
historial completo y comparación en cualquier fecha. Datos oficiales
de la BCN. Para humanos y agentes.
```

### Homepage — replaces current placeholder

**H1:**
```
El corpus jurídico chileno, en formato amigable.
```

**Sub:**
```
La BCN publica todas las leyes de Chile. Pero cuando una ley
modifica a otra, leer el cambio es casi imposible — y volver
atrás en el tiempo para ver cómo era antes, directamente imposible.
ley·chile lo convierte en algo legible.
```

**Feature highlights (3 pills):**
- `Diff visual` — ve exactamente qué cambió entre versiones
- `Máquina del tiempo` — ¿qué decía esta ley en 2005? Viaja a cualquier fecha
- `Modificaciones cruzadas` — qué leyes modificó, quién la modificó

**Developer callout (subtle, below the fold):**
```
¿Desarrollador o investigador?

Todo el corpus está disponible como repositorio git —
cada publicación legislativa es un commit con metadatos completos.
Ideal para pipelines, análisis y agentes.

[Ver repositorio en GitHub →]
```

**Footer attribution:**
```
Datos: Biblioteca del Congreso Nacional (BCN)  ·  Actualización semanal
```

---

### Per-law page — `<title>` (dynamic, set via TanStack Router head)
```
{Tipo} N° {numero} — {titulo truncado a 60 chars} | ley·chile
```
Example: `Ley N° 20.720 — Supresión del régimen de quiebras y... | ley·chile`

### Per-law page — `<meta name="description">` (dynamic)
```
{Tipo} N° {numero} — texto en cualquier fecha desde {fechaPublicacion},
con diff visual entre versiones. {N} publicaciones registradas. Datos BCN.
```

### Per-law page — JSON-LD structured data
```json
{
  "@context": "https://schema.org",
  "@type": "Legislation",
  "name": "{Tipo} N° {numero}",
  "alternateName": "{titulo}",
  "legislationIdentifier": "{numero}",
  "datePublished": "{fechaPublicacion}",
  "jurisdiction": {
    "@type": "AdministrativeArea",
    "name": "Chile"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Biblioteca del Congreso Nacional de Chile",
    "url": "https://www.bcn.cl"
  },
  "url": "https://pisanvs.github.io/ley-chile/ley/{idNorma}/{fecha}"
}
```

---

## UI Microcopy Changes

| Location | Before | After | Note |
|---|---|---|---|
| Viewer mode: redline | `Redline` | `Tachado` | Tooltip: *vista redline* |
| Viewer mode: side-by-side | `Lado a lado` | `Paralelo` | Shorter |
| Viewer mode: clean | `Limpio` | `Texto limpio` | Clearer intent |
| Viewer mode: source | `Fuente` | `Markdown` | Accurate (it IS markdown) |
| Background tab action | `⤴ segundo plano` | `Abrir sin saltar` | Clear affordance |
| Chronology link | `causa →` | `ley origen →` | Less jargon |
| Bulk open primary CTA | `Abrir + saltar →` | `Abrir y navegar` | Consistent tone |
| Citation footer | `Via ley·chile (BCN, ...)` | `ley·chile · Biblioteca del Congreso Nacional (BCN)` | Spell out acronym |
| Header tagline | `corpus jurídico en vivo` | `El corpus jurídico chileno, en formato amigable.` | Mission-aligned |
| Homepage | `Time Machine landing arrives in Plan 4...` | *(replaced by real homepage copy above)* | Dev note in production — remove |
| Homepage link | `idNorma 20330 (latest version)` | *(absorbed into real homepage)* | Internal ID exposed |

---

## Technical SEO Additions

### `robots.txt` (new file at `web/public/robots.txt`)
```
User-agent: *
Allow: /

Sitemap: https://pisanvs.github.io/ley-chile/sitemap.xml
```

### `sitemap.xml`
Generated at build time by a new script `scripts/build_sitemap.py` that reads `catalog.json`.

Format:
```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://pisanvs.github.io/ley-chile/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://pisanvs.github.io/ley-chile/ley/{idNorma}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- one entry per norma in catalog.json -->
</urlset>
```

### Open Graph tags (added to per-page `<head>` via TanStack Router)
```html
<meta property="og:title" content="{Tipo} N° {numero} | ley·chile" />
<meta property="og:description" content="Texto vigente con diff visual e historial. Datos BCN." />
<meta property="og:type" content="article" />
<meta property="og:url" content="https://pisanvs.github.io/ley-chile/ley/{id}/{fecha}" />
<meta name="twitter:card" content="summary" />
```

### `<link rel="canonical">` (per route)
Prevents duplicate indexing of `?` query variants.

---

## Out of scope (future)

Three content/distribution ideas to revisit separately:

1. **Programmatic SEO pages** — static HTML per law × date ("Código del Trabajo en 2010", "Cómo cambió la ley X en 2019"). Requires migrating the SPA to SSG (e.g. Astro or Vite SSG). High SEO impact, significant architectural change.
2. **Instagram content agent** — daily Claude pipeline that finds interesting law changes in the git history, writes a post, generates an image, posts via Instagram Graph API.
3. **Blog** — long-form AI-drafted content about legal evolution: most-amended laws, biggest changes by year, historically significant modifications.

Each is an independent subsystem with its own spec/plan.

---

## Implementation scope

1. **`web/index.html`** — update `<title>` and add base `<meta>` tags
2. **`web/src/routes/index.tsx`** — replace placeholder with real homepage
3. **`web/src/routes/__root.tsx`** — add `robots` meta, canonical, OG base
4. **`web/src/routes/ley.$numero.$fecha.tsx`** — dynamic `<title>`, `<meta description>`, OG tags, JSON-LD
5. **`web/src/components/RightRail.tsx`** — tab label copy changes
6. **`web/src/components/ModificationsPanel.tsx`** — "Abrir + saltar →" → "Abrir y navegar"
7. **`web/src/components/ModifiedByPanel.tsx`** — "ver cambio →" stays (already clear), "causa →" in ChronologyPanel
8. **`web/src/components/ChronologyPanel.tsx`** — "causa →" → "ley origen →"
9. **`web/src/routes/ley.$numero.$fecha.tsx`** — mode labels, "⤴ segundo plano", citation footer
10. **`web/public/robots.txt`** — new file
11. **`scripts/build_sitemap.py`** — new script, reads catalog.json, writes web/public/sitemap.xml
12. **CI workflow** — add sitemap build step after catalog is updated
