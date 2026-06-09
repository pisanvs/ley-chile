# Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the static-site foundation for the ley-chile frontend — Vite/React/TS scaffold, an index-build script that reads from the `historial` worktree, a `pages` deploy branch wired to GH Pages, a GH Action that rebuilds end-to-end, and a working `/ley/:numero/:fecha?` route that renders any law version's clean text using immutable `raw.githubusercontent` URLs.

**Architecture:** Frontend lives in `web/` on `main` (this branch: `feat/frontend`). A new Python script `scripts/build_web_indexes.py` walks the `historial` worktree and emits sharded JSON indexes under `web/public/idx/`. Vite builds the SPA against those indexes. A new orphan `pages` branch is the deploy target; a new GH Action `build-pages.yml` force-pushes built output to it on every `historial` update. The SPA fetches law text on-demand from `raw.githubusercontent.com` pinned to commit SHAs (immutable, infinite CDN cache).

**Tech Stack:** Vite 6 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · TanStack Router · TanStack Query · react-markdown · pnpm · pytest (existing) · Vitest + React Testing Library (new).

**Spec:** [`../specs/2026-06-08-frontend-design.md`](../specs/2026-06-08-frontend-design.md)

**Out of scope for this plan** (covered by later plans):
- Redline diff reader (Plan 2)
- Right-pane mini-graph + cross-linking (Plan 3)
- Time Machine landing + year ribbon (Plan 4)
- Cmd-K + Pagefind search + theming polish (Plan 5)

---

## File Structure

| Path | Responsibility |
|---|---|
| `web/package.json` | Frontend deps + scripts |
| `web/vite.config.ts` | Vite config, alias `@/` → `web/src/` |
| `web/tsconfig.json` | TS config |
| `web/tailwind.config.ts`, `web/postcss.config.js`, `web/src/index.css` | Tailwind 4 setup |
| `web/components.json` | shadcn registry config |
| `web/index.html` | SPA entry HTML |
| `web/src/main.tsx` | React root + router bootstrap |
| `web/src/routes/__root.tsx` | Root route (layout shell + manifest provider) |
| `web/src/routes/ley.$numero.$fecha.tsx` | IDE route — `/ley/:numero/:fecha?` |
| `web/src/lib/manifest.ts` | Manifest loader + types |
| `web/src/lib/commits.ts` | Per-law commits index loader + types |
| `web/src/lib/rawtext.ts` | Fetch `texto.md` from raw.githubusercontent at pinned SHA |
| `web/src/lib/datasource.ts` | Centralizes data-source URL config (env-driven) |
| `web/src/components/IDEShell.tsx` | Three-pane layout (placeholders for left/right) |
| `web/src/components/VersionScrubber.tsx` | Horizontal version timeline tick row |
| `web/src/components/CleanReader.tsx` | Renders `texto.md` via react-markdown |
| `web/src/components/ui/*` | shadcn primitives (button, skeleton, badge) |
| `web/vitest.config.ts` | Vitest config |
| `web/src/test/setup.ts` | RTL + jsdom setup |
| `web/src/**/*.test.ts(x)` | Unit tests, colocated |
| `scripts/build_web_indexes.py` | Walks historial worktree → emits manifest + commits shards |
| `tests/test_build_web_indexes.py` | Pytest for pure functions in the script |
| `.github/workflows/build-pages.yml` | Build indexes → build SPA → force-push to `pages` |
| `CLAUDE.md` | Add a "Frontend" section documenting `web/` + `pages` branch |

---

## Task 1: Create `pages` orphan branch and wire as a worktree under `web/dist`

**Files:**
- Create branch: `pages` (orphan)
- Modify: `.gitignore` — ensure `web/dist/` not ignored when it's a worktree mount; ensure `web/node_modules/` ignored

This task happens once on the user's machine to set up the same three-worktree pattern already used for `historial` and `pipeline-cache`.

- [ ] **Step 1: Create the orphan `pages` branch**

From `/home/pisanvs/code/ley-chile-frontend` (the `feat/frontend` worktree):

```bash
cd /home/pisanvs/code/ley-chile-frontend
git fetch origin
# Branch may already exist on remote; check first
if git ls-remote --exit-code --heads origin pages >/dev/null 2>&1; then
  git worktree add web/dist pages
else
  # Create orphan branch in the MAIN checkout (not this worktree) and add as worktree here
  git -C /home/pisanvs/code/ley-chile checkout --orphan pages
  git -C /home/pisanvs/code/ley-chile rm -rf . 2>/dev/null || true
  git -C /home/pisanvs/code/ley-chile commit --allow-empty -m "init pages"
  git -C /home/pisanvs/code/ley-chile checkout main
  git worktree add web/dist pages
fi
```

Expected: `web/dist/` is a git worktree on branch `pages`.

- [ ] **Step 2: Add `.gitignore` rules**

Read the existing `.gitignore` first:

```bash
cat /home/pisanvs/code/ley-chile-frontend/.gitignore
```

Append (only if not already present):

```
# Frontend
web/node_modules/
web/.vite/
web/dist-ssr/
# NOTE: web/dist/ is a git worktree on the `pages` branch — DO NOT ignore
```

