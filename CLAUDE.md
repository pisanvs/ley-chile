# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```bash
pip install -r requirements.txt
```

## Running the pipeline

```bash
# Full 4-phase pipeline (idempotent, resumable)
LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py

# Limit to most recent 5 normas (useful for testing)
LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py --limit -5

# Skip completed phases
python scripts/run_pipeline.py --skip-catalog --skip-normas
python scripts/run_pipeline.py --skip-catalog --skip-normas --skip-versions

# Preview commits without importing (build_history only)
LEYCHILE_DATA_ROOT=./historial python scripts/build_history.py --dry-run

# Run in background with ntfy.sh notification
nohup LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py \
    --notify-url https://ntfy.sh/YOUR_TOPIC > pipeline.log 2>&1 &

# Incremental mode (GH Actions style — separate cache worktree):
python scripts/fetch_versions.py --data-root . --cache-dir ./cache --version-budget 5000
python scripts/build_history.py --data-root . --cache-dir ./cache --append --from 2020-01-01 --to 2022-12-31

# Compute watermark (W = last historial commit date, D = highest complete cache date):
python scripts/compute_watermark.py --graph-path ./graph.json --cache-dir ./cache --historial-dir ./historial

# Update README progress bar:
python scripts/update_readme_status.py --readme README.md --graph-path ./graph.json --cache-dir ./cache --historial-dir ./historial
```

## Tests

```bash
python -m pytest                    # all tests
python -m pytest tests/test_compute_watermark.py  # single file (adjust path)
```

Tests cover pure functions only — no network or git calls required.

## Architecture

### Three-Branch Design

- **Code branch** (`claude/graph-first-pipeline`, etc.): scripts, requirements, config, `graph.json`, `catalog.json`. Never contains law data.
- **`pipeline-cache` (orphan branch)**: fetched version data — `cache/versions/`, `cache/diffs/`. Mounted as a git worktree at `./cache/`.
- **`historial` (orphan branch)**: law data commits built by `build_history.py`. Mounted as a git worktree at `./historial/`.

Create the `pipeline-cache` worktree (first time):
```bash
git checkout --orphan pipeline-cache && git rm -rf . && git commit --allow-empty -m "init"
git checkout - && git worktree add cache pipeline-cache
```

Reset `pipeline-cache` to clean orphan (for testing):
```bash
git -C cache checkout --orphan tmp-clean
git -C cache commit --allow-empty -m "init"
git branch -D pipeline-cache
git -C cache branch -m tmp-clean pipeline-cache
```

Create the `historial` worktree (first time):
```bash
git checkout --orphan historial && git rm -rf . && git commit --allow-empty -m "init"
git checkout - && git worktree add historial historial
```

Reset historial to a clean orphan for testing:
```bash
git -C historial checkout --orphan tmp-clean
git -C historial commit --allow-empty -m "init"
git branch -D historial
git -C historial branch -m tmp-clean historial
```

### 4-Phase Pipeline

```
build_catalog.py   → {DATA_ROOT}/catalog.json              (BCN SPARQL — all norma IDs)
fetch_normas.py    → {DATA_ROOT}/graph.json                (LeyChile JSON metadata + BFS expansion)
                     {DATA_ROOT}/cache/normas/{id}.json
fetch_versions.py  → {DATA_ROOT}/cache/diffs/{id}.json     (per-norma version list + article diffs)
                     {DATA_ROOT}/cache/versions/{id}/{fecha}.json
build_history.py   → git fast-import → historial branch
```

`run_pipeline.py` orchestrates all four phases as subprocesses, with ntfy.sh notifications and per-phase skip flags.

### One Commit Per Published Norma (cause-centered model)

Every commit on `historial` represents a **single legislative publication event**. That one commit includes:
- The new law's own `texto.md` + `metadata.json`
- Updated `texto.md` + `metadata.json` for every law it modified
- Derogation deletes + successor symlinks if applicable

Key: `_collect_events()` in `build_history.py` uses an `events_by_cause` dict keyed by `(fecha, causa_id_str)`. Each entry is one `CommitContext`; files from all affected laws accumulate into it via `.files.update(...)`.

### DATA_ROOT Detection

All scripts auto-detect:
1. `LEYCHILE_DATA_ROOT` env var
2. `./historial/` worktree if it exists and has a `.git` file
3. Repo root (fallback)

### CommitContext (utils.py)

Central dataclass shared across all pipeline phases:

```python
@dataclass
class CommitContext:
    tipo: str       # "feat" | "update" | "derog" | "chore"
    scope: str      # "ley" | "modificacion" | "dl" | "dfl" | "cod"
    ley_numero: str
    id_norma: int
    date: str       # YYYY-MM-DD — the publication date of the *causing* norma
    titulo: str
    subject: str    # commit subject line
    body: str
    files: dict     # {git_rel_path: bytes} — mutable, accumulates across affected laws
    deletes: list   # paths to delete (derogations)
    symlinks: dict  # {old_dir: new_dir} for successor redirects
    extra: dict     # enricher-specific data (tramitacion, votaciones)
    _seq: int       # tiebreaker for sort
    _rank: int      # 0=feat, 1=update, 2=derog, 3=chore
