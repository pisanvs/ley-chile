# ley-chile frontend — design spec

**Date:** 2026-06-08
**Branch:** `feat/frontend` (worktree at `../ley-chile-frontend`)
**Status:** Approved scope; pre-implementation
**Owner:** Max Morel

## 1 · Goal

Ship a static web app that makes the `historial` corpus — every published version of every Chilean law since 1810 — navigable, beautiful, and linkable. The atomic primitive is the **publication event** (one commit = one law published = N existing laws mutated), which the UI projects through two complementary surfaces: a cinematic timeline (the public front door) and a power-user IDE (the workhorse for lawyers, journalists, researchers).

The "wow" is that everything is linked and shareable: every law, every version, every paragraph, every causal edge has a permanent URL, and any of them can be reached from any of the others in one click.

## 2 · Non-goals

- **No backend.** No DB, no auth, no API code. Purely static, deployable to GH Pages.
- **No user-generated content** in v1 (no comments, accounts, annotations, drafting).
- **No native apps.** Responsive web; the IDE collapses to a single-pane stack on narrow viewports.
- **No real-time updates.** The site rebuilds on `historial` push, not while users view it.
- **No bundled law texts.** The SPA never ships law markdown — it points at immutable raw.githubusercontent URLs pinned to commit SHAs.

## 3 · Architecture

Four branches, each with a single responsibility:

```
main          → SPA source, build pipeline scripts, graph.json, catalog.json
historial     → raw law data (already exists; one commit per publication event)
pipeline-cache→ fetched version data (already exists)
pages (NEW)   → built static SPA + precomputed indexes; GH Pages deploy target
```

**Runtime data sources (all free, all CDN-cached):**

| Source | URL pattern | Cacheability |
|---|---|---|
| Built SPA | `pisanvs.github.io/ley-chile/` | Pages CDN |
| Precomputed indexes | `raw.githubusercontent.com/pisanvs/ley-chile/pages/idx/...` | mutable, short TTL |
| Law text at any version | `raw.githubusercontent.com/pisanvs/ley-chile/{SHA}/leyes/20330/texto.md` | **immutable, infinite TTL** |
| Pagefind search shards | `pisanvs.github.io/ley-chile/pagefind/...` | Pages CDN |
| GitHub commit diff fallback | `github.com/pisanvs/ley-chile/commit/{SHA}` | n/a — external link |

The third row is the load-bearing trick: any law version we want to render lives at an immutable URL on GitHub's CDN. The SPA only ships indexes that map `(idNorma, fecha) → commit SHA`.

### 3.1 Precomputed indexes

Built by a new `scripts/build_web_indexes.py` (runs in the `pages`-branch worktree). Sharded so no single file exceeds ~1 MB.

| Index | Path | Shape | Rationale |
|---|---|---|---|
| Per-law version history | `idx/commits/{idNorma}.json` | `[{sha, date, causa_id, subject, magnitude}]` | Drives the IDE version scrubber; one fetch per ley |
| Per-year timeline | `idx/timeline/{YYYY}.json` | `[{date, causa_id, causa_titulo, affected_ids[], n_articulos_changed}]` | Drives Time Machine; one fetch per year viewed |
| Per-law 1-hop graph | `idx/graph/{idNorma}.json` | `{node, in_edges[], out_edges[]}` | Drives right-pane mini-graph |
| Causa (ripple) view | `idx/causa/{idNorma}.json` | `{causa, affected[]}` | Drives `/causa/:id` route |
| Manifest | `idx/manifest.json` | corpus stats, year ranges, featured events, version | Loaded once on app boot |
| Search | `pagefind/` | sharded n-gram index over título + número + body | Lazy-loaded by Pagefind on first query |

### 3.2 Stack

| Concern | Choice | Why |
|---|---|---|
| Build / dev | Vite 6 + React 19 + TypeScript | 100% static, fast DX, no SSR needed |
| Routing | TanStack Router (file-based, type-safe) | Type-safe deep links + search-param state |
| Data fetching | TanStack Query | Caching + dedup of raw.githubusercontent fetches |
| Styling | Tailwind 4 + shadcn/ui | Premium chrome fast, accessible primitives |
| Markdown rendering | `react-markdown` + custom paragraph-alignment pass | Preserves article anchors |
| Diff (word-level) | `diff-match-patch` | Browser-side; well-tested; small |
| Timeline viz | `visx` (D3 primitives, React-friendly) | Custom timeline + heatmap ribbon |
| Graph viz | `sigma.js` + `graphology` | Handles ~1k nodes per neighborhood smoothly |
| Search | **Pagefind** | Index sharded by character n-gram; downloads only what's needed per query. Scales to full-body search across 338k normas without a backend. |
| Theme | CSS variables, light/dark via `prefers-color-scheme` + manual toggle | Standard |

### 3.3 GH Action: `.github/workflows/build-pages.yml`

Triggers: push to `historial` (data update), push to `main` touching `web/**` (SPA update), manual dispatch.