- [ ] **Step 3: Commit `.gitignore` change**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add .gitignore
git commit -m "chore: ignore web/node_modules and vite caches, keep web/dist as worktree"
```

---

## Task 2: Scaffold the Vite + React + TS app under `web/`

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`, `web/tsconfig.node.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`
- Create: `web/.gitignore`

- [ ] **Step 1: Initialize package.json**

Create `/home/pisanvs/code/ley-chile-frontend/web/package.json`:

```json
{
  "name": "ley-chile-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings=0"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-router": "^1.95.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0"
  },
  "devDependencies": {
    "@tanstack/router-plugin": "^1.95.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

Note: pin to current latest available at install time; if Tailwind 4 isn't stable yet when this runs, fall back to Tailwind 3 — adjust both the dep and the CSS import in Step 5.

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Also create `web/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'node:path'

// The site is hosted at https://pisanvs.github.io/ley-chile/ — set base accordingly.
const BASE = process.env.VITE_BASE ?? '/ley-chile/'

export default defineConfig({
  base: BASE,
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ley-chile · corpus jurídico chileno en vivo</title>
    <link rel="preconnect" href="https://raw.githubusercontent.com" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/src/index.css` + Tailwind config**

`web/src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-paper: #fbf8f1;
  --color-ink: #171513;
  --color-ruby: #c5283d;
  --color-moss: #3f6634;
  --color-indigo: #1d3557;
  --color-gold: #c9a227;

  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Lora", Georgia, serif;
  --font-ui: "Inter Tight", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

html { background: var(--color-paper); color: var(--color-ink); }
body { font-family: var(--font-ui); }
```

If Tailwind 4 isn't available, use Tailwind 3:
- Replace `@import "tailwindcss";` with `@tailwind base; @tailwind components; @tailwind utilities;`
- Add `web/tailwind.config.ts` per Tailwind 3 conventions with the same theme tokens.

- [ ] **Step 6: Create `web/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 60 * 24, gcTime: 1000 * 60 * 60 * 24 },
  },
})

const router = createRouter({ routeTree, context: { queryClient } })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 7: Install deps**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web
corepack enable
pnpm install
```

Expected: pnpm installs all deps without errors. `routeTree.gen.ts` will exist after Task 3 generates routes.

- [ ] **Step 8: Commit**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add web/ -- ':!web/node_modules' ':!web/dist'
git commit -m "feat(web): vite + react + ts + tailwind scaffold"
```

---

## Task 3: Add file-based routes (root + IDE skeleton)

**Files:**
- Create: `web/src/routes/__root.tsx`
- Create: `web/src/routes/index.tsx` (Time Machine placeholder)
- Create: `web/src/routes/ley.$numero.$fecha.tsx`
- Generated: `web/src/routeTree.gen.ts` (auto by plugin)

- [ ] **Step 1: Create `web/src/routes/__root.tsx`**

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink/10 px-6 py-3 flex items-center gap-4">
        <a href="/ley-chile/" className="font-display text-lg tracking-tight">
          ley<span className="text-ruby">·</span>chile
        </a>
        <span className="text-xs uppercase tracking-widest opacity-50">
          corpus jurídico en vivo
        </span>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  ),
})
```

- [ ] **Step 2: Create `web/src/routes/index.tsx` (Time Machine placeholder)**

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-12 max-w-3xl mx-auto">
      <h1 className="font-display text-5xl mb-4">El corpus jurídico chileno, en vivo.</h1>
      <p className="opacity-70">Time Machine landing arrives in Plan 4. Try a law directly:</p>
      <ul className="list-disc list-inside mt-4 space-y-1">
        <li><a className="text-indigo underline" href="/ley-chile/ley/20330">Ley 20.330 (latest)</a></li>
      </ul>
    </div>
  ),
})
```

- [ ] **Step 3: Create `web/src/routes/ley.$numero.$fecha.tsx` (placeholder)**

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/ley/$numero/$fecha')({
  component: () => <div className="p-8">IDE shell coming in Task 7.</div>,
})
```

Also create a `web/src/routes/ley.$numero.index.tsx` to handle the bare `/ley/:numero` (latest version):

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/ley/$numero/')({
  component: () => <div className="p-8">IDE shell (latest version) coming in Task 7.</div>,
})
```

- [ ] **Step 4: Run dev server and verify routes render**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web
pnpm dev
```

Expected: dev server boots; `http://localhost:5173/ley-chile/` shows the landing placeholder; `http://localhost:5173/ley-chile/ley/20330` shows the IDE placeholder. Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add web/src/routes/ web/src/routeTree.gen.ts
git commit -m "feat(web): file-based routing scaffold with placeholders"
```

---

## Task 4: Write pure-function helpers for the index builder (TDD)

**Files:**
- Create: `scripts/build_web_indexes.py`
- Create: `tests/test_build_web_indexes.py`

Per project convention (CLAUDE.md): tests cover pure functions only; no git or network calls.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_build_web_indexes.py`:

