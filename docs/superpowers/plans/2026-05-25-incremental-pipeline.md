# Incremental Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the incremental GitHub Actions pipeline: `pipeline-cache` orphan branch, budget-based fetch batching, strict watermark-gated historial advances, and a live README progress bar.

**Architecture:** Three orphan branches in one repo. `graph.json` lives in the code branch. `pipeline-cache` (new orphan) accumulates fetched version data over many runs. `historial` (existing orphan) is the ordered output and doubles as the watermark — its last commit date tells the pipeline how far commits have been emitted. Each GH Actions run fills the cache up to a version budget, then advances historial to the highest contiguous-complete date.

**Tech Stack:** Python 3.12, asyncio, git fast-import, GitHub Actions, subprocess

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `scripts/compute_watermark.py` | Create | Compute `(W, D)` from graph + cache + historial |
| `scripts/update_readme_status.py` | Create | Replace sentinel block in `README.md` |
| `scripts/fetch_versions.py` | Modify | Add `--cache-dir`, `--version-budget` |
| `scripts/build_history.py` | Modify | Add `--cache-dir`, `--from`, `--to` |
| `tests/test_compute_watermark.py` | Create | Unit tests for watermark computation |
| `tests/test_update_readme_status.py` | Create | Unit tests for README update |
| `tests/test_fetch_versions_budget.py` | Create | Unit test for budget work queue truncation |
| `tests/test_build_history_dates.py` | Create | Unit test for `--from`/`--to` date filtering |
| `README.md` | Modify | Add pipeline status sentinel markers |
| `.github/workflows/update-graph.yml` | Create | Rebuild `graph.json` workflow |
| `.github/workflows/fetch-and-build.yml` | Create | Incremental fetch + build + README workflow |
| `CLAUDE.md` | Modify | Document `pipeline-cache` branch setup |

---

## Task 1: `scripts/compute_watermark.py`

**Files:**
- Create: `scripts/compute_watermark.py`
- Create: `tests/test_compute_watermark.py`

- [ ] **Step 1.1: Write failing tests**

Create `tests/test_compute_watermark.py`:

```python
"""Tests for compute_watermark.py — no network or git calls required."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import compute_watermark as cw


def _make_cache(tmp_path: Path, ids: list[int]) -> Path:
    """Create cache dir with a diffs file for each given idNorma."""
    diffs = tmp_path / "cache" / "diffs"
    diffs.mkdir(parents=True)
    for id_norma in ids:
        (diffs / f"{id_norma}.json").write_text("[]", encoding="utf-8")
    return tmp_path / "cache"


def test_empty_cache_returns_empty_D(tmp_path):
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2020-06-01"},
    }
    cache_dir = _make_cache(tmp_path, [])
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == ""
    assert result["cached"] == 0
    assert result["total"] == 2


def test_partial_cache_D_stops_at_first_gap(tmp_path):
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2020-06-01"},
        "300": {"fechaPublicacion": "2020-12-01"},
    }
    cache_dir = _make_cache(tmp_path, [100, 300])  # 200 missing
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == "2020-01-01"   # gap at 200 blocks further advance
    assert result["cached"] == 2         # 100 + 300 exist on disk


def test_full_cache_D_equals_last_date(tmp_path):
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2020-06-01"},
    }
    cache_dir = _make_cache(tmp_path, [100, 200])
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == "2020-06-01"
    assert result["total"] == 2
    assert result["cached"] == 2


def test_watermark_advanced_true_when_D_gt_W(tmp_path):
    graph = {"100": {"fechaPublicacion": "2020-01-01"}}
    cache_dir = _make_cache(tmp_path, [100])
    result = cw.compute_watermark(graph, cache_dir, W="2019-01-01")
    assert result["watermark_advanced"] is True


def test_watermark_advanced_false_when_D_eq_W(tmp_path):
    graph = {"100": {"fechaPublicacion": "2020-01-01"}}
    cache_dir = _make_cache(tmp_path, [100])
    result = cw.compute_watermark(graph, cache_dir, W="2020-01-01")
    assert result["watermark_advanced"] is False


def test_normas_without_fecha_are_skipped(tmp_path):
    graph = {
        "100": {"fechaPublicacion": ""},          # no date
        "200": {"fechaPublicacion": "2020-01-01"},
    }
    cache_dir = _make_cache(tmp_path, [100, 200])
    result = cw.compute_watermark(graph, cache_dir, W="")
    assert result["D"] == "2020-01-01"  # undated norma doesn't block D
    assert result["total"] == 2


def test_historial_count_counts_normas_le_W(tmp_path):
    graph = {
        "100": {"fechaPublicacion": "2020-01-01"},
        "200": {"fechaPublicacion": "2021-01-01"},
        "300": {"fechaPublicacion": "2022-01-01"},
    }
    cache_dir = _make_cache(tmp_path, [])
    result = cw.compute_watermark(graph, cache_dir, W="2021-01-01")
    assert result["historial_count"] == 2  # 100 and 200
```

- [ ] **Step 1.2: Run test to confirm failure**

```bash
python -m pytest tests/test_compute_watermark.py -v
```
Expected: `ModuleNotFoundError: No module named 'compute_watermark'`

- [ ] **Step 1.3: Implement `scripts/compute_watermark.py`**

