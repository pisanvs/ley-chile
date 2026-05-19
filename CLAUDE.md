# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

```bash
pip install -r requirements.txt
```

## Key Scripts

```bash
# Build/extend the legislative graph and commit law versions to historial branch
LEYCHILE_DATA_ROOT=./historial python scripts/trace_graph.py --id 235507 --ley 20000

# Rewrite git history on historial branch in chronological order (via git fast-import)
LEYCHILE_DATA_ROOT=./historial python scripts/rebuild_history.py

# Preview the event list without writing anything
LEYCHILE_DATA_ROOT=./historial python scripts/rebuild_history.py --dry-run

# Fetch parliamentary session data for a law
python scripts/fetch_tramitacion.py --ley 20000
```

## Architecture

### Two-Branch Design

- **`claude/setup-chilean-law-repo-*` (code branch)**: Contains only scripts, requirements, README, CI config. Never contains law data.
- **`historial` (orphan branch)**: Contains only law data commits, built chronologically by `rebuild_history.py`. Set up as a git worktree at `./historial/`.

Create the historial worktree:
```bash
git checkout --orphan historial
git rm -rf .
git commit --allow-empty -m "init: historial branch"
git checkout -
git worktree add historial historial
```

### DATA_ROOT Detection

Both `trace_graph.py` and `rebuild_history.py` auto-detect where law data lives:
1. `LEYCHILE_DATA_ROOT` env var (explicit override)
2. `./historial/` worktree if it exists and has a `.git` file
3. Fallback: repo root (legacy, single-branch mode)

`REPO_ROOT` always refers to the scripts directory; `DATA_ROOT` is used for all data operations (leyes/, modificaciones/, graph.json, git -C).

### Pipeline

```
trace_graph.py → leyes/{numero}/versiones.json + texto.md + metadata.json
                         ↓
rebuild_history.py reads versiones.json (committed=true entries only)
                         ↓
git fast-import → chronological commits on historial branch
```

Events are sorted by `(date, group, rank, _seq)` where `group` = modifier ley numero for update events (or own ley numero for feat/derog), and `rank` = 1 for updates caused by a modifier (0 otherwise). This ensures `feat(modificacion, Ley X)` always immediately precedes the `update(ley)` events it triggered on the same date.

### Law Classification

- `sustantiva`: Law with its own subject matter → `leyes/{numero}/`
- `modificatoria`: Law that primarily amends other laws → `modificaciones/{numero}/`

Classification comes from the BCN graph (`clasificacion` field in `graph.json`).

### versiones.json Lifecycle

Each law directory has `versiones.json`:
```json
[
  {"fecha": "2005-02-16", "committed": true},
  {"fecha": "2011-02-21", "committed": true, "modificadaPor": {"numero": "20502", ...}}
]
```

- `committed: true` — version was successfully fetched and committed; skip on re-run
- `committed: false` — fetch failed (e.g. LeyChile 500 error); skipped by `rebuild_history.py`

### graph.json

Tracks the dependency graph of laws. Keys are idNorma (string), values contain:
- `numero`, `titulo`, `clasificacion`, `fechaPublicacion`
- `modifica`: list of ley numbers this law modifies
- `modificadaPor`: list of idNorma integers that modified this law

### Derogation Commits

When a law is derogated, `rebuild_history.py` produces two sequential events:
1. `update` event: final text content
2. `derog` event: deletes all files in the directory; if a successor law is found in the graph, creates a git symlink (mode `120000`) at `leyes/{old}` → `{new}` (e.g. `leyes/19366` → `20000`)

After derogation, `leyes/{old}` on the filesystem is a symlink to the successor directory. `trace_graph.py` detects this (`dest.is_symlink()`) and skips the law on subsequent runs.

## Data Sources

| Source | Endpoint | Notes |
|---|---|---|
| LeyChile XML | `https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma={id}&idVersion={YYYY-MM-DD}` | 1 req/s rate limit |
| BCN linked data | `https://datos.bcn.cl/recurso/cl/ley/{numero}/datos.json` | 0.3 req/s; has `isModifiedBy` / `modifiesTo` predicates |
| SIL tramitación | Senate XML + Chamber SOAP | No official API; scraped |

**Sentinel date**: LeyChile uses `2222-02-02` for open-ended "current" versions. Filter: `int(date[:4]) <= 2100`.

**DFL filter**: After fetching metadata, filter `all_ids` to only `tipo == "Ley"` — excludes "Decreto con Fuerza de Ley", "Decreto Supremo", etc.

## Key Constants (trace_graph.py)

- `EXTRA_SEEDS = [29815, 30733]` — hardcoded idNormas for Ley 18403 and Ley 19366 (predecessor chain not discoverable from BCN graph alone)
- `KNOWN_RECENT = {1192530: "21575", 1206373: "21694"}` — fallback for laws too recent for BCN dataset

## Commit Format

```
feat(ley): Ley 20000 — versión 2005-02-16
update(ley): Ley 20000 — versión 2011-02-21 [mod. por Ley 20502]
derog(ley): Ley 19366 derogada 1995-02-16 → Ley 20000
chore(meta): actualizar graph.json
```

Types: `feat` (new law version), `update` (modification), `derog` (derogation), `fix` (data correction).

## Text Canonicalization

All `texto.md` content follows two rules:
1. **Leaf text**: normalized via `_clean(text)` — `re.sub(r"\s+", " ", text).strip()` — collapses all internal whitespace to single spaces.
2. **Structure**: sections and articles are joined with single `\n` (never `\n\n`), so there are no blank lines in `texto.md`. Blank lines would always attribute to the original `feat` commit in `git blame`, interrupting continuity.