```python
"""Pure-function tests for scripts/build_web_indexes.py."""
from __future__ import annotations
import json
import pytest
from pathlib import Path

from scripts.build_web_indexes import (
    parse_metadata,
    raw_text_url,
    commits_index_path,
    Commit,
    aggregate_manifest,
)


def test_parse_metadata_extracts_norma_fields():
    meta = {
        "idNorma": 1234,
        "numero": "20.330",
        "tipo": "ley",
        "titulo": "Becas Bicentenario",
        "organismo": "Ministerio de Educación",
        "fechaPublicacion": "2009-03-15",
    }
    parsed = parse_metadata(meta)
    assert parsed.id_norma == 1234
    assert parsed.numero == "20.330"
    assert parsed.tipo == "ley"
    assert parsed.titulo == "Becas Bicentenario"
    assert parsed.organismo == "Ministerio de Educación"
    assert parsed.fecha_publicacion == "2009-03-15"


def test_raw_text_url_pins_to_sha():
    url = raw_text_url(
        repo="pisanvs/ley-chile",
        sha="abc123def",
        rel_path="leyes/20330/texto.md",
    )
    assert url == "https://raw.githubusercontent.com/pisanvs/ley-chile/abc123def/leyes/20330/texto.md"


def test_commits_index_path_shards_by_id():
    p = commits_index_path(Path("/out"), id_norma=20330)
    assert p == Path("/out/idx/commits/20330.json")


def test_aggregate_manifest_counts_and_year_range():
    commits = {
        1: [
            Commit(sha="a", date="2009-03-15", causa_id=1, subject="x", magnitude=10),
            Commit(sha="b", date="2015-06-01", causa_id=2, subject="y", magnitude=5),
        ],
        2: [
            Commit(sha="c", date="1973-09-11", causa_id=3, subject="z", magnitude=1),
        ],
    }
    m = aggregate_manifest(commits, repo="pisanvs/ley-chile")
    assert m["repo"] == "pisanvs/ley-chile"
    assert m["normas_count"] == 2
    assert m["versions_count"] == 3
    assert m["year_min"] == 1973
    assert m["year_max"] == 2015


def test_aggregate_manifest_handles_empty():
    m = aggregate_manifest({}, repo="pisanvs/ley-chile")
    assert m["normas_count"] == 0
    assert m["versions_count"] == 0
    assert m["year_min"] is None
    assert m["year_max"] is None
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd /home/pisanvs/code/ley-chile-frontend
python -m pytest tests/test_build_web_indexes.py -v
```

Expected: ImportError / ModuleNotFoundError on `scripts.build_web_indexes`.

- [ ] **Step 3: Implement the pure functions**

Create `scripts/build_web_indexes.py`:

```python
"""Build static SPA indexes from the historial worktree.

This module exposes pure functions tested in tests/test_build_web_indexes.py
plus a CLI entry point that performs filesystem + git reads.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class NormaMetadata:
    id_norma: int
    numero: str
    tipo: str
    titulo: str
    organismo: str
    fecha_publicacion: str


@dataclass(frozen=True)
class Commit:
    sha: str
    date: str          # YYYY-MM-DD
    causa_id: int      # idNorma of the law that caused this version
    subject: str
    magnitude: int     # lines changed in this version's diff (rough)


def parse_metadata(meta: dict[str, Any]) -> NormaMetadata:
    """Project a metadata.json dict onto the typed shape used by the index builder."""
    return NormaMetadata(
        id_norma=int(meta["idNorma"]),
        numero=str(meta.get("numero", "")),
        tipo=str(meta.get("tipo", "")),
        titulo=str(meta.get("titulo", "")),
        organismo=str(meta.get("organismo", "")),
        fecha_publicacion=str(meta.get("fechaPublicacion", "")),
    )


def raw_text_url(*, repo: str, sha: str, rel_path: str) -> str:
    """Immutable raw.githubusercontent URL for a file at a specific commit SHA."""
    return f"https://raw.githubusercontent.com/{repo}/{sha}/{rel_path}"


def commits_index_path(out_dir: Path, *, id_norma: int) -> Path:
    """Where to write the per-law commits shard."""
    return out_dir / "idx" / "commits" / f"{id_norma}.json"


def aggregate_manifest(commits: dict[int, list[Commit]], *, repo: str) -> dict[str, Any]:
    """Roll per-law commit lists into top-level corpus stats for manifest.json."""
    all_dates = [c.date for cs in commits.values() for c in cs if c.date]
    years = sorted({int(d[:4]) for d in all_dates if len(d) >= 4 and d[:4].isdigit()})
    return {
        "repo": repo,
        "normas_count": len(commits),
        "versions_count": sum(len(cs) for cs in commits.values()),
        "year_min": years[0] if years else None,
        "year_max": years[-1] if years else None,
    }


def _git_log_for_path(historial: Path, rel_path: str) -> list[tuple[str, str, str]]:
    """Return [(sha, iso_date, subject), ...] of commits touching rel_path on the historial branch."""
    out = subprocess.check_output(
        ["git", "-C", str(historial), "log", "--format=%H%x09%cs%x09%s", "--", rel_path],
        text=True,
    )
    rows: list[tuple[str, str, str]] = []
    for line in out.strip().splitlines():
        sha, date, subject = line.split("\t", 2)
        rows.append((sha, date, subject))
    return rows


def _causa_from_subject(subject: str) -> int:
    """Best-effort: extract the causa idNorma from a commit subject. Pipeline writes `... id=NNN ...`
    as a stable trailer; fall back to 0 if not present."""
    import re
    m = re.search(r"\bid=(\d+)\b", subject)
    return int(m.group(1)) if m else 0


def build(*, historial: Path, out_dir: Path, repo: str) -> dict[str, Any]:
    """CLI entry point. Walks historial worktree, emits shards under out_dir.

    Filesystem + git heavy — NOT covered by unit tests."""
    commits_by_id: dict[int, list[Commit]] = {}

    # Walk every leaf metadata.json (one per law dir)
    for meta_path in sorted(historial.glob("**/metadata.json")):
        if "cache/" in meta_path.as_posix():
            continue
        meta = json.loads(meta_path.read_text())
        norma = parse_metadata(meta)
        rel_dir = meta_path.parent.relative_to(historial).as_posix()
        rows = _git_log_for_path(historial, rel_dir + "/texto.md")
        commit_list = [
            Commit(sha=sha, date=date, causa_id=_causa_from_subject(subject),
                   subject=subject, magnitude=0)
            for sha, date, subject in rows
        ]
        commits_by_id[norma.id_norma] = commit_list

        shard_path = commits_index_path(out_dir, id_norma=norma.id_norma)
        shard_path.parent.mkdir(parents=True, exist_ok=True)
        shard_path.write_text(json.dumps({
            "norma": asdict(norma),
            "commits": [asdict(c) for c in commit_list],
            "rel_dir": rel_dir,
        }, ensure_ascii=False, separators=(",", ":")))

    manifest = aggregate_manifest(commits_by_id, repo=repo)
    manifest_path = out_dir / "idx" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--historial", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path, help="e.g. web/public")
    p.add_argument("--repo", default="pisanvs/ley-chile")
    args = p.parse_args()
    m = build(historial=args.historial, out_dir=args.out, repo=args.repo)
    print(json.dumps(m, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd /home/pisanvs/code/ley-chile-frontend
python -m pytest tests/test_build_web_indexes.py -v
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add scripts/build_web_indexes.py tests/test_build_web_indexes.py
git commit -m "feat(scripts): web index builder with manifest + per-law commits shards"
```