```

`sort_key()` returns `(date, ley_numero, _rank, _seq)`.

### BFS Expansion (fetch_normas.py)

After fetching the initial catalog, `fetch_normas.py` runs `_expand_modifiers()`: a BFS loop (max 10 rounds) that fetches any `modificadaPor_edges` IDs not yet in the graph. This ensures every modifier law has its own metadata for `build_history.py` to produce complete commits. Disable with `--no-expand`.

### Enrichers (scripts/enrichers/)

`build_history.py` supports pluggable enrichers that annotate `CommitContext.body` with extra legislative data:
- `tramitacion.py` — parliamentary session data from SIL (Senate + Chamber)
- `votaciones.py` — vote tallies

Enable via `--enrichers tramitacion,votaciones`.

### Law Directory Layout (utils.py → `law_dir()`)

| Type | Path |
|---|---|
| `ley` sustantiva | `leyes/{numero}/` |
| `ley` modificatoria | `modificaciones/{numero}/` |
| `dl` (Decreto Ley 1973–81) | `dl/{numero}/` |
| `dl` pre-1930 | `dl-1924/{numero}/` |
| `dfl`/`dto` | `{slug}/{organismo-slug}/{numero}/` |
| `cod` | `cod/{numero}/` |

Collisions (same `numero`, different `idNorma`) get a `-{idNorma}` suffix.

### Archived Scripts

`scripts/archive/` contains the old pipeline (`trace_graph.py`, `rebuild_history.py`, `build_graph.py`, `fetch_texts.py`, etc.). Tests in `tests/` may still reference these; they are not part of the active pipeline.

## Data Sources

| Source | Endpoint | Rate limit |
|---|---|---|
| BCN SPARQL | `https://datos.bcn.cl/sparql` | — |
| LeyChile norma JSON | `https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma=...` | adaptive |
| LeyChile versioned XML | `https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma={id}&idVersion={YYYY-MM-DD}` | 1 req/s |

**Sentinel date**: LeyChile uses `2222-02-02` for open-ended "current" versions. Filter: `int(date[:4]) <= 2100`.

## Frontend

> **Migration in progress (`feat/railway-ssr`).** The `web/` SPA below is being superseded by the server-rendered `site/` app on Railway (see **Railway SSR** section). Until DNS cuts over to Railway, `web/` remains the live GitHub Pages frontend, so its source must stay buildable — the TypeScript segmentation in `web/src/lib/segment.ts` still has runtime consumers (`blame.ts`, `RedlineReader.tsx`) and must not be deleted before `web/` is retired.

The SPA lives in `web/` (Vite + React 19 + TypeScript + Tailwind 4 + TanStack Router/Query). The deploy target is the orphan `pages` branch, mounted as a worktree at `web/dist/`. GH Pages serves it at `https://pisanvs.github.io/ley-chile/`.

```bash
# Local dev (after pnpm install in web/)
cd web && pnpm dev

# Build SPA locally (writes to web/dist == pages worktree)
cd web && pnpm build

# Run the index builder against the historial worktree
python scripts/build_web_indexes.py \
  --historial ./historial \
  --out web/public \
  --repo pisanvs/ley-chile

# Tests
cd web && pnpm test                              # frontend (Vitest)
python -m pytest tests/test_build_web_indexes.py # index builder (pytest)
```

The `pages` orphan branch is mounted as a worktree at `web/dist/`. **Never `git add web/dist`** from the main checkout — it's a separate branch.

Generated artifacts (gitignored): `web/node_modules/`, `web/public/idx/`, `web/*.tsbuildinfo`, `web/vite.config.{js,d.ts}`, `web/vitest.config.{js,d.ts}`.

CI workflow `.github/workflows/build-pages.yml` rebuilds end-to-end on every `historial` push (or completion of the `pipeline` workflow) and force-pushes to the `pages` branch. Configure GH Pages → Source: `pages` branch / root.

## Railway SSR (`site/` + loader)

Server-rendered port of the frontend (spec: `docs/superpowers/specs/2026-07-09-railway-ssr-port-design.md`). `git` (the `historial` branch) stays the single source of truth; **Postgres and Meilisearch are derived, droppable read models** — rebuilt from snapshot artifacts, never authoritative.