```python
"""
compute_watermark.py — compute the safe historial advance window.

W = last commit date on the historial branch (passed in or read via git log)
D = highest fechaPublicacion such that every dated norma with date <= D
    has its diffs file present in cache_dir/diffs/

Usage:
    python scripts/compute_watermark.py \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        --historial-dir ./historial \\
        [--output-env]   # write W/D/stats to $GITHUB_OUTPUT

Exit code 0 always. If --output-env, also prints key=value lines.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def get_historial_watermark(historial_dir: Path) -> str:
    """Return YYYY-MM-DD of the most recent commit on historial, or '' if empty."""
    result = subprocess.run(
        ["git", "log", "--format=%ci", "-1"],
        cwd=str(historial_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return ""
    return result.stdout.strip()[:10]


def compute_watermark(
    graph: dict,
    cache_dir: Path,
    W: str,
) -> dict:
    """
    Returns:
        D              — highest date where all dated normas up to D are cached
        cached         — total normas with a diffs file in cache_dir/diffs/
        total          — total dated normas in graph
        historial_count — normas with fechaPublicacion <= W
        watermark_advanced — bool: D > W (or D non-empty and W is empty)
    """
    diffs_dir = cache_dir / "diffs"

    dated = sorted(
        [
            (id_str, node["fechaPublicacion"])
            for id_str, node in graph.items()
            if node.get("fechaPublicacion")
        ],
        key=lambda t: t[1],
    )

    total = len(dated)
    total_cached = sum(
        1 for id_str, _ in dated
        if (diffs_dir / f"{id_str}.json").exists()
    )

    D = ""
    for id_str, fecha in dated:
        if not (diffs_dir / f"{id_str}.json").exists():
            break
        D = fecha

    historial_count = sum(1 for _, fecha in dated if fecha <= W) if W else 0

    if D and W:
        watermark_advanced = D > W
    else:
        watermark_advanced = bool(D)

    return {
        "W": W,
        "D": D,
        "total": total,
        "cached": total_cached,
        "historial_count": historial_count,
        "watermark_advanced": watermark_advanced,
    }


def _write_github_output(stats: dict) -> None:
    """Write key=value pairs to $GITHUB_OUTPUT (if set) and stdout."""
    lines = [
        f"W={stats['W']}",
        f"D={stats['D']}",
        f"watermark_advanced={'true' if stats['watermark_advanced'] else 'false'}",
        f"total_normas={stats['total']}",
        f"cached_normas={stats['cached']}",
        f"historial_count={stats['historial_count']}",
    ]
    for line in lines:
        print(line)
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph-path", required=True, metavar="PATH")
    parser.add_argument("--cache-dir", required=True, metavar="PATH")
    parser.add_argument("--historial-dir", metavar="PATH", default=None)
    parser.add_argument("--W", dest="W_override", metavar="DATE", default=None,
                        help="Override W instead of reading from historial git log")
    parser.add_argument("--output-env", action="store_true",
                        help="Write stats to $GITHUB_OUTPUT and stdout")
    args = parser.parse_args()

    graph_path = Path(args.graph_path)
    if not graph_path.exists():
        print(f"ERROR: graph.json not found at {graph_path}", file=sys.stderr)
        sys.exit(1)

    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    cache_dir = Path(args.cache_dir)

    if args.W_override is not None:
        W = args.W_override
    elif args.historial_dir:
        W = get_historial_watermark(Path(args.historial_dir))
    else:
        W = ""

    stats = compute_watermark(graph, cache_dir, W=W)

    if args.output_env:
        _write_github_output(stats)
    else:
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 1.4: Run tests to confirm pass**

```bash
python -m pytest tests/test_compute_watermark.py -v
```
Expected: all 7 tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add scripts/compute_watermark.py tests/test_compute_watermark.py
git commit -m "feat: compute_watermark.py — W/D safe window for historial advance"
```

---

## Task 2: `scripts/update_readme_status.py`

**Files:**
- Create: `scripts/update_readme_status.py`
- Create: `tests/test_update_readme_status.py`

- [ ] **Step 2.1: Write failing tests**

Create `tests/test_update_readme_status.py`:

```python
"""Tests for update_readme_status.py."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import update_readme_status as urs

START = "<!-- PIPELINE_STATUS_START -->"
END = "<!-- PIPELINE_STATUS_END -->"

SAMPLE_STATS = {
    "W": "1997-03-15",
    "D": "2001-06-20",
    "total": 100,
    "cached": 74,
    "historial_count": 58,
}


def _readme(tmp_path: Path, body: str = "old content") -> Path:
    p = tmp_path / "README.md"
    p.write_text(f"# Title\n\n{START}\n{body}\n{END}\n\n## More\n", encoding="utf-8")
    return p


def test_render_bar_empty():
    assert urs.render_bar(0.0) == "░" * 20


def test_render_bar_full():
    assert urs.render_bar(1.0) == "█" * 20


def test_render_bar_half():
    assert urs.render_bar(0.5) == "█" * 10 + "░" * 10


def test_update_replaces_content_between_markers(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    content = readme.read_text(encoding="utf-8")
    assert "old content" not in content
    assert START in content
    assert END in content


def test_update_contains_watermark_date(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    assert "1997-03-15" in readme.read_text(encoding="utf-8")


def test_update_contains_percentages(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    content = readme.read_text(encoding="utf-8")
    assert "58%" in content   # historial 58/100
    assert "74%" in content   # cache 74/100


def test_update_preserves_content_outside_markers(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    content = readme.read_text(encoding="utf-8")
    assert "# Title" in content
    assert "## More" in content


def test_update_raises_if_markers_missing(tmp_path):
    readme = tmp_path / "README.md"
    readme.write_text("# No markers here\n", encoding="utf-8")
    with pytest.raises(ValueError, match="markers not found"):
        urs.update_readme_status(readme, SAMPLE_STATS)


def test_update_zero_total_does_not_divide_by_zero(tmp_path):
    readme = _readme(tmp_path)
    stats = {**SAMPLE_STATS, "total": 0, "cached": 0, "historial_count": 0}
    urs.update_readme_status(readme, stats)  # should not raise
```