---

## Task 5: Smoke-test the index builder against the real historial worktree

**Files:** (no new files — verification only)

- [ ] **Step 1: Run the builder against the real historial**

```bash
cd /home/pisanvs/code/ley-chile-frontend
# historial worktree lives one level up in the main checkout
python scripts/build_web_indexes.py \
  --historial /home/pisanvs/code/ley-chile/historial \
  --out web/public \
  --repo pisanvs/ley-chile | head -20
```

Expected: prints a manifest JSON. May take 1–5 min depending on historial size.

- [ ] **Step 2: Verify outputs**

```bash
ls /home/pisanvs/code/ley-chile-frontend/web/public/idx/
ls /home/pisanvs/code/ley-chile-frontend/web/public/idx/commits/ | head
cat /home/pisanvs/code/ley-chile-frontend/web/public/idx/manifest.json
# Sample a known law (Ley 20.330 idNorma is in the metadata)
ls /home/pisanvs/code/ley-chile-frontend/web/public/idx/commits/ | wc -l
```

Expected: thousands of shard files; manifest shows `normas_count > 100000`.

- [ ] **Step 3: Add `web/public/idx` to gitignore (it's regenerated; don't commit)**

Append to `/home/pisanvs/code/ley-chile-frontend/.gitignore`:

```
web/public/idx/
```

- [ ] **Step 4: Commit gitignore + delete generated output from working tree**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add .gitignore
git commit -m "chore: gitignore generated web/public/idx"
```

---

## Task 6: Frontend test scaffold (Vitest + RTL)

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/src/test/setup.ts`
- Create: `web/src/lib/manifest.ts`
- Create: `web/src/lib/manifest.test.ts`

- [ ] **Step 1: Create Vitest config**

`web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 2: Create test setup file**

`web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Write a failing test for the manifest loader**

`web/src/lib/manifest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchManifest } from './manifest'

describe('fetchManifest', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('parses a valid manifest payload', async () => {
    const payload = { repo: 'pisanvs/ley-chile', normas_count: 5, versions_count: 12, year_min: 1810, year_max: 2026 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => payload,
    }))
    const m = await fetchManifest('/idx/manifest.json')
    expect(m.repo).toBe('pisanvs/ley-chile')
    expect(m.normasCount).toBe(5)
    expect(m.yearMin).toBe(1810)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchManifest('/idx/manifest.json')).rejects.toThrow(/manifest/)
  })
})
```

- [ ] **Step 4: Run the test and verify it fails**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web
pnpm test
```

Expected: import error on `./manifest` (file doesn't exist yet).

- [ ] **Step 5: Implement `web/src/lib/manifest.ts`**

```ts
export interface Manifest {
  repo: string
  normasCount: number
  versionsCount: number
  yearMin: number | null
  yearMax: number | null
}

interface RawManifest {
  repo: string
  normas_count: number
  versions_count: number
  year_min: number | null
  year_max: number | null
}

export async function fetchManifest(url: string): Promise<Manifest> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`)
  const raw = (await r.json()) as RawManifest
  return {
    repo: raw.repo,
    normasCount: raw.normas_count,
    versionsCount: raw.versions_count,
    yearMin: raw.year_min,
    yearMax: raw.year_max,
  }
}
```

