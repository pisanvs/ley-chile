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
LEYCHILE_DATA_ROOT=./historial python scripts/run_pipeline.py --limit -5 --verbose

# Skip completed phases
python scripts/run_pipeline.py --skip-catalog --skip-normas
python scripts/run_pipeline.py --skip-catalog --skip-normas --skip-versions

# Pass --no-expand to skip BFS expansion of modifier laws in fetch_normas
python scripts/run_pipeline.py --no-expand

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
python -m pytest tests/test_utils.py  # single file (adjust path)
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