- [ ] **Step 2.2: Run test to confirm failure**

```bash
python -m pytest tests/test_update_readme_status.py -v
```
Expected: `ModuleNotFoundError: No module named 'update_readme_status'`

- [ ] **Step 2.3: Implement `scripts/update_readme_status.py`**

```python
"""
update_readme_status.py — regenerate the pipeline status block in README.md.

The block lives between HTML comment sentinels:
  <!-- PIPELINE_STATUS_START -->
  ...
  <!-- PIPELINE_STATUS_END -->

Usage:
    python scripts/update_readme_status.py \\
        --readme README.md \\
        --graph-path ./graph.json \\
        --cache-dir ./cache \\
        --historial-dir ./historial
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from compute_watermark import compute_watermark, get_historial_watermark  # noqa: E402

START_MARKER = "<!-- PIPELINE_STATUS_START -->"
END_MARKER = "<!-- PIPELINE_STATUS_END -->"


def render_bar(fraction: float, width: int = 20) -> str:
    """Unicode block progress bar."""
    if fraction <= 0:
        return "░" * width
    if fraction >= 1:
        return "█" * width
    filled = round(fraction * width)
    return "█" * filled + "░" * (width - filled)


def update_readme_status(readme_path: Path, stats: dict) -> None:
    """Replace content between sentinel markers with fresh stats."""
    content = readme_path.read_text(encoding="utf-8")

    start_idx = content.find(START_MARKER)
    end_idx = content.find(END_MARKER)
    if start_idx == -1 or end_idx == -1:
        raise ValueError("Pipeline status markers not found in README.md")

    total = stats["total"] or 1  # avoid division by zero
    hist_pct = stats["historial_count"] / total
    cache_pct = stats["cached"] / total
    W = stats["W"] or "—"
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    block = (
        f"{START_MARKER}\n"
        f"## Pipeline Status\n"
        f"| | |\n"
        f"|---|---|\n"
        f"| **Historial** | `{render_bar(hist_pct)}` {hist_pct:.0%}"
        f" · watermark {W} · {stats['historial_count']:,} normas |\n"
        f"| **Cache**     | `{render_bar(cache_pct)}` {cache_pct:.0%}"
        f" · {stats['cached']:,} / {stats['total']:,} normas fetched |\n"
        f"| **Last run**  | {now} |\n"
        f"{END_MARKER}"
    )

    new_content = content[:start_idx] + block + content[end_idx + len(END_MARKER):]
    readme_path.write_text(new_content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readme", default="README.md", metavar="PATH")
    parser.add_argument("--graph-path", required=True, metavar="PATH")
    parser.add_argument("--cache-dir", required=True, metavar="PATH")
    parser.add_argument("--historial-dir", metavar="PATH", default=None)
    parser.add_argument("--W", dest="W_override", metavar="DATE", default=None)
    args = parser.parse_args()

    graph = json.loads(Path(args.graph_path).read_text(encoding="utf-8"))
    cache_dir = Path(args.cache_dir)

    if args.W_override is not None:
        W = args.W_override
    elif args.historial_dir:
        W = get_historial_watermark(Path(args.historial_dir))
    else:
        W = ""

    stats = compute_watermark(graph, cache_dir, W=W)
    update_readme_status(Path(args.readme), stats)
    print(f"README updated — historial {stats['historial_count']}/{stats['total']}"
          f" ({stats['historial_count'] / (stats['total'] or 1):.0%})"
          f", cache {stats['cached']}/{stats['total']}"
          f" ({stats['cached'] / (stats['total'] or 1):.0%})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2.4: Run tests to confirm pass**

```bash
python -m pytest tests/test_update_readme_status.py -v
```
Expected: all 8 tests PASS

- [ ] **Step 2.5: Commit**

```bash
git add scripts/update_readme_status.py tests/test_update_readme_status.py
git commit -m "feat: update_readme_status.py — live pipeline progress bar in README"
```

---

## Task 3: Modify `scripts/fetch_versions.py` — add `--cache-dir` and `--version-budget`

**Files:**
- Modify: `scripts/fetch_versions.py`
- Create: `tests/test_fetch_versions_budget.py`

- [ ] **Step 3.1: Write failing test**

Create `tests/test_fetch_versions_budget.py`:

```python
"""Tests for fetch_versions.py budget logic."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_versions as fv


def _node(n_versions: int) -> dict:
    """Build a minimal graph node with n_versions vigencias."""
    return {
        "vigencias": [{"desde": f"2020-0{i+1}-01"} for i in range(n_versions)],
        "fechaPublicacion": "2020-01-01",
    }


def test_budget_none_returns_all():
    work = [(100, _node(5)), (200, _node(10)), (300, _node(3))]
    assert fv._apply_version_budget(work, budget=None) == work


def test_budget_zero_returns_empty():
    work = [(100, _node(5)), (200, _node(3))]
    assert fv._apply_version_budget(work, budget=0) == []


def test_budget_stops_when_exhausted():
    # costs: 100→5, 200→10; budget=12
    # After 100: remaining=7; after 200: remaining=-3 (append then stop)
    # After overshoot: 300 is not appended (remaining=-3 <= 0)
    work = [(100, _node(5)), (200, _node(10)), (300, _node(3))]
    result = fv._apply_version_budget(work, budget=12)
    assert [id_ for id_, _ in result] == [100, 200]


def test_budget_exact_fit():
    # costs 5+10=15 exactly, budget=15
    work = [(100, _node(5)), (200, _node(10))]
    result = fv._apply_version_budget(work, budget=15)
    assert len(result) == 2


def test_budget_node_with_no_vigencias_costs_1():
    work = [(100, {}), (200, {})]
    result = fv._apply_version_budget(work, budget=1)
    assert [id_ for id_, _ in result] == [100]


def test_budget_filters_sentinel_dates():
    # Vigencia with year > 2100 should not count toward cost
    node = {"vigencias": [{"desde": "2222-02-02"}, {"desde": "2020-01-01"}]}
    # Only 1 valid vigencia → cost=1
    work = [(100, node), (200, _node(5))]
    result = fv._apply_version_budget(work, budget=1)
    assert [id_ for id_, _ in result] == [100]
```

- [ ] **Step 3.2: Run test to confirm failure**

```bash
python -m pytest tests/test_fetch_versions_budget.py -v
```
Expected: `AttributeError: module 'fetch_versions' has no attribute '_apply_version_budget'`

- [ ] **Step 3.3: Add `_apply_version_budget` helper to `fetch_versions.py`**

Add after the `PROGRESS_SAVE_EVERY` constant block (around line 52):

```python
def _apply_version_budget(
    work: list[tuple[int, dict]],
    budget: int | None,
) -> list[tuple[int, dict]]:
    """Truncate work queue so total version-fetch cost does not exceed budget.

    Cost of a norma = number of valid vigencias (sentinel dates excluded).
    The last item that pushes the budget negative is still included — overshoot
    is bounded by the cost of one norma (typically a few versions).
    """
    if budget is None:
        return work
    remaining = budget
    result = []
    for id_norma, node in work:
        if remaining <= 0:
            break
        vigencias = [
            v for v in node.get("vigencias", [])
            if v.get("desde", "") and int(v["desde"][:4]) <= 2100
        ]
        cost = max(1, len(vigencias))
        remaining -= cost
        result.append((id_norma, node))
    return result
```

- [ ] **Step 3.4: Run test to confirm pass**

```bash
python -m pytest tests/test_fetch_versions_budget.py -v
```
Expected: all 6 tests PASS

- [ ] **Step 3.5: Wire `--cache-dir` and `--version-budget` into `fetch_versions.py`**

**a)** Change `run()` signature from:
```python
async def run(data_root: Path, limit: int | None, only_id: int | None) -> None:
```
to:
```python
async def run(
    data_root: Path,
    limit: int | None,
    only_id: int | None,
    cache_dir: Path | None = None,
    version_budget: int | None = None,
) -> None:
    if cache_dir is None:
        cache_dir = data_root / "cache"
```

**b)** In `run()`, replace the conditional sort block (lines ~362–365):
```python
    if limit:
        candidates = sorted(candidates, key=lambda t: t[1].get("fechaPublicacion") or "")
        candidates = candidates[-abs(limit):] if limit < 0 else candidates[:limit]
```
with:
```python
    candidates = sorted(candidates, key=lambda t: t[1].get("fechaPublicacion") or "")
    if limit:
        candidates = candidates[-abs(limit):] if limit < 0 else candidates[:limit]
```

**c)** Replace the two cache dir lines (lines ~367–369):
```python
    versions_cache_dir = data_root / "cache" / "versions"
    diffs_cache_dir = data_root / "cache" / "diffs"
```
with:
```python
    versions_cache_dir = cache_dir / "versions"
    diffs_cache_dir = cache_dir / "diffs"
```

**d)** In the work queue building loop (immediately after the `done_set` check), add a diffs-file existence check. This ensures already-cached normas are skipped even when there is no `fetch_versions_progress.json` (which is always the case in GH Actions):

```python
    work = []
    for id_str, node in candidates:
        id_norma = int(id_str)
        if id_norma in done_set:
            continue
        # Skip normas whose diffs file already exists — handles fresh checkouts
        # where done_set is empty but the cache branch already has results.
        if (diffs_cache_dir / f"{id_str}.json").exists():
            done_set.add(id_norma)
            continue
        if failed_map.get(id_str, 0) >= 3:
            continue
        work.append((id_norma, node))
```

This replaces the existing work queue building block (the `for id_str, node in candidates:` loop).

**e)** Add budget truncation after the revised work queue is built (after the `logger.info("To process: ...")` call, before `if not work:`):
```python
    work = _apply_version_budget(work, version_budget)
    if version_budget is not None:
        logger.info("Budget %d: processing %d normas", version_budget, len(work))
```

**f)** In `_write_outputs`, add `write_law_outputs: bool = True` parameter. Wrap steps 2–4 (the versiones.json and texto.md writes) in `if write_law_outputs:`:

```python
def _write_outputs(
    id_norma: int,
    node: dict,
    diff_list: list,
    latest_flat: dict[int, str],
    diffs_cache_dir: Path,
    data_root: Path,
    write_law_outputs: bool = True,
) -> None:
    # Step 1 unchanged: write diffs file
    diffs_cache_dir.mkdir(parents=True, exist_ok=True)
    diff_path = diffs_cache_dir / f"{id_norma}.json"
    diff_path.write_text(json.dumps(diff_list, ensure_ascii=False, indent=2), encoding="utf-8")

    if not write_law_outputs:
        return

    # Steps 2–4: versiones.json, texto.md (local/historial mode only)
    # ... rest of existing _write_outputs body unchanged ...
```

**g)** In the `process()` coroutine inside `run()`, pass `write_law_outputs=(cache_dir == data_root / "cache")`:
```python
                _write_outputs(
                    id_norma, node, diff_list, latest_flat or {},
                    diffs_cache_dir, data_root,
                    write_law_outputs=(cache_dir == data_root / "cache"),
                )
```

**h)** Add CLI args to `main()`:
```python
    parser.add_argument(
        "--cache-dir",
        metavar="PATH",
        default=None,
        help="Directory for cache files (default: {data-root}/cache)",
    )
    parser.add_argument(
        "--version-budget",
        type=int,
        metavar="N",
        default=None,
        help="Max total version-fetches for this run",
    )
```

**i)** In `main()`, change the `asyncio.run(...)` call:
```python
    cache_dir = Path(args.cache_dir).resolve() if args.cache_dir else None
    asyncio.run(run(data_root, args.limit, args.id, cache_dir, args.version_budget))
```

- [ ] **Step 3.6: Run full test suite to confirm no regressions**

```bash
python -m pytest -v
```
Expected: all tests pass (budget tests green; others unchanged)

- [ ] **Step 3.7: Commit**

```bash
git add scripts/fetch_versions.py tests/test_fetch_versions_budget.py
git commit -m "feat(fetch_versions): --cache-dir, --version-budget for incremental GH Actions runs"
```

---

## Task 4: Modify `scripts/build_history.py` — add `--cache-dir`, `--from`, `--to`

**Files:**
- Modify: `scripts/build_history.py`
- Create: `tests/test_build_history_dates.py`

- [ ] **Step 4.1: Write failing tests**

Create `tests/test_build_history_dates.py`:

```python
"""Tests for build_history.py --from/--to date filtering and --cache-dir."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_history as bh