- [ ] **Step 6: Run the tests and verify they pass**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web
pnpm test
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add web/vitest.config.ts web/src/test/ web/src/lib/manifest.ts web/src/lib/manifest.test.ts
git commit -m "test(web): vitest scaffold + manifest loader with tests"
```

---

## Task 7: Implement the commits index loader + data-source config

**Files:**
- Create: `web/src/lib/datasource.ts`
- Create: `web/src/lib/commits.ts`
- Create: `web/src/lib/commits.test.ts`

- [ ] **Step 1: Create the datasource config**

`web/src/lib/datasource.ts`:

```ts
// Centralizes the URLs we read from. In dev these resolve to /idx/* (served from web/public).
// In production they resolve to the deployed pages branch under the same origin.

const BASE = import.meta.env.BASE_URL ?? '/'
const REPO = import.meta.env.VITE_REPO ?? 'pisanvs/ley-chile'

function joinBase(rel: string): string {
  return (BASE.endsWith('/') ? BASE : BASE + '/') + rel.replace(/^\//, '')
}

export const ds = {
  manifestUrl: () => joinBase('idx/manifest.json'),
  commitsUrl: (idNorma: number) => joinBase(`idx/commits/${idNorma}.json`),
  rawTextUrl: (sha: string, relPath: string) =>
    `https://raw.githubusercontent.com/${REPO}/${sha}/${relPath}`,
}
```

- [ ] **Step 2: Write failing tests for the commits loader**

`web/src/lib/commits.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchCommits } from './commits'