Steps:
1. Checkout `main` (sparse: `web/`, `scripts/build_web_indexes.py`)
2. Checkout `historial` into `./historial` (worktree)
3. Run `python scripts/build_web_indexes.py --historial ./historial --out ./web/public/idx`
4. `cd web && pnpm install && pnpm build`
5. Run `pnpm pagefind --site web/dist` to generate `web/dist/pagefind/`
6. Force-push `web/dist/` contents to `pages` branch
7. GH Pages auto-deploys from `pages`

v1 does full index rebuilds. Incremental rebuilds deferred to v2 (acceptable because Pagefind+JSON shard generation is fast, and Action minutes are free for public repos).

## 4 · Routes

Every surface is deep-linkable; every deep link is shareable.

| Route | Purpose |
|---|---|
| `/` | Time Machine — landing |
| `/ley/:numero` | IDE on a ley, latest version |
| `/ley/:numero/:fecha` | IDE on a ley, specific version |
| `/ley/:numero/:fecha?view=redline\|clean\|source\|side-by-side` | View mode (redline default) |
| `/ley/:numero/:fecha#art-4-bis` | Deep-link to a specific article anchor |
| `/dl/:numero/:fecha?`, `/dl-1924/:numero/:fecha?`, `/dfl/:slug/:organismo/:numero/:fecha?`, `/cod/:numero/:fecha?` | Same IDE for other tipo (matches `law_dir()` layout in `utils.py`) |
| `/causa/:idNorma` | Ripple view: one publication's effects on every law it touched |
| `/buscar?q=becas` | Search results |
| `/año/:YYYY` | Timeline filtered to one year (used internally + shareable) |

## 5 · Surfaces

### 5.1 Landing — The Time Machine (`/`)

A single full-bleed canvas. Minimal nav chrome until the user starts scrolling.

**Top:** oversized hero `1810 — 2026` in Fraunces display, hairline rule, year tick animates up while the user scrolls.

**Year ribbon:** a horizontal heatmap — one column per year, color intensity = count of publication events that year. Draggable scrub handle. Click a year to jump. Hover for count tooltip. Built with visx (`RectClipPath` + a custom interaction layer).

**Vertical feed:** chronological list of publication events, grouped under sticky year separators. Each event card:
- Date · causa título · tipo badge
- Affected-law chips (clickable; opens IDE at that version)
- 4–6 line redline snippet of the article with the densest change (rendered inline from the two raw blobs)

**Featured strip** above the feed: curated in `manifest.json` (e.g., "reforma constitucional 2005", "ley karin", "ley de matrimonio civil"). Three to five hand-picked events that show off the format.

**Density scaling:** the v1 feed starts at 2000-01-01 (the last 25 years are the most legible and most cared-about). Year ribbon and jump-to-year cover the full 1810–2026 range.

### 5.2 Workhorse — The IDE (`/ley/:numero/:fecha?`)

Three panes on desktop. Collapses to stacked sheets on mobile.

**Left · Navigator (240px):**
- Tree by tipo: leyes, dfl, dl, cod
- Filters: year range slider, organismo (multi-select), estado (vigente/derogada)
- Recent + pinned items at top (localStorage)
- Global Cmd-K command bar (search + jump + view-toggle)

**Center · The Law:**
1. **Version scrubber:** horizontal mini-timeline of every version of this law. Each tick colored by edit magnitude (precomputed in `idx/commits/{id}.json`). Click = jump; arrow keys = prev/next.
2. **Reader:** the redline view (default). See §5.3.
3. **Metadata strip below reader:** organismo, fecha publicación, fecha promulgación, estado vigente, enricher panels (tramitación + votaciones when present).

**Right · Graph + lineage (320px):**
- 1-hop sigma.js graph: this law in the center, modifiers fanning in, modificadas fanning out
- "Causa de esta versión" card: which publication triggered this specific version; click to jump to `/causa/:id`
- Counts: "modificada por 4 leyes", "modifica 7 leyes"

### 5.3 The redline reader

Default diff format. Renders the full document as flowing prose with inline tracked changes.

- **Word-level diff** inside paragraphs via `diff-match-patch`
- **Article-aware paragraph alignment:** before diffing, both versions are segmented by article heading; aligned articles diff against each other; new articles render as full green-bordered blocks; deleted articles as full red-bordered blocks
- **Visual encoding:** deletions in strikethrough ruby `#c5283d` on light-red wash; insertions underlined moss `#3f6634` on light-green wash; both rendered inline so the document reads as narrative
- **Provenance hover:** every `<ins>` and `<del>` knows its causa (from `idx/commits/`). Hover reveals "added by Ley 20.808, art. 3" with a link.
- **Right gutter:** cumulative change-count badge per article (e.g., "+12 / -4 words")

**View toggle (top-right of center pane):**
- **Redline** — default
- **Clean** — just the current version, rendered, no markup
- **Source** — github-style hunks (debug / power user)
- **Side-by-side** — two columns, articles aligned

v1 ships Redline + Clean. Source + Side-by-side deferred to v2.

### 5.4 Cmd-K command bar