def _write_diffs(cache_dir: Path, id_norma: int, fecha: str) -> None:
    diffs_dir = cache_dir / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    entry = [{"fecha": fecha, "modificadaPor": None, "diff": None}]
    (diffs_dir / f"{id_norma}.json").write_text(
        json.dumps(entry), encoding="utf-8"
    )


def _node(numero: str, fecha: str) -> dict:
    return {
        "numero": numero,
        "fechaPublicacion": fecha,
        "titulo": f"Ley {numero}",
        "tipo": "Ley",
        "clasificacion": "sustantiva",
        "organismos": [],
        "vigencias": [{"desde": fecha}],
        "derogado": False,
        "modificadaPor_edges": [],
    }


def test_no_filter_returns_all_events(tmp_path):
    graph = {"100": _node("100", "2020-01-01"), "200": _node("200", "2021-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")
    _write_diffs(cache_dir, 200, "2021-01-01")

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir)
    assert len(events) == 2


def test_to_date_filters_later_events(tmp_path):
    graph = {"100": _node("100", "2020-01-01"), "200": _node("200", "2021-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")
    _write_diffs(cache_dir, 200, "2021-01-01")

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir, to_date="2020-12-31")
    assert len(events) == 1
    assert events[0].date == "2020-01-01"


def test_from_date_filters_earlier_events(tmp_path):
    graph = {"100": _node("100", "2020-01-01"), "200": _node("200", "2021-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")
    _write_diffs(cache_dir, 200, "2021-01-01")

    # --from is EXCLUSIVE: events with date > from_date
    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir, from_date="2020-06-01")
    assert len(events) == 1
    assert events[0].date == "2021-01-01"