describe('fetchCommits', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('parses a commits shard', async () => {
    const payload = {
      norma: { id_norma: 20330, numero: '20.330', tipo: 'ley', titulo: 'Becas', organismo: 'Min Ed', fecha_publicacion: '2009-03-15' },
      commits: [
        { sha: 'abc', date: '2009-03-15', causa_id: 20330, subject: 'feat(ley): 20330', magnitude: 0 },
        { sha: 'def', date: '2015-06-01', causa_id: 20808, subject: 'update(ley): 20330 by 20808', magnitude: 5 },
      ],
      rel_dir: 'leyes/20330',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
    const result = await fetchCommits(20330)
    expect(result.norma.numero).toBe('20.330')
    expect(result.relDir).toBe('leyes/20330')
    expect(result.commits).toHaveLength(2)
    expect(result.commits[0].sha).toBe('abc')
    expect(result.commits[1].causaId).toBe(20808)
  })

  it('picks the latest version by date when version not specified', async () => {
    const payload = {
      norma: { id_norma: 1, numero: '1', tipo: 'ley', titulo: 't', organismo: 'o', fecha_publicacion: '2000-01-01' },
      commits: [
        { sha: 'older', date: '2000-01-01', causa_id: 1, subject: 's', magnitude: 0 },
        { sha: 'newer', date: '2020-01-01', causa_id: 1, subject: 's', magnitude: 0 },
      ],
      rel_dir: 'leyes/1',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
    const result = await fetchCommits(1)
    const latest = result.commits[result.commits.length - 1]
    expect(latest.sha).toBe('newer')
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web
pnpm test
```

Expected: import error on `./commits`.

- [ ] **Step 4: Implement `web/src/lib/commits.ts`**

```ts
import { ds } from './datasource'

export interface Commit {
  sha: string
  date: string         // YYYY-MM-DD
  causaId: number
  subject: string
  magnitude: number
}

export interface NormaMeta {
  idNorma: number
  numero: string
  tipo: string
  titulo: string
  organismo: string
  fechaPublicacion: string
}

export interface CommitsIndex {
  norma: NormaMeta
  commits: Commit[]
  relDir: string
}

interface RawCommit {
  sha: string; date: string; causa_id: number; subject: string; magnitude: number
}
interface RawNorma {
  id_norma: number; numero: string; tipo: string; titulo: string; organismo: string; fecha_publicacion: string
}
interface RawShard { norma: RawNorma; commits: RawCommit[]; rel_dir: string }

export async function fetchCommits(idNorma: number): Promise<CommitsIndex> {
  const r = await fetch(ds.commitsUrl(idNorma))
  if (!r.ok) throw new Error(`commits ${idNorma}: ${r.status}`)
  const raw = (await r.json()) as RawShard
  // Sort ascending by date so callers can grab the last entry for "latest".
  const sorted = [...raw.commits].sort((a, b) => a.date.localeCompare(b.date))
  return {
    norma: {
      idNorma: raw.norma.id_norma,
      numero: raw.norma.numero,
      tipo: raw.norma.tipo,
      titulo: raw.norma.titulo,
      organismo: raw.norma.organismo,
      fechaPublicacion: raw.norma.fecha_publicacion,
    },
    commits: sorted.map(c => ({
      sha: c.sha, date: c.date, causaId: c.causa_id, subject: c.subject, magnitude: c.magnitude,
    })),
    relDir: raw.rel_dir,
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web && pnpm test
```

Expected: 4 tests pass (manifest 2 + commits 2).

- [ ] **Step 6: Commit**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add web/src/lib/datasource.ts web/src/lib/commits.ts web/src/lib/commits.test.ts
git commit -m "feat(web): commits index loader + datasource config"
```

---

## Task 8: Build the IDE shell + Version Scrubber

**Files:**
- Create: `web/src/components/IDEShell.tsx`
- Create: `web/src/components/VersionScrubber.tsx`
- Create: `web/src/components/VersionScrubber.test.tsx`
- Modify: `web/src/routes/ley.$numero.$fecha.tsx`
- Modify: `web/src/routes/ley.$numero.index.tsx`

- [ ] **Step 1: Write a failing test for VersionScrubber**

`web/src/components/VersionScrubber.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { VersionScrubber } from './VersionScrubber'
import type { Commit } from '@/lib/commits'

const commits: Commit[] = [
  { sha: 'a', date: '2009-03-15', causaId: 20330, subject: 's', magnitude: 0 },
  { sha: 'b', date: '2015-06-01', causaId: 20808, subject: 's', magnitude: 5 },
  { sha: 'c', date: '2020-11-10', causaId: 21100, subject: 's', magnitude: 12 },
]

describe('VersionScrubber', () => {
  it('renders one tick per commit', () => {
    render(<VersionScrubber commits={commits} activeSha="b" onPick={vi.fn()} />)
    const ticks = screen.getAllByRole('button', { name: /versión/i })
    expect(ticks).toHaveLength(3)
  })

  it('marks the active tick', () => {
    render(<VersionScrubber commits={commits} activeSha="b" onPick={vi.fn()} />)
    const active = screen.getByRole('button', { name: /2015-06-01/ })
    expect(active).toHaveAttribute('aria-current', 'true')
  })

  it('calls onPick with the commit when a tick is clicked', async () => {
    const onPick = vi.fn()
    render(<VersionScrubber commits={commits} activeSha="b" onPick={onPick} />)
    const tick = screen.getByRole('button', { name: /2020-11-10/ })
    tick.click()
    expect(onPick).toHaveBeenCalledWith(commits[2])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web && pnpm test
```

Expected: import error on `./VersionScrubber`.

- [ ] **Step 3: Implement VersionScrubber**

`web/src/components/VersionScrubber.tsx`:

```tsx
import type { Commit } from '@/lib/commits'

interface Props {
  commits: Commit[]
  activeSha: string | null
  onPick: (c: Commit) => void
}

export function VersionScrubber({ commits, activeSha, onPick }: Props) {
  if (commits.length === 0) {
    return <div className="text-sm opacity-60">Sin versiones registradas.</div>
  }
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2" role="group" aria-label="Versiones de la ley">
      {commits.map(c => {
        const active = c.sha === activeSha
        return (
          <button
            key={c.sha}
            onClick={() => onPick(c)}
            aria-current={active ? 'true' : undefined}
            aria-label={`versión ${c.date}`}
            title={`${c.date} · causa: ${c.causaId || '—'}`}
            className={[
              'h-6 w-1.5 rounded-full transition-all',
              active ? 'bg-indigo h-8' : 'bg-ink/30 hover:bg-ink/60',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web && pnpm test
```

Expected: all 7 tests pass (manifest 2 + commits 2 + scrubber 3).

- [ ] **Step 5: Implement IDEShell**

`web/src/components/IDEShell.tsx`:

```tsx
import type { ReactNode } from 'react'

interface Props {
  navigator?: ReactNode
  center: ReactNode
  rightRail?: ReactNode
}

export function IDEShell({ navigator, center, rightRail }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)_320px] min-h-[calc(100vh-3.5rem)]">
      <aside className="border-r border-ink/10 p-4 hidden md:block">
        {navigator ?? <Placeholder label="Navigator (Plan 5)" />}
      </aside>
      <section className="px-6 py-8 max-w-3xl mx-auto w-full">{center}</section>
      <aside className="border-l border-ink/10 p-4 hidden md:block">
        {rightRail ?? <Placeholder label="Graph + lineage (Plan 3)" />}
      </aside>
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="text-xs uppercase tracking-widest opacity-40">{label}</div>
  )
}
```

- [ ] **Step 6: Wire the IDE route to use commits + scrubber**

Overwrite `web/src/routes/ley.$numero.$fecha.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchCommits, type Commit } from '@/lib/commits'
import { IDEShell } from '@/components/IDEShell'
import { VersionScrubber } from '@/components/VersionScrubber'

export const Route = createFileRoute('/ley/$numero/$fecha')({
  component: IDEPage,
})

function IDEPage() {
  const { numero, fecha } = Route.useParams()
  // For v1, we map numero -> idNorma via a future numero index. Until then we route by
  // numero treated as idNorma when numeric (works for the smoke-test law).
  const idNorma = Number(numero)
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['commits', idNorma],
    queryFn: () => fetchCommits(idNorma),
    enabled: Number.isFinite(idNorma),
  })

  if (q.isLoading) return <IDEShell center={<div className="opacity-60">Cargando…</div>} />
  if (q.isError) return <IDEShell center={<div className="text-ruby">No se pudo cargar la ley.</div>} />
  const idx = q.data!
  const active: Commit | undefined =
    idx.commits.find(c => c.date === fecha) ?? idx.commits[idx.commits.length - 1]

  const center = (
    <div>
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest opacity-50">{idx.norma.tipo} · {idx.norma.numero}</div>
        <h1 className="font-display text-3xl mt-1">{idx.norma.titulo}</h1>
        <div className="text-sm opacity-60 mt-1">{idx.norma.organismo}</div>
      </header>
      <VersionScrubber
        commits={idx.commits}
        activeSha={active?.sha ?? null}
        onPick={c => navigate({ to: '/ley/$numero/$fecha', params: { numero, fecha: c.date } })}
      />
      <div className="mt-2 text-sm opacity-70">
        Versión: <b>{active?.date ?? '—'}</b> · causa: {active?.causaId || '—'}
      </div>
      <hr className="my-6 border-ink/10" />
      <div className="opacity-50 italic">Clean reader arrives in Task 9.</div>
    </div>
  )

  return <IDEShell center={center} />
}
```

Overwrite `web/src/routes/ley.$numero.index.tsx`:

```tsx
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchCommits } from '@/lib/commits'

export const Route = createFileRoute('/ley/$numero/')({
  component: () => {
    const { numero } = Route.useParams()
    const q = useQuery({ queryKey: ['commits', Number(numero)], queryFn: () => fetchCommits(Number(numero)) })
    if (q.isLoading) return <div className="p-8 opacity-60">Cargando…</div>
    if (q.isError || !q.data?.commits.length) return <div className="p-8 text-ruby">No hay versiones para esta ley.</div>
    const latest = q.data.commits[q.data.commits.length - 1]
    return <Navigate to="/ley/$numero/$fecha" params={{ numero, fecha: latest.date }} replace />
  },
})
```

- [ ] **Step 7: Run dev server and smoke-test**

First, regenerate indexes so a known law has a shard. Re-run Task 5 Step 1 if not done recently. Then:

```bash
cd /home/pisanvs/code/ley-chile-frontend/web
pnpm dev
```

Open `http://localhost:5173/ley-chile/ley/<idNorma>` for an idNorma that exists in `web/public/idx/commits/` (pick one from `ls web/public/idx/commits/ | head`). Expected: header renders, version scrubber renders, clicking a tick navigates to that date.

- [ ] **Step 8: Commit**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add web/src/components/ web/src/routes/ley*.tsx
git commit -m "feat(web): IDE shell + version scrubber wired to commits index"
```

---

## Task 9: Build the Clean Reader (raw text fetch + markdown render)

**Files:**
- Create: `web/src/lib/rawtext.ts`
- Create: `web/src/lib/rawtext.test.ts`
- Create: `web/src/components/CleanReader.tsx`
- Modify: `web/src/routes/ley.$numero.$fecha.tsx`

- [ ] **Step 1: Write failing test for the raw-text loader**

`web/src/lib/rawtext.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRawText } from './rawtext'

describe('fetchRawText', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('fetches the text at the pinned SHA', async () => {
    const text = '# Artículo 1°\nEstablécese...'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => text })
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchRawText({ sha: 'abc123', relDir: 'leyes/20330' })
    expect(out).toBe(text)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/abc123/')
    expect(url).toContain('leyes/20330/texto.md')
  })

  it('throws on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchRawText({ sha: 'abc', relDir: 'leyes/1' })).rejects.toThrow(/404/)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web && pnpm test
```

Expected: import error on `./rawtext`.

- [ ] **Step 3: Implement the loader**

`web/src/lib/rawtext.ts`:

```ts
import { ds } from './datasource'

export async function fetchRawText({ sha, relDir }: { sha: string; relDir: string }): Promise<string> {
  const url = ds.rawTextUrl(sha, `${relDir}/texto.md`)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`raw text ${url}: ${r.status}`)
  return await r.text()
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web && pnpm test
```

Expected: 9 tests pass (manifest 2 + commits 2 + scrubber 3 + rawtext 2).

- [ ] **Step 5: Implement CleanReader**

`web/src/components/CleanReader.tsx`:

```tsx
import ReactMarkdown from 'react-markdown'
import { useQuery } from '@tanstack/react-query'
import { fetchRawText } from '@/lib/rawtext'

interface Props { sha: string; relDir: string }

export function CleanReader({ sha, relDir }: Props) {
  const q = useQuery({
    queryKey: ['rawtext', sha, relDir],
    queryFn: () => fetchRawText({ sha, relDir }),
    staleTime: Infinity, // immutable URL
  })
  if (q.isLoading) return <div className="opacity-60">Cargando texto…</div>
  if (q.isError) return <div className="text-ruby">No se pudo cargar el texto.</div>
  return (
    <article className="prose-reader font-body leading-relaxed text-[15px] max-w-none">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="font-display text-2xl mt-8 mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="font-display text-xl mt-6 mb-2">{children}</h2>,
          h3: ({ children, ...rest }) => <h3 className="font-semibold mt-5 mb-1" {...rest}>{children}</h3>,
          p:  ({ children }) => <p className="my-3">{children}</p>,
        }}
      >
        {q.data}
      </ReactMarkdown>
    </article>
  )
}
```

- [ ] **Step 6: Wire CleanReader into the IDE route**

Edit `web/src/routes/ley.$numero.$fecha.tsx`: replace the `Clean reader arrives in Task 9.` placeholder block with:

```tsx
{active && <CleanReader sha={active.sha} relDir={idx.relDir} />}
```

…and add the import at the top:

```tsx
import { CleanReader } from '@/components/CleanReader'
```

- [ ] **Step 7: Smoke-test in the browser**

```bash
cd /home/pisanvs/code/ley-chile-frontend/web && pnpm dev
```

Open `http://localhost:5173/ley-chile/ley/<idNorma>`. Expected: header + scrubber + rendered markdown of the law text fetched from GitHub's CDN. Switching versions via scrubber re-renders.

If raw fetches 404, double-check the `relDir` in the shard matches the actual historial layout (e.g., `leyes/20330`, not `historial/leyes/20330`).

- [ ] **Step 8: Commit**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add web/src/lib/rawtext.ts web/src/lib/rawtext.test.ts web/src/components/CleanReader.tsx web/src/routes/ley.$numero.$fecha.tsx
git commit -m "feat(web): clean markdown reader fetched from immutable raw URLs"
```

---

## Task 10: GitHub Action — `build-pages.yml`

**Files:**
- Create: `.github/workflows/build-pages.yml`
- Modify: `CLAUDE.md` (add Frontend section)

- [ ] **Step 1: Create the workflow**

`/home/pisanvs/code/ley-chile-frontend/.github/workflows/build-pages.yml`:

```yaml
name: Build pages
on:
  push:
    branches: [historial]
  workflow_dispatch:
  workflow_run:
    workflows: ["pipeline"]
    types: [completed]

concurrency:
  group: build-pages
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout main (sparse — code only)
        uses: actions/checkout@v4
        with:
          ref: main
          path: code
          sparse-checkout: |
            scripts
            web
            requirements.txt
          sparse-checkout-cone-mode: false

      - name: Checkout historial (data)
        uses: actions/checkout@v4
        with:
          ref: historial
          path: historial
          fetch-depth: 0  # we read git log per file

      - name: Set up Python
        uses: actions/setup-python@v5
        with: { python-version: '3.12' }

      - name: Install Python deps
        run: pip install -r code/requirements.txt

      - name: Build indexes
        run: |
          python code/scripts/build_web_indexes.py \
            --historial historial \
            --out code/web/public \
            --repo ${{ github.repository }}

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with: { version: 9 }

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: code/web/pnpm-lock.yaml

      - name: Install web deps
        run: pnpm --dir code/web install --frozen-lockfile

      - name: Build SPA
        env:
          VITE_BASE: /ley-chile/
          VITE_REPO: ${{ github.repository }}
        run: pnpm --dir code/web build

      - name: Push to pages branch
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cd code/web/dist
          git init -b pages
          git config user.email "github-actions@users.noreply.github.com"
          git config user.name "github-actions"
          touch .nojekyll
          git add -A
          git commit -m "build: ${{ github.sha }}" --allow-empty
          git push --force "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git" HEAD:pages
```

Note on triggers: `workflow_run` of `pipeline` is included so any pipeline completion rebuilds even if `historial` push events are missed. `concurrency` keeps only the newest run.

- [ ] **Step 2: Enable GH Pages from the `pages` branch**

This is a one-time manual step (not in the plan code, but document it):
- Repository Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `pages` / `/ (root)`.

- [ ] **Step 3: Update CLAUDE.md**

Append a new section to `/home/pisanvs/code/ley-chile-frontend/CLAUDE.md` (read the file first to find the right insertion point — after the existing pipeline section):

```markdown
## Frontend

The SPA lives in `web/` (Vite + React + TS + Tailwind). The deploy target is the orphan `pages` branch, mounted as a worktree at `web/dist/`. GH Pages serves it at `https://pisanvs.github.io/ley-chile/`.

```bash
# Local dev (after pnpm install in web/)
cd web && pnpm dev

# Run the index builder against the real historial worktree
python scripts/build_web_indexes.py \
  --historial ./historial \
  --out web/public \
  --repo pisanvs/ley-chile

# Build SPA locally
cd web && pnpm build  # writes to web/dist (= pages worktree)

# Tests
cd web && pnpm test       # frontend (Vitest)
python -m pytest tests/test_build_web_indexes.py  # index builder
```

The Action `.github/workflows/build-pages.yml` rebuilds end-to-end on every `historial` push and force-pushes to the `pages` branch.
```

- [ ] **Step 4: Commit Action + docs**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git add .github/workflows/build-pages.yml CLAUDE.md
git commit -m "ci(pages): build-pages workflow + CLAUDE.md frontend section"
```

- [ ] **Step 5: Push branch and verify Action runs**

```bash
cd /home/pisanvs/code/ley-chile-frontend
git push -u origin feat/frontend
```

Then trigger the workflow manually from the GitHub UI (workflow_dispatch). Expected: green run; `pages` branch gets new commits; Pages URL serves the SPA.

If the run fails on Tailwind 4 install, fall back to Tailwind 3 per Task 2 Step 5 note and re-run.

---

## Acceptance for Plan 1

This plan ships when:

- [ ] All Python tests pass: `python -m pytest tests/test_build_web_indexes.py -v`
- [ ] All frontend tests pass: `cd web && pnpm test`
- [ ] `python scripts/build_web_indexes.py --historial ../ley-chile/historial --out web/public --repo pisanvs/ley-chile` writes a `manifest.json` and at least one `idx/commits/{id}.json`
- [ ] `cd web && pnpm dev` serves the IDE shell with version scrubber + Clean reader for a real law
- [ ] `cd web && pnpm build` produces `web/dist/` without errors
- [ ] `.github/workflows/build-pages.yml` completes a green run on workflow_dispatch
- [ ] `https://pisanvs.github.io/ley-chile/ley/<idNorma>` renders the IDE end-to-end with markdown fetched from `raw.githubusercontent.com`

Plans 2–5 follow once Plan 1 lands.