Global, opens on `Cmd/Ctrl-K`. Supports:
- **Jump:** type a número → "Ley 20.330" → opens IDE
- **Search:** any text → Pagefind results, inline
- **Year jump:** type `1973` → "Saltar a 1973" → opens Time Machine at that year
- **View toggle:** `redline` / `clean` / `source` while in IDE
- **Theme:** `dark` / `light`

Recent commands persisted in localStorage.

### 5.5 Cross-linking (the magic)

Every legal reference detected in body text (`"...modificada por la ley 19.876..."`, `"art. 5 del DFL 850"`) becomes a hover-card. The same atomic widget — mini version-scrubber + jump link — appears everywhere an entity is referenced. Detection done at *build time* by a regex pass in `build_web_indexes.py`, emitted as inline `<a data-norma="...">` in the rendered markdown.

## 6 · Visual identity

**Direction:** Editorial × Archive. *NYT The Upshot* meets *The Pudding* meets 19th-century gazette. Confident typography; restrained chrome; content carries the weight.

| | |
|---|---|
| **Display type** | Fraunces (variable serif, opsz axis) |
| **Body / law text** | Lora (serif, designed for long-form readability) |
| **UI** | Inter Tight |
| **Mono** | JetBrains Mono |
| **Paper** | `#fbf8f1` (light) · `#0e1116` (dark) |
| **Ink** | `#171513` (light) · `#ece8df` (dark) |
| **Ruby (deletion / Chilean flag echo)** | `#c5283d` |
| **Moss (insertion)** | `#3f6634` |
| **Indigo (interactive)** | `#1d3557` |
| **Gold (featured)** | `#c9a227` |
| **Texture** | Subtle paper-grain SVG behind reader pane; thin 1px rules; hairline borders; generous margins; no drop-shadows except on graph nodes |
| **Motion** | Slow, deliberate easings. Timeline scrub: ease-out 240ms. Redline transitions: fade-in 180ms. No springs. `prefers-reduced-motion` respected. |
| **Density** | Reader column 720px max with generous line-height; chrome tight and mono-flavored. Reader = book; chrome = tool. |

Light + dark themes ship v1.

## 7 · Performance budget

- Initial route (`/`) JS: < 180 KB gzipped (excluding sigma.js, lazy-loaded)
- Largest Contentful Paint on `/`: < 1.5s on 4G
- Time Machine year-jump: < 200ms (single JSON fetch + render)
- IDE first paint on `/ley/:n`: < 400ms (manifest cached, commits index lazy)
- Pagefind first query: < 500ms (n-gram shards fetched on demand)
- Redline render of a typical-sized law version diff: < 150ms client-side

## 8 · MVP scope (v1)

**In:**
- Time Machine landing, year ribbon, event feed (2000+ initially; ribbon covers full range)
- IDE three-pane on `/ley/:numero/:fecha?` and equivalents for dl/dfl/cod
- Redline + Clean diff views
- Cmd-K command bar
- Pagefind full-body search
- 1-hop mini-graph (sigma.js)
- Tramitación + votaciones enricher panels (when present in metadata)
- Spanish UI
- Light + dark themes
- `build-pages.yml` Action: full rebuild on historial push
- Responsive layout (IDE collapses to single-pane on mobile)

**Deferred (v2+):**
- Topic Atlas (the "C" metaphor from brainstorming)
- Full-screen graph view `/grafo/...` with multi-hop traversal
- Side-by-side + Source diff views
- Incremental index rebuilds
- English bilingual
- Print stylesheet
- Pre-2000 event-feed density (depends on historial completeness)

## 9 · Risks & open questions

| Risk | Mitigation |
|---|---|
| `idx/commits/{idNorma}.json` may grow large for highly-amended laws (e.g., Código Civil) | Cap per-file at 5k entries; shard further if exceeded |
| Pagefind index size at full corpus scale | Pagefind shards by n-gram; expected total < 200 MB on `pages` branch, only 100–300 KB downloaded per query |
| GitHub raw rate limits on heavily-trafficked law versions | Mitigated by CDN cache hits (immutable SHAs); if needed, ship a thin Cloudflare Worker as a transparent cache later |
| Cross-link regex producing false positives in body text | Build-time pass logs unmatched candidates; spot-check via a `/_debug/links` page in v2 |
| Build time of full index rebuild | Acceptable in v1; if Action exceeds 6h budget, switch to per-year shard rebuilds in v2 |

## 10 · Acceptance criteria

v1 ships when:
- [ ] `https://pisanvs.github.io/ley-chile/` loads the Time Machine
- [ ] At least 5 curated featured events render with redline snippets
- [ ] Any `/ley/:n/:fecha` URL deep-links into the IDE with redline reader
- [ ] Cmd-K jumps to a ley by número in ≤ 2 keystrokes-to-result
- [ ] Pagefind returns body-text results for at least 3 representative queries
- [ ] `build-pages.yml` rebuilds the site end-to-end on a `historial` push in CI
- [ ] Lighthouse score ≥ 90 on `/` (perf, a11y, best-practices)
- [ ] Dark theme passes WCAG AA on body text