def test_from_date_exact_match_is_excluded(tmp_path):
    """from_date is exclusive: norma exactly on that date is not included."""
    graph = {"100": _node("100", "2020-01-01")}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, "2020-01-01")

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir, from_date="2020-01-01")
    assert len(events) == 0


def test_cache_dir_separates_from_data_root(tmp_path):
    """_collect_events reads diffs from cache_dir, not data_root/cache."""
    graph = {"100": _node("100", "2020-01-01")}
    # Diffs only in cache_dir, not in data_root/cache
    cache_dir = tmp_path / "separate_cache"
    _write_diffs(cache_dir, 100, "2020-01-01")

    wrong_cache = tmp_path / "cache"
    wrong_cache.mkdir(parents=True)
    (wrong_cache / "diffs").mkdir()
    # No diffs in wrong_cache/diffs

    events = bh._collect_events(graph, tmp_path, cache_dir=cache_dir)
    assert len(events) == 1

    events_wrong = bh._collect_events(graph, tmp_path, cache_dir=wrong_cache)
    assert len(events_wrong) == 0
```

- [ ] **Step 4.2: Run test to confirm failure**

```bash
python -m pytest tests/test_build_history_dates.py -v
```
Expected: failures because `_collect_events` doesn't accept `cache_dir`, `from_date`, `to_date`.

- [ ] **Step 4.3: Update helper functions in `build_history.py`**

**a)** Change `_load_diffs` to take `cache_dir` instead of `data_root`:
```python
def _load_diffs(cache_dir: Path, id_norma: int) -> list | None:
    diff_path = cache_dir / "diffs" / f"{id_norma}.json"
    if not diff_path.exists():
        return None
    try:
        return json.loads(diff_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.debug("Failed to load diffs for %s: %s", id_norma, exc)
        return None
```

**b)** Change `_load_version_json` to take `cache_dir`:
```python
def _load_version_json(cache_dir: Path, id_norma: int, fecha: str) -> dict | None:
    ver_path = cache_dir / "versions" / str(id_norma) / f"{fecha}.json"
    if not ver_path.exists():
        return None
    try:
        return json.loads(ver_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.debug("Failed to load version %s/%s: %s", id_norma, fecha, exc)
        return None
```

**c)** Change `_version_files` to accept both `data_root` (for path computation) and `cache_dir` (for reading):
```python
def _version_files(
    data_root: Path,
    cache_dir: Path,
    id_norma: int,
    fecha: str,
    node: dict,
    rel_dir: Path,
) -> dict[str, bytes]:
    ver_data = _load_version_json(cache_dir, id_norma, fecha)
    files: dict[str, bytes] = {}
    if ver_data:
        texto = _flatten_to_texto(ver_data.get("html", []))
        if texto:
            files[str(rel_dir / "texto.md")] = texto.encode("utf-8")
    meta = {
        "idNorma": id_norma,
        "numero": node.get("numero"),
        "titulo": node.get("titulo"),
        "fechaPublicacion": node.get("fechaPublicacion"),
        "tipo": node.get("tipo"),
        "clasificacion": node.get("clasificacion"),
        "version": fecha,
    }
    files[str(rel_dir / "metadata.json")] = json.dumps(
        meta, ensure_ascii=False, indent=2
    ).encode("utf-8")
    return files
```

**d)** Change `_collect_events` signature and body:
```python
def _collect_events(
    graph: dict,
    data_root: Path,
    cache_dir: Path | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[CommitContext]:
    if cache_dir is None:
        cache_dir = data_root / "cache"

    events_by_cause: dict[tuple, CommitContext] = {}
    seq = 0

    for id_norma_str, node in graph.items():
        try:
            id_norma = int(id_norma_str)
        except ValueError:
            continue

        diffs = _load_diffs(cache_dir, id_norma)   # <-- changed: cache_dir
        if not diffs:
            continue

        rel_dir = _law_dir_from_node(node, id_norma, data_root).relative_to(data_root)
        derogado = node.get("derogado", False)

        for i, entry in enumerate(diffs):
            fecha = entry.get("fecha", "")
            if not fecha:
                continue

            modificada_por = entry.get("modificadaPor")
            is_last = (i == len(diffs) - 1)

            if i == 0 or not modificada_por:
                causa_id_str = id_norma_str
                causa_numero = node.get("numero", id_norma_str)
                causa_titulo = node.get("titulo", "")
                causa_fecha = node.get("fechaPublicacion") or fecha
                causa_node = node
            else:
                causa_id_str = str(modificada_por["idNorma"])
                causa_numero = modificada_por.get("numero") or causa_id_str
                causa_titulo = modificada_por.get("titulo", "")
                causa_fecha = fecha
                causa_node = graph.get(causa_id_str, {})

            # Date window filter (from_date exclusive, to_date inclusive)
            if from_date and causa_fecha <= from_date:
                continue
            if to_date and causa_fecha > to_date:
                continue

            key = (causa_fecha, causa_id_str)

            if key not in events_by_cause:
                seq += 1
                causa_scope = _scope_for_node(causa_node)
                causa_org = (causa_node.get("organismos") or [""])[0]
                events_by_cause[key] = CommitContext(
                    tipo="feat",
                    scope=causa_scope,
                    ley_numero=causa_numero,
                    id_norma=int(causa_id_str) if causa_id_str.isdigit() else 0,
                    date=causa_fecha,
                    titulo=causa_titulo,
                    subject=_commit_subject_causa(causa_scope, causa_numero, causa_fecha, causa_org),
                    body="\n".join(filter(None, [causa_titulo, f"BCN idNorma={causa_id_str}"])),
                    _seq=seq,
                    _rank=0,
                )

            events_by_cause[key].files.update(
                _version_files(data_root, cache_dir, id_norma, fecha, node, rel_dir)  # <-- changed
            )

            if is_last and derogado:
                all_paths = [str(rel_dir / "texto.md"), str(rel_dir / "metadata.json")]
                symlinks: dict[str, str] = {}
                succ_numero = _find_successor(graph, id_norma)
                if succ_numero:
                    succ_node = next(
                        (n for n in graph.values() if str(n.get("numero")) == str(succ_numero)),
                        None,
                    )
                    if succ_node:
                        succ_id = int(next(
                            (k for k, v in graph.items() if v is succ_node), 0
                        ))
                        succ_rel = _law_dir_from_node(
                            succ_node, succ_id, data_root
                        ).relative_to(data_root)
                        symlinks[str(rel_dir)] = str(succ_rel)
                events_by_cause[key].deletes.extend(all_paths)
                events_by_cause[key].symlinks.update(symlinks)

    return list(events_by_cause.values())
```

**e)** Add CLI args to `main()`:
```python
    parser.add_argument(
        "--cache-dir",
        metavar="PATH",
        default=None,
        help="Override cache directory (default: {data-root}/cache)",
    )
    parser.add_argument(
        "--from",
        dest="from_date",
        metavar="DATE",
        default=None,
        help="Only emit commits for causing normas with date > DATE (exclusive, YYYY-MM-DD)",
    )
    parser.add_argument(
        "--to",
        dest="to_date",
        metavar="DATE",
        default=None,
        help="Only emit commits for causing normas with date <= DATE (inclusive, YYYY-MM-DD)",
    )
```

**f)** Wire `cache_dir`, `from_date`, `to_date` into the `main()` function body:
```python
    cache_dir = Path(args.cache_dir).resolve() if args.cache_dir else data_root / "cache"
    events = _collect_events(
        graph, data_root,
        cache_dir=cache_dir,
        from_date=args.from_date,
        to_date=args.to_date,
    )
```

- [ ] **Step 4.4: Run tests to confirm pass**

```bash
python -m pytest tests/test_build_history_dates.py -v
```
Expected: all 5 tests PASS

- [ ] **Step 4.5: Run full test suite**

```bash
python -m pytest -v
```
Expected: all tests pass

- [ ] **Step 4.6: Commit**

```bash
git add scripts/build_history.py tests/test_build_history_dates.py
git commit -m "feat(build_history): --cache-dir, --from DATE, --to DATE for windowed commits"
```

---

## Task 5: Add sentinel markers to `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 5.1: Add the status block to `README.md`**

Insert after the first `## ` header (after the project description paragraph, before `## Por qué existe`):

```markdown
<!-- PIPELINE_STATUS_START -->
## Pipeline Status
| | |
|---|---|
| **Historial** | `░░░░░░░░░░░░░░░░░░░░` 0% · watermark — · 0 normas |
| **Cache**     | `░░░░░░░░░░░░░░░░░░░░` 0% · 0 / 0 normas fetched |
| **Last run**  | — |
<!-- PIPELINE_STATUS_END -->
```

- [ ] **Step 5.2: Verify markers are present**

```bash
grep -n "PIPELINE_STATUS" README.md
```
Expected output:
```
N:<!-- PIPELINE_STATUS_START -->
M:<!-- PIPELINE_STATUS_END -->
```

- [ ] **Step 5.3: Commit**

```bash
git add README.md
git commit -m "chore: add pipeline status sentinel markers to README"
```

---

## Task 6: `.github/workflows/update-graph.yml`

**Files:**
- Create: `.github/workflows/update-graph.yml`

- [ ] **Step 6.1: Create the workflow**

```yaml
name: Update Graph

on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * 1"  # Monday 06:00 UTC

concurrency:
  group: pipeline-graph
  cancel-in-progress: false

jobs:
  update-graph:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Configure git
        run: |
          git config user.name "ley-chile-bot"
          git config user.email "bot@ley-chile"

      - name: Build catalog
        run: python scripts/build_catalog.py --data-root .

      - name: Fetch normas graph
        run: python scripts/fetch_normas.py --data-root .

      - name: Commit graph.json and catalog.json
        run: |
          git add graph.json catalog.json
          git diff --cached --quiet && echo "No changes to graph" && exit 0
          git commit -m "chore: update graph.json and catalog.json"
          git push origin ${{ github.ref_name }}
```

- [ ] **Step 6.2: Verify YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/update-graph.yml'))" && echo "OK"
```
Expected: `OK`

- [ ] **Step 6.3: Commit**

```bash
git add .github/workflows/update-graph.yml
git commit -m "ci: update-graph workflow — rebuild graph.json weekly"
```

---

## Task 7: `.github/workflows/fetch-and-build.yml`

**Files:**
- Create: `.github/workflows/fetch-and-build.yml`

- [ ] **Step 7.1: Create the workflow**

```yaml
name: Fetch and Build

on:
  schedule:
    - cron: "0 */6 * * *"  # Every 6 hours
  workflow_dispatch:
    inputs:
      version_budget:
        description: "Max version-fetches per run (default: 20000)"
        required: false
        default: "20000"
      notify_url:
        description: "ntfy.sh webhook URL for completion notification"
        required: false
        default: ""
      dry_run:
        description: "Compute watermark but do not push historial"
        type: boolean
        required: false
        default: false

concurrency:
  group: historial-write
  cancel-in-progress: false

jobs:
  fetch-and-build:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Configure git
        run: |
          git config user.name "ley-chile-bot"
          git config user.email "bot@ley-chile"

      # ── pipeline-cache worktree ──────────────────────────────────────────
      - name: Set up pipeline-cache worktree
        run: |
          if git fetch origin pipeline-cache 2>/dev/null; then
            git worktree add cache pipeline-cache
          else
            git checkout --orphan pipeline-cache
            git rm -rf . --quiet
            git commit --allow-empty -m "init: pipeline-cache branch"
            git push origin pipeline-cache
            git checkout -
            git worktree add cache pipeline-cache
          fi

      # ── historial worktree ───────────────────────────────────────────────
      - name: Set up historial worktree
        run: |
          if git fetch origin historial 2>/dev/null; then
            git worktree add historial historial
          else
            git checkout --orphan historial
            git rm -rf . --quiet
            git commit --allow-empty -m "init: historial branch"
            git push origin historial
            git checkout -
            git worktree add historial historial
          fi

      # ── Step 1: fill the cache ───────────────────────────────────────────
      - name: Fetch versions into pipeline-cache
        run: |
          python scripts/fetch_versions.py \
            --data-root . \
            --cache-dir ./cache \
            --version-budget ${{ github.event.inputs.version_budget || '20000' }} \
            --verbose

      - name: Commit and push pipeline-cache
        run: |
          git -C cache add -A
          git -C cache diff --cached --quiet && echo "No new cache data" || (
            git -C cache commit -m \
              "cache: batch fetch $(date -u +%Y-%m-%dT%H:%M:%SZ)"
            for attempt in 1 2 3 4; do
              git push origin pipeline-cache && break || sleep $((attempt * 3))
            done
          )

      # ── Step 2: compute watermark ────────────────────────────────────────
      - name: Compute watermark
        id: watermark
        run: |
          python scripts/compute_watermark.py \
            --graph-path ./graph.json \
            --cache-dir ./cache \
            --historial-dir ./historial \
            --output-env

      # ── Step 3: advance historial ────────────────────────────────────────
      - name: Build historial window
        if: |
          steps.watermark.outputs.watermark_advanced == 'true' &&
          github.event.inputs.dry_run != 'true'
        run: |
          python scripts/build_history.py \
            --data-root . \
            --cache-dir ./cache \
            --append \
            --from ${{ steps.watermark.outputs.W }} \
            --to   ${{ steps.watermark.outputs.D }} \
            --enrichers tramitacion

      - name: Push historial
        if: |
          steps.watermark.outputs.watermark_advanced == 'true' &&
          github.event.inputs.dry_run != 'true'
        run: |
          for attempt in 1 2 3 4; do
            git push origin historial && break || sleep $((attempt * 3))
          done

      # ── Step 4: update README ────────────────────────────────────────────
      - name: Update README status
        run: |
          python scripts/update_readme_status.py \
            --readme README.md \
            --graph-path ./graph.json \
            --cache-dir ./cache \
            --historial-dir ./historial

      - name: Commit README
        run: |
          git add README.md
          git diff --cached --quiet && echo "README unchanged" || (
            git commit -m \
              "chore: update pipeline status [skip ci]"
            git push origin ${{ github.ref_name }}
          )

      # ── Notification ─────────────────────────────────────────────────────
      - name: Notify completion
        if: ${{ github.event.inputs.notify_url != '' }}
        run: |
          curl -s -X POST ${{ github.event.inputs.notify_url }} \
            -H "Content-Type: application/json" \
            -d "{\"title\": \"ley-chile fetch-and-build done\",
                 \"message\": \"cache=${{ steps.watermark.outputs.cached_normas }}/${{ steps.watermark.outputs.total_normas }} watermark=${{ steps.watermark.outputs.D }}\"}" \
            || true
```

- [ ] **Step 7.2: Verify YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/fetch-and-build.yml'))" && echo "OK"
```
Expected: `OK`

- [ ] **Step 7.3: Commit**

```bash
git add .github/workflows/fetch-and-build.yml
git commit -m "ci: fetch-and-build workflow — incremental cache fill + historial advance"
```

---

## Task 8: Update `CLAUDE.md` with `pipeline-cache` setup

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 8.1: Add `pipeline-cache` worktree instructions to `CLAUDE.md`**

In the "Two-Branch Design" section, change the heading to "Three-Branch Design" and add the new branch after the existing two entries:

```markdown
### Three-Branch Design

- **Code branch** (`claude/graph-first-pipeline`, etc.): scripts, requirements, config, `graph.json`, `catalog.json`. Never contains law data.
- **`pipeline-cache` (orphan branch)**: fetched version data — `cache/versions/`, `cache/diffs/`. Mounted as a git worktree at `./cache/`.
- **`historial` (orphan branch)**: law data commits built by `build_history.py`. Mounted as a git worktree at `./historial/`.

Create the pipeline-cache worktree (first time):
```bash
git checkout --orphan pipeline-cache && git rm -rf . && git commit --allow-empty -m "init"
git checkout - && git worktree add cache pipeline-cache
```

Reset pipeline-cache to clean orphan (for testing):
```bash
git -C cache checkout --orphan tmp-clean
git -C cache commit --allow-empty -m "init"
git branch -D pipeline-cache
git -C cache branch -m tmp-clean pipeline-cache
```
```

Also update the "Running the pipeline" section to document `--cache-dir` and `--version-budget`:

```markdown
# Run with separate cache dir (GH Actions style):
LEYCHILE_DATA_ROOT=. python scripts/fetch_versions.py --cache-dir ./cache --version-budget 5000
python scripts/build_history.py --data-root . --cache-dir ./cache --append --from 2020-01-01 --to 2022-12-31

# Compute watermark:
python scripts/compute_watermark.py --graph-path ./graph.json --cache-dir ./cache --historial-dir ./historial

# Update README progress bar:
python scripts/update_readme_status.py --graph-path ./graph.json --cache-dir ./cache --historial-dir ./historial
```

- [ ] **Step 8.2: Run the full test suite one final time**

```bash
python -m pytest -v
```
Expected: all tests pass

- [ ] **Step 8.3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): three-branch design, pipeline-cache setup, new script flags"
```

---

## Self-Review Checklist

After completing all tasks:

- [ ] `compute_watermark.py` handles empty graph, empty cache, partial cache, full cache
- [ ] `update_readme_status.py` handles zero-total without division by zero
- [ ] `fetch_versions.py --cache-dir` doesn't write versiones.json/texto.md to repo root
- [ ] `build_history.py --from` is exclusive (norma exactly on that date is excluded)
- [ ] `build_history.py --to` is inclusive
- [ ] Workflow `update-graph.yml` commits `graph.json` and `catalog.json` to the code branch
- [ ] Workflow `fetch-and-build.yml` skips historial push when `watermark_advanced == false`
- [ ] Workflow `fetch-and-build.yml` respects `dry_run` input
- [ ] `[skip ci]` in README commit prevents infinite workflow loop
- [ ] All YAML files pass `yaml.safe_load` check