**Data flow.** The pipeline's export step (`scripts/export_snapshot.py`) walks `historial` + `graph.json` into gzipped NDJSON snapshot artifacts (a `manifest.json` + sharded `normas/versions/articulos/spans/mods/events`), published as a GitHub Release. The loader ingests them:

```
export_snapshot.py  → NDJSON artifacts (manifest + shards) → GitHub Release
loader.main         → load → verify → retier → index → revalidate
                      (Postgres read model + Meilisearch hot tier)
site/ (Next.js 16)  → SSR pages + tiered search, on Railway
```

`loader.main` runs the phases in order — **verify before index**, so search never publishes text that failed to reconstruct; **retier before index**, so a norma promoted this run is indexed the same run (indexing reads `index_tier='full'`). It indexes `touched ∪ promoted`, not just the delta.

**Data model.** Schema in `sql/001_schema.sql` (needs `btree_gist`). One `articulo` row per distinct body (deduped by `content_sha256` = sha256 of heading+body); `articulo_span` carries the validity window (`vigencia` daterange) and `ord`, with `EXCLUDE USING gist` forbidding overlapping versions. Segmentation is now **Python only** (`scripts/segment.py`, the single source of truth per spec §6.2); `scripts/spans.py` builds articles/spans; `scripts/schemas/snapshot.py` defines the artifact rows. The **validation gate** (`python -m loader.verify` → `GATE PASSED: every version reconstructs`) is the binary acceptance criterion: it reconstructs each version's canonical text and compares its sha256 to `version.canonical_sha256`.

**Tiered search.** Meilisearch holds the hot tier (`norma.index_tier='full'` — seeded legislation + usage-promoted normas); Postgres `tsvector` FTS is the exhaustive cold path over `index_tier='meta'`. A `cold_surface` event (Meili missed, Postgres hit) drives promotion (`scripts/loader/retier.py`). Analytics live in `analytics.event` (Postgres) with **no user dimension** collected.

**Local dev / running the loader:**

```bash
# Postgres + Meilisearch (Docker)
docker run -d --name leychile-pg -p 5433:5432 -e POSTGRES_PASSWORD=pg postgres:16
docker run -d --name leychile-meili -p 7700:7700 -e MEILI_MASTER_KEY=dev getmeili/meilisearch:v1.12

# Apply schema
psql "$DATABASE_URL" -f sql/001_schema.sql   # or: docker exec -i leychile-pg psql -U postgres < sql/001_schema.sql

# Run the loader against a snapshot artifacts dir
DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres \
MEILI_URL=http://localhost:7700 MEILI_MASTER_KEY=dev \
PYTHONPATH=scripts python -m loader.main --artifacts ./artifacts

# Validation gate
DATABASE_URL=... PYTHONPATH=scripts python -m loader.verify

# The site
cd site && pnpm dev            # dev server
cd site && pnpm build          # standalone production build (Railway target)
cd site && pnpm vitest run && pnpm tsc --noEmit   # tests + typecheck
```

**Loader env:** `DATABASE_URL`, `MEILI_URL`, `MEILI_MASTER_KEY`; `INDEX_BUDGET_BYTES` (hot-tier byte budget, default 4 GiB); `REVALIDATE_URL`/`REVALIDATE_TOKEN` (POST to `site/app/api/revalidate` → `revalidateTag`). **Site env:** `DATABASE_URL`, `MEILI_URL`, `MEILI_SEARCH_KEY`, `SITE_URL`.

**Gotchas.**
- Python tests default to `-m "not integration"`; the DB-backed suite runs only with `DATABASE_URL` set (integration tests skip *silently* without it — confirm the summary says `N passed`, not `N skipped`).
- `git commit` here is GPG-signed; in a sandboxed shell it fails writing `~/.gnupg` — run commits with the sandbox disabled (never `--no-gpg-sign`).
- `site/` pins `typescript` to **5.x** — an unpinned `pnpm add -D typescript` floats to the 7.0.x (`tsgo`) preview, which breaks Next 16's build type-checker. Never paper over it with `ignoreBuildErrors`.
- `pnpm` inside `site/` works only because `site/package.json` declares `"packageManager": "pnpm@9.15.0"` (corepack otherwise honors the yarn pin in `~/package.json`).
- Railway runs the web service as a **single replica** (`use cache` is in-process memory) with app-sleeping off (a 502 to Googlebot on a cold page defeats the port's SEO purpose).

**Known open issue:** under `cacheComponents` (PPR), a request for a non-existent norma returns HTTP **200** with 404 content (a "soft 404") instead of a true 404 — an upstream Next.js bug ([vercel/next.js#95380](https://github.com/vercel/next.js/issues/95380), fix PR #95561). Track upstream and update Next when it merges; a node-runtime middleware existence-gate is a possible interim workaround.
