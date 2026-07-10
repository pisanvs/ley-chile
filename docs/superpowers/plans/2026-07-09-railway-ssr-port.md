# Railway SSR Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ley-chile off GitHub Pages onto Railway with Next.js SSR, Postgres as a derived read model, and tiered search (Meilisearch hot path + Postgres FTS cold path).

**Architecture:** The GitHub Actions pipeline keeps writing the canonical `historial` git branch and additionally exports gzipped NDJSON snapshot artifacts. A Python cron loader on Railway ingests those into Postgres, verifies every version reconstructs correctly, indexes the hot tier into Meilisearch, and retiers based on usage signals. A Next.js App Router app server-renders every norma page from Postgres behind Cloudflare.

**Tech Stack:** Python 3.11 (pipeline + loader), Postgres 16, Meilisearch v1, Next.js 16 App Router, React 19, TypeScript 5.7, pnpm 9.15.

**Spec:** `docs/superpowers/specs/2026-07-09-railway-ssr-port-design.md`

> **Scope note.** The writing-plans skill would normally split this into two plans (data plane, web tier), since they share only the Postgres schema. Max explicitly asked for one plan. Tasks 1–11 are the data plane and are independently testable and shippable; tasks 12–17 are the web tier. If execution stalls, Task 11 is a clean stopping point with working software.

## Global Constraints

- **Branch:** `feat/railway-ssr`. **Worktree:** `/home/pisanvs/code/ley-chile/.worktrees/railway-ssr`. All paths below are relative to that worktree root; use absolute paths in every command.
- **`git commit` must run with the sandbox disabled** — GPG signing needs write access to `~/.gnupg`, which the sandbox mounts read-only. `git add`/`status`/`log` work sandboxed.
- **Never `git add web/dist`** — it is the `pages` orphan branch worktree.
- **Python ≥3.11.** Existing tests cover pure functions only: no network, no git. New DB tests are marked `@pytest.mark.integration` and skip without `DATABASE_URL`.
- **Every date derives from `real_date()`** in `scripts/build_web_indexes.py`. Git committer dates are wrong: GitHub rejects negative Unix timestamps, so pre-1970 events clamp to 1970-01-01.
- **Sentinel date:** LeyChile uses `2222-02-02` for open-ended "current" versions. Filter with `int(date[:4]) <= 2100`; store as `hasta = NULL`.
- **Meilisearch open-ended sentinel:** `hasta_ts = 253402300799`.
- **Never set `distinctAttribute` at the Meilisearch index level.** Pass `distinct: "id_norma"` per-search.
- **Ordinal normalization:** strip `[°º]` **before** NFKD, in both Python and TypeScript. See spec §6.3. `º` (U+00BA) decomposes to `o` under NFKD; `°` (U+00B0) does not.
- **New Python deps** go in `requirements-loader.txt` (the loader image), not `requirements.txt` (the pipeline image).

## File Structure

**Data plane (Python):**

| File | Responsibility |
|---|---|
| `scripts/segment.py` | Article segmentation, slugs, canonical form. Pure. Single source of truth. |
| `scripts/spans.py` | Article dedup + contiguous span coalescing + reconstruction. Pure. |
| `scripts/schemas/snapshot.py` | NDJSON row dataclasses shared by exporter and loader. |
| `scripts/export_snapshot.py` | Walk `historial`, emit NDJSON shards + `manifest.json`. |
| `scripts/measure_phase0.py` | Phase 0 gate: segmentation coverage over the real branch. |
| `sql/001_schema.sql` | DDL: tables, extensions, constraints, analytics schema, matview. |
| `scripts/loader/db.py` | Connection + schema application. |
| `scripts/loader/load.py` | Idempotent upserts. |
| `scripts/loader/verify.py` | Canonical-form reconstruction gate. |
| `scripts/loader/index_meili.py` | Postgres → Meilisearch, hot tier only. |
| `scripts/loader/retier.py` | Refresh signal matview, promote, enforce budget. |
| `scripts/loader/main.py` | Cron entry: load → verify → index → retier → revalidate. |

**Web tier (TypeScript), new directory `site/`:** the existing Vite SPA in `web/` stays until cutover (Task 17).

| File | Responsibility |
|---|---|
| `site/lib/db.ts` | Postgres pool. |
| `site/lib/norma.ts` | Norma/version/article queries. |
| `site/lib/search.ts` | `searchHot` (Meili) + `searchCold` (PG FTS). |
| `site/lib/analytics.ts` | Buffered event writer. |
| `site/lib/jsonld.ts` | schema.org `Legislation` builder. |
| `site/app/[tipo]/[numero]/page.tsx` | Current text. |
| `site/app/[tipo]/[numero]/[fecha]/page.tsx` | Text as of date. |
| `site/app/buscar/page.tsx` | Tiered search UI. |
| `site/app/api/revalidate/route.ts` | Loader webhook → `revalidateTag`. |
| `site/app/api/events/route.ts` | Client click events. |
| `site/app/sitemap.ts` | `generateSitemaps`, 50k URLs per file. |

---

### Task 1: Fix the ordinal bug in TypeScript, extract `segment.ts`

Segmentation currently lives inside `web/src/lib/diff.ts` alongside `diff-match-patch`. Extract it so the golden dumper can import it without pulling in the diff engine, and fix the `[°º]` ordering bug in the same move. Fixing TS first means the golden file (Task 3) records *correct* behavior, and Python is ported against a fixed reference rather than a buggy one.

**Files:**
- Create: `web/src/lib/segment.ts`
- Create: `web/src/lib/segment.test.ts`
- Modify: `web/src/lib/diff.ts` (remove segmentation, re-export from `segment.ts`)

**Interfaces:**
- Consumes: nothing.
- Produces: `Segment` interface (`label`, `slug`, `rawHeading`, `body`), `normalizeLabel(s: string): string`, `labelToSlug(label: string): string`, `segment(text: string): Segment[]`, `canonicalText(segs: Segment[]): string`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/segment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeLabel, labelToSlug, segment, canonicalText } from './segment'

describe('ordinal characters normalize identically', () => {
  it('U+00BA and U+00B0 produce the same slug', () => {
    // 'º' (masculine ordinal) decomposes to 'o' under NFKD; '°' (degree) does not.
    expect(labelToSlug(normalizeLabel('articulo 1º'))).toBe('art-1')
    expect(labelToSlug(normalizeLabel('articulo 1°'))).toBe('art-1')
    expect(labelToSlug(normalizeLabel('articulo 1'))).toBe('art-1')
  })
})

describe('segment', () => {
  it('splits markdown headings and keeps a preamble', () => {
    const text = 'Preámbulo aquí.\n\n#### Artículo 1º\nCuerpo uno.\n\n#### Artículo 2°\nCuerpo dos.'
    const segs = segment(text)
    expect(segs.map(s => s.slug)).toEqual(['preambulo', 'art-1', 'art-2'])
    expect(segs[1].rawHeading).toBe('Artículo 1º')
    expect(segs[1].body).toBe('Cuerpo uno.')
  })

  it('falls back to a single __doc__ segment when nothing matches', () => {
    const segs = segment('Texto sin artículos.')
    expect(segs).toHaveLength(1)
    expect(segs[0].slug).toBe('doc')
    expect(segs[0].body).toBe('Texto sin artículos.')
  })

  it('handles inline markers when no markdown headings exist', () => {
    const segs = segment('Artículo 1°.- Cuerpo uno. Artículo 2°.- Cuerpo dos.')
    expect(segs.map(s => s.slug)).toEqual(['art-1', 'art-2'])
  })
})

describe('canonicalText', () => {
  it('is whitespace-insensitive but order- and body-sensitive', () => {
    const a = segment('#### Artículo 1º\nCuerpo.\n\n')
    const b = segment('#### Artículo 1º\n\n   Cuerpo.   ')
    expect(canonicalText(a)).toBe(canonicalText(b))
    expect(canonicalText(a)).toBe('Artículo 1º\nCuerpo.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/web && pnpm vitest run src/lib/segment.test.ts`
Expected: FAIL — `Failed to resolve import "./segment"`.

- [ ] **Step 3: Create `web/src/lib/segment.ts`**

Move the segmentation code out of `diff.ts` verbatim, with exactly two changes: `[°º]` is stripped **before** NFKD, and `canonicalText` is added.

```ts
/** A segment of legislative text keyed by its article-heading label. */
export interface Segment {
  label: string
  slug: string
  rawHeading: string
  body: string
}

export function labelToSlug(label: string): string {
  if (label === '__preamble__') return 'preambulo'
  if (label === '__doc__') return 'doc'
  return label
    .replace(/^articulo\s+/, 'art-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Normalize a label so different spellings of the same article match.
 *
 *  Ordinal markers are stripped BEFORE NFKD. 'º' (U+00BA) has a compatibility
 *  decomposition to 'o', so stripping after NFKD would leave "articulo 1o"
 *  while "1°" yields "articulo 1" — one article, two slugs. See spec §6.3.
 */
export function normalizeLabel(s: string): string {
  return s
    .replace(/[°º]/g, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bart\./g, 'articulo')
    .replace(/\s+/g, ' ')
    .trim()
}

const HEADING_RE = new RegExp(
  '(^|\\s)(Art[íi]culo|Art\\.)\\s+([0-9]+[°º]?(?:\\s+(?:bis|ter|quater|qu[íi]nquies))?|[úu]nico|primero|segundo|tercero|cuarto|quinto|sexto|s[ée]ptimo|octavo|noveno|d[ée]cimo|transitorio|final)(?:\\s+transitori[ao])?\\.?-',
  'gi'
)

// NOTE: the `\b` after `Art(?:ículo|\.)` means the `Art.` abbreviation can never
// match here — `.` and the following space are both non-word characters, so no
// boundary exists. Preserved deliberately: render_texto.py:286 always emits
// `#### Artículo {num}`, and changing this would re-slug committed text.
const MD_HEADING_RE = /^(#{2,4})\s+Art(?:[íi]culo|\.)\b\s+(\S[^\n]*?)\s*$/gim

export function segment(text: string): Segment[] {
  const mdMatches = [...text.matchAll(MD_HEADING_RE)]
  if (mdMatches.length > 0) return segmentMarkdownHeadings(text, mdMatches)

  const inlineMatches = [...text.matchAll(HEADING_RE)]
  if (inlineMatches.length === 0) {
    return [{ label: '__doc__', slug: labelToSlug('__doc__'), rawHeading: '', body: text.trim() }]
  }
  return segmentInlineMarkers(text, inlineMatches)
}

function preambleOf(text: string, firstStart: number): Segment[] {
  const preamble = text.slice(0, firstStart).trim()
  if (!preamble) return []
  return [{ label: '__preamble__', slug: labelToSlug('__preamble__'), rawHeading: '', body: preamble }]
}

function segmentMarkdownHeadings(text: string, matches: RegExpMatchArray[]): Segment[] {
  const segments: Segment[] = preambleOf(text, matches[0].index ?? 0)
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const headingEnd = (m.index ?? 0) + m[0].length
    const segEnd = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length
    const identifier = (m[2] || '').trim()
    const label = normalizeLabel(`articulo ${identifier}`)
    segments.push({
      label,
      slug: labelToSlug(label),
      rawHeading: `Artículo ${identifier}`,
      body: text.slice(headingEnd, segEnd).trim(),
    })
  }
  return segments
}

function segmentInlineMarkers(text: string, matches: RegExpMatchArray[]): Segment[] {
  const segments: Segment[] = preambleOf(text, matches[0].index ?? 0)
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const lead = m[1]?.length ?? 0
    const start = (m.index ?? 0) + lead
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length
    const chunk = text.slice(start, end)
    const headingMatchLen = m[0].length - lead
    const identifier = (m[3] || '').trim()
    const kind = (m[2] || 'Artículo').trim().toLowerCase().startsWith('art') ? 'articulo' : m[2]
    const label = normalizeLabel(`${kind} ${identifier}`)
    segments.push({
      label,
      slug: labelToSlug(label),
      rawHeading: chunk.slice(0, headingMatchLen).trim(),
      body: chunk.slice(headingMatchLen).trim(),
    })
  }
  return segments
}

/** Order-, heading- and body-sensitive; whitespace-insensitive. The validation
 *  gate (spec §8.1) compares sha256 of this, not of the raw texto.md. */
export function canonicalText(segs: Segment[]): string {
  return segs.map(s => (s.rawHeading ? `${s.rawHeading}\n${s.body}` : s.body)).join('\n\n')
}
```

- [ ] **Step 4: Rewrite `web/src/lib/diff.ts` to re-export**

Delete lines 3–144 of `web/src/lib/diff.ts` (the `Segment` interface through `segmentInlineMarkers`) and replace with a re-export. The file keeps `Aligned`, `align`, `DiffOp`, `wordDiff`, `joinDiffText` unchanged.

```ts
import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'
import type { Segment } from './segment'

export type { Segment } from './segment'
export { normalizeLabel, labelToSlug, segment, canonicalText } from './segment'

// ... existing Aligned / align / DiffOp / wordDiff / joinDiffText unchanged ...
```

- [ ] **Step 5: Run both test files**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/web && pnpm vitest run src/lib/segment.test.ts src/lib/diff.test.ts`
Expected: PASS. If `diff.test.ts` asserts `art-1o` anywhere, update that assertion to `art-1` — the old value encoded the bug.

- [ ] **Step 6: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add web/src/lib/segment.ts web/src/lib/segment.test.ts web/src/lib/diff.ts web/src/lib/diff.test.ts
git commit -m "fix(web): normalize ordinal markers before NFKD; extract segment.ts

'º' (U+00BA) decomposes to 'o' under NFKD while '°' (U+00B0) does not, so
'Artículo 1º' and 'Artículo 1°' produced different slugs for the same
article. align() matches by label, so any version where BCN switched
ordinal characters rendered as a total rewrite."
```

---

### Task 2: Port segmentation to Python

**Files:**
- Create: `scripts/segment.py`
- Create: `tests/test_segment.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `Segment` (frozen dataclass: `label: str`, `slug: str`, `raw_heading: str`, `body: str`), `normalize_label(s: str) -> str`, `label_to_slug(label: str) -> str`, `segment(text: str) -> list[Segment]`, `canonical_text(segs: list[Segment]) -> str`, `sha256_text(s: str) -> str`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_segment.py`:

```python
"""Segmentation is the single source of truth for article identity."""
import pytest
from segment import (
    Segment, normalize_label, label_to_slug, segment, canonical_text, sha256_text,
)


@pytest.mark.parametrize("ident", ["1º", "1°", "1"])
def test_ordinal_variants_share_one_slug(ident):
    assert label_to_slug(normalize_label(f"articulo {ident}")) == "art-1"


def test_label_to_slug_specials():
    assert label_to_slug("__preamble__") == "preambulo"
    assert label_to_slug("__doc__") == "doc"
    assert label_to_slug("articulo 5 bis") == "art-5-bis"
    assert label_to_slug("articulo unico") == "art-unico"


def test_segment_markdown_headings_with_preamble():
    text = "Preámbulo.\n\n#### Artículo 1º\nCuerpo uno.\n\n#### Artículo 2°\nCuerpo dos."
    segs = segment(text)
    assert [s.slug for s in segs] == ["preambulo", "art-1", "art-2"]
    assert segs[1].raw_heading == "Artículo 1º"
    assert segs[1].body == "Cuerpo uno."


def test_segment_falls_back_to_doc():
    segs = segment("Texto sin artículos.")
    assert len(segs) == 1
    assert segs[0].slug == "doc"
    assert segs[0].raw_heading == ""


@pytest.mark.parametrize("ord_char", ["°", "º"])
def test_segment_inline_markers(ord_char):
    # Both ordinal characters must split. Without the widened HEADING_RE the
    # 'º' variant matches nothing and degrades to a single __doc__ segment.
    text = f"Artículo 1{ord_char}.- Cuerpo uno. Artículo 2{ord_char}.- Cuerpo dos."
    assert [s.slug for s in segment(text)] == ["art-1", "art-2"]


def test_md_heading_re_never_matches_abbreviation():
    # Preserved quirk: \b sits between '.' and ' ', both non-word. See spec §6.3.
    assert segment("#### Art. 5\nCuerpo.")[0].slug == "doc"


def test_canonical_text_is_whitespace_insensitive():
    a = segment("#### Artículo 1º\nCuerpo.\n\n")
    b = segment("#### Artículo 1º\n\n   Cuerpo.   ")
    assert canonical_text(a) == canonical_text(b) == "Artículo 1º\nCuerpo."


def test_sha256_text_is_stable():
    assert sha256_text("abc") == sha256_text("abc")
    assert sha256_text("abc") != sha256_text("abd")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_segment.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'segment'`.

- [ ] **Step 3: Write `scripts/segment.py`**

```python
"""Article segmentation for Chilean legislative text.

Single source of truth: the frontend consumes pre-segmented articles from the
database and does not re-parse texto.md. The TypeScript twin in
web/src/lib/segment.ts exists only as the golden-test reference and is deleted
at cutover (Task 17).

Two source formats coexist in the corpus:
  - Post-renderer markdown (render_texto.py): `#### Artículo 5° bis` on its
    own line. This is what `historial` actually contains.
  - Legacy inline: `Artículo 5°.-` embedded in flowing prose.

If neither is present we yield one `__doc__` segment, so reconstruction stays
lossless even when the heuristic finds nothing.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass

__all__ = [
    "Segment", "normalize_label", "label_to_slug", "segment",
    "canonical_text", "sha256_text",
]


@dataclass(frozen=True)
class Segment:
    label: str
    slug: str
    raw_heading: str
    body: str


_COMBINING = re.compile(r"[̀-ͯ]")
_ORDINAL = re.compile(r"[°º]")  # ° DEGREE, º MASCULINE ORDINAL


def normalize_label(s: str) -> str:
    """Normalize a label so different spellings of one article match.

    Ordinals are stripped BEFORE NFKD: 'º' (U+00BA) decomposes to 'o', so
    stripping afterwards would leave "articulo 1o" while "1°" yields
    "articulo 1" — one article, two identities. See spec §6.3.
    """
    s = _ORDINAL.sub("", s)
    s = s.lower()
    s = unicodedata.normalize("NFKD", s)
    s = _COMBINING.sub("", s)
    s = re.sub(r"\bart\.", "articulo", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def label_to_slug(label: str) -> str:
    if label == "__preamble__":
        return "preambulo"
    if label == "__doc__":
        return "doc"
    s = re.sub(r"^articulo\s+", "art-", label)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    s = re.sub(r"-+", "-", s)
    return re.sub(r"^-|-$", "", s)


_HEADING_RE = re.compile(
    r"(^|\s)(Art[íi]culo|Art\.)\s+"
    r"([0-9]+[°º]?(?:\s+(?:bis|ter|quater|qu[íi]nquies))?"
    r"|[úu]nico|primero|segundo|tercero|cuarto|quinto|sexto"
    r"|s[ée]ptimo|octavo|noveno|d[ée]cimo|transitorio|final)"
    r"(?:\s+transitori[ao])?\.?-",
    re.IGNORECASE,
)

# `\b` after `Art(?:ículo|\.)` means the `Art.` abbreviation can never match:
# '.' and the following space are both non-word. Preserved deliberately —
# render_texto.py:286 always emits `#### Artículo {num}`.
_MD_HEADING_RE = re.compile(
    r"^(#{2,4})\s+Art(?:[íi]culo|\.)\b\s+(\S[^\n]*?)\s*$",
    re.MULTILINE | re.IGNORECASE,
)


def _preamble_of(text: str, first_start: int) -> list[Segment]:
    pre = text[:first_start].strip()
    if not pre:
        return []
    return [Segment("__preamble__", label_to_slug("__preamble__"), "", pre)]


def _segment_md(text: str, matches: list[re.Match]) -> list[Segment]:
    out = _preamble_of(text, matches[0].start())
    for i, m in enumerate(matches):
        seg_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        identifier = (m.group(2) or "").strip()
        label = normalize_label(f"articulo {identifier}")
        out.append(Segment(
            label, label_to_slug(label),
            f"Artículo {identifier}",
            text[m.end():seg_end].strip(),
        ))
    return out


def _segment_inline(text: str, matches: list[re.Match]) -> list[Segment]:
    out = _preamble_of(text, matches[0].start())
    for i, m in enumerate(matches):
        lead = len(m.group(1) or "")
        start = m.start() + lead
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end]
        heading_len = len(m.group(0)) - lead
        identifier = (m.group(3) or "").strip()
        kind_raw = (m.group(2) or "Artículo").strip()
        kind = "articulo" if kind_raw.lower().startswith("art") else kind_raw
        label = normalize_label(f"{kind} {identifier}")
        out.append(Segment(
            label, label_to_slug(label),
            chunk[:heading_len].strip(),
            chunk[heading_len:].strip(),
        ))
    return out


def segment(text: str) -> list[Segment]:
    md = list(_MD_HEADING_RE.finditer(text))
    if md:
        return _segment_md(text, md)
    inline = list(_HEADING_RE.finditer(text))
    if not inline:
        return [Segment("__doc__", label_to_slug("__doc__"), "", text.strip())]
    return _segment_inline(text, inline)


def canonical_text(segs: list[Segment]) -> str:
    """Order-, heading- and body-sensitive; whitespace-insensitive.

    The validation gate (spec §8.1) hashes this, not the raw texto.md:
    segmentation strips bodies and rewrites headings, so byte-identity with
    the committed file is unachievable by construction.
    """
    return "\n\n".join(
        f"{s.raw_heading}\n{s.body}" if s.raw_heading else s.body for s in segs
    )


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_segment.py -q`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/segment.py tests/test_segment.py
git commit -m "feat(segment): port article segmentation to Python"
```

---

### Task 3: Golden test — Python and TypeScript agree byte-for-byte

Both implementations assert against one committed golden file. If either drifts, exactly one side fails, and the failing side names itself. This is the only place where divergence would be invisible and expensive.

**Files:**
- Create: `tests/fixtures/segment_corpus.json`
- Create: `tests/fixtures/segment_expected.json` (generated, committed)
- Create: `web/src/lib/segment.golden.test.ts`
- Create: `tests/test_segment_golden.py`

**Interfaces:**
- Consumes: `segment()` and `canonicalText()` from Tasks 1 and 2.
- Produces: `tests/fixtures/segment_expected.json` — a JSON object mapping fixture `name` → `{"segments": [{"label","slug","rawHeading","body"}], "canonical": string}`.

- [ ] **Step 1: Write the fixture corpus**

Create `tests/fixtures/segment_corpus.json`. Every entry exercises a path that has bitten us: mixed ordinals in one document (the live bug), the `Art.` non-match quirk, the `__doc__` fallback, inline markers, and a preamble.

```json
[
  {
    "name": "mixed_ordinals",
    "text": "Ley N° 20.330\n\n#### Artículo 1º\nCuerpo uno.\n\n#### Artículo 5°\nCuerpo cinco.\n\n#### Artículo 5° bis\nCuerpo cinco bis."
  },
  {
    "name": "no_preamble",
    "text": "#### Artículo único\nCuerpo único."
  },
  {
    "name": "abbreviation_never_matches",
    "text": "#### Art. 5\nCuerpo."
  },
  {
    "name": "doc_fallback",
    "text": "Considerando lo anterior, se resuelve lo siguiente."
  },
  {
    "name": "inline_markers",
    "text": "Vistos: lo dispuesto.\n\nArtículo 1°.- Cuerpo uno. Artículo 2°.- Cuerpo dos."
  },
  {
    "name": "inline_markers_masculine_ordinal",
    "text": "Vistos: lo dispuesto.\n\nArtículo 1º.- Cuerpo uno. Artículo 2º.- Cuerpo dos."
  },
  {
    "name": "transitorio",
    "text": "#### Artículo primero transitorio\nCuerpo transitorio."
  }
]
```

- [ ] **Step 2: Write the TypeScript golden test (which generates the file)**

Create `web/src/lib/segment.golden.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { segment, canonicalText } from './segment'

// web/package.json sets "type": "module", so __dirname does not exist here.
const CORPUS = resolve(import.meta.dirname, '../../../tests/fixtures/segment_corpus.json')
const GOLDEN = resolve(import.meta.dirname, '../../../tests/fixtures/segment_expected.json')

interface Fixture { name: string; text: string }

function build(): Record<string, unknown> {
  const corpus: Fixture[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const out: Record<string, unknown> = {}
  for (const f of corpus) {
    const segs = segment(f.text)
    out[f.name] = { segments: segs, canonical: canonicalText(segs) }
  }
  return out
}

describe('segmentation golden file', () => {
  it('matches the committed golden (run with UPDATE_GOLDEN=1 to regenerate)', () => {
    const actual = build()
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n', 'utf-8')
    }
    const expected = JSON.parse(readFileSync(GOLDEN, 'utf-8'))
    expect(actual).toEqual(expected)
  })
})
```

- [ ] **Step 3: Generate the golden file**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/web && UPDATE_GOLDEN=1 pnpm vitest run src/lib/segment.golden.test.ts`
Expected: PASS, and `tests/fixtures/segment_expected.json` now exists.

- [ ] **Step 4: Verify the golden encodes the *fixed* behavior**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && grep -c 'art-1o' tests/fixtures/segment_expected.json || echo "clean"`
Expected: prints `clean` (grep finds nothing). If it prints a number, Task 1's fix did not land — stop and fix it before continuing.

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python3 -c "import json;d=json.load(open('tests/fixtures/segment_expected.json'));print(d['abbreviation_never_matches']['segments'][0]['slug'])"`
Expected: `doc`

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python3 -c "
import json
d = json.load(open('tests/fixtures/segment_expected.json'))
a = [s['slug'] for s in d['inline_markers']['segments']]
b = [s['slug'] for s in d['inline_markers_masculine_ordinal']['segments']]
# Both fixtures open with 'Vistos: lo dispuesto.', which is a preamble — so the
# expected list is ['preambulo','art-1','art-2'], not ['art-1','art-2'].
expected = ['preambulo', 'art-1', 'art-2']
if a != b:
    print(f'DIVERGE {a} vs {b}')          # the ordinals disagree
elif a != expected:
    print(f'DEGENERATE {a}')              # e.g. ['doc'] — HEADING_RE never matched
else:
    print('converge')"`
Expected: `converge`.

The two failure modes are distinct and both matter. `DIVERGE` means `°` and `º` segment differently — the widened `HEADING_RE` did not land. `DEGENERATE` means *both* collapsed to `['doc']`, which would make `a == b` trivially true while proving nothing: a check that only asserted `a == b` would pass on total failure. Assert the expected shape too.

- [ ] **Step 5: Write the Python side of the golden test**

Create `tests/test_segment_golden.py`:

```python
"""Python and TypeScript segmentation must produce identical output.

Both sides assert against tests/fixtures/segment_expected.json. Regenerate it
from TypeScript with:  cd web && UPDATE_GOLDEN=1 pnpm vitest run src/lib/segment.golden.test.ts
"""
import json
from pathlib import Path

from segment import segment, canonical_text

_FIXTURES = Path(__file__).parent / "fixtures"


def _to_ts_shape(segs) -> list[dict]:
    """Python uses snake_case; the golden file uses the TypeScript camelCase keys."""
    return [
        {"label": s.label, "slug": s.slug, "rawHeading": s.raw_heading, "body": s.body}
        for s in segs
    ]


def test_python_matches_typescript_golden():
    corpus = json.loads((_FIXTURES / "segment_corpus.json").read_text(encoding="utf-8"))
    expected = json.loads((_FIXTURES / "segment_expected.json").read_text(encoding="utf-8"))

    assert {f["name"] for f in corpus} == set(expected), "corpus and golden disagree on fixtures"

    for fixture in corpus:
        segs = segment(fixture["text"])
        want = expected[fixture["name"]]
        assert _to_ts_shape(segs) == want["segments"], f"segments differ for {fixture['name']}"
        assert canonical_text(segs) == want["canonical"], f"canonical differs for {fixture['name']}"
```

- [ ] **Step 6: Run both sides**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_segment_golden.py -q && cd web && pnpm vitest run src/lib/segment.golden.test.ts`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add tests/fixtures/ tests/test_segment_golden.py web/src/lib/segment.golden.test.ts
git commit -m "test(segment): golden file pins Python and TypeScript together"
```

---

### Task 4: Phase 0 — segmentation coverage gate

**This task can stop the project.** It measures whether article-level dedup is viable on the real corpus. Run it against a fresh clone of the real `historial` branch — **not** the local worktree, which is a stale one-commit subset predating `render_texto.py` and would report catastrophic, fictitious coverage.

**Files:**
- Create: `scripts/measure_phase0.py`
- Create: `tests/test_measure_phase0.py`

**Interfaces:**
- Consumes: `segment()` from Task 2.
- Produces: `classify(text: str) -> str` returning `"md" | "inline" | "doc"`; `Coverage` (frozen dataclass: `tipo: str`, `total: int`, `md: int`, `inline: int`, `doc: int`) and `doc_rate(c: Coverage) -> float`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_measure_phase0.py`:

```python
from measure_phase0 import Coverage, classify, doc_rate


def test_classify_markdown():
    assert classify("#### Artículo 1º\nCuerpo.") == "md"


def test_classify_inline():
    assert classify("Artículo 1°.- Cuerpo.") == "inline"


def test_classify_doc_fallback():
    assert classify("Sin artículos aquí.") == "doc"


def test_doc_rate():
    c = Coverage(tipo="ley", total=10, md=7, inline=2, doc=1)
    assert doc_rate(c) == 0.1


def test_doc_rate_of_empty_is_zero():
    assert doc_rate(Coverage(tipo="res", total=0, md=0, inline=0, doc=0)) == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_measure_phase0.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'measure_phase0'`.

- [ ] **Step 3: Write `scripts/measure_phase0.py`**

```python
"""Phase 0 gate: does article segmentation work on the real corpus?

Stop condition (spec §8.3): a high __doc__ fallback rate among `res`/`dto` is
acceptable — those are administrative and search fine at document granularity.
A high fallback rate among `ley` means article-level dedup is unfounded and the
data model must change before anything is built on it.

Usage (against a REAL clone, not the local stale worktree):

    git clone --single-branch -b historial \\
        https://github.com/pisanvs/ley-chile /tmp/historial-real
    git -C /tmp/historial-real count-objects -vH        # Phase 0 measurement #1
    python scripts/measure_phase0.py --historial /tmp/historial-real --sample 2000
"""
from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from segment import segment

LEY_DOC_RATE_STOP = 0.10  # >10% of leyes unsegmentable => stop and fix the heuristic


@dataclass(frozen=True)
class Coverage:
    tipo: str
    total: int
    md: int
    inline: int
    doc: int


def classify(text: str) -> str:
    """Which segmentation path did this text take?"""
    segs = segment(text)
    if len(segs) == 1 and segs[0].slug == "doc":
        return "doc"
    return "md" if "####" in text else "inline"


def doc_rate(c: Coverage) -> float:
    return 0.0 if c.total == 0 else c.doc / c.total


def _iter_textos(historial: Path, sample: int, seed: int = 0):
    paths = list(historial.rglob("texto.md"))
    rng = random.Random(seed)
    if sample and sample < len(paths):
        paths = rng.sample(paths, sample)
    for p in paths:
        meta = p.parent / "metadata.json"
        tipo = "unknown"
        if meta.exists():
            try:
                parsed = json.loads(meta.read_text(encoding="utf-8", errors="replace"))
                if isinstance(parsed, dict):
                    tipo = parsed.get("tipo", "unknown")
            except json.JSONDecodeError:
                pass
        yield tipo, p.read_text(encoding="utf-8", errors="replace")


def measure(historial: Path, sample: int) -> list[Coverage]:
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"md": 0, "inline": 0, "doc": 0})
    for tipo, text in _iter_textos(historial, sample):
        counts[tipo][classify(text)] += 1
    return [
        Coverage(tipo=t, total=sum(c.values()), md=c["md"], inline=c["inline"], doc=c["doc"])
        for t, c in sorted(counts.items())
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--historial", type=Path, required=True)
    ap.add_argument("--sample", type=int, default=2000)
    args = ap.parse_args()

    rows = measure(args.historial, args.sample)
    print(f"{'tipo':<10} {'total':>7} {'md':>7} {'inline':>7} {'doc':>7} {'doc%':>7}")
    for c in rows:
        print(f"{c.tipo:<10} {c.total:>7} {c.md:>7} {c.inline:>7} {c.doc:>7} {doc_rate(c):>6.1%}")

    leyes = next((c for c in rows if c.tipo == "ley"), None)
    if leyes is None:
        print("\nNO EVIDENCE: no normas with tipo='ley' were classified. "
              "The gate measured nothing; refusing to pass.")
        return 1
    if doc_rate(leyes) > LEY_DOC_RATE_STOP:
        print(f"\nSTOP: {doc_rate(leyes):.1%} of leyes fall back to __doc__ "
              f"(threshold {LEY_DOC_RATE_STOP:.0%}). Article dedup is unfounded. "
              f"Fix the heuristic before proceeding.")
        return 1
    print("\nGATE PASSED: article-level dedup is viable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_measure_phase0.py -q`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the three Phase 0 measurements for real**

```bash
git clone --single-branch -b historial https://github.com/pisanvs/ley-chile /tmp/historial-real
git -C /tmp/historial-real count-objects -vH          # measurement 1: pack size
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
python scripts/measure_phase0.py --historial /tmp/historial-real --sample 2000   # measurement 2
```

Record all three in the commit message. **Measurement 1** decides whether spec §5.4's rejected worker-clone ingestion is worth reconsidering (threshold: under ~1 GB). **Measurement 2** is the stop condition. **Measurement 3** (Meilisearch index size from a 5% sample of the seed tier) runs in Task 10, once there is an indexer to run it with.

- [ ] **Step 6: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/measure_phase0.py tests/test_measure_phase0.py
git commit -m "feat(phase0): segmentation coverage gate

Records the real measurements in this message:
  historial pack size: <FILL FROM count-objects -vH>
  ley __doc__ rate:    <FILL FROM measure_phase0.py>
  gate:                <PASSED|STOPPED>"
```

---

### Task 5: Article dedup and span coalescing

The load-bearing bet: an artículo unchanged across five versions is one `articulo` row with one wide `articulo_span`, not five copies of the text.

**Files:**
- Create: `scripts/spans.py`
- Create: `tests/test_spans.py`

**Interfaces:**
- Consumes: `segment`, `sha256_text`, `Segment`, `canonical_text` from Task 2.
- Produces:
  - `VersionInput` (frozen: `desde: str`, `hasta: str | None`, `texto: str`)
  - `ArticleRow` (frozen: `id_norma: int`, `slug: str`, `label: str`, `raw_heading: str`, `body: str`, `content_sha256: str`)
  - `SpanRow` (frozen: `id_norma: int`, `slug: str`, `content_sha256: str`, `desde: str`, `hasta: str | None`, `ord: int`)
  - `build_articles_and_spans(id_norma: int, versions: list[VersionInput]) -> tuple[list[ArticleRow], list[SpanRow]]`
  - `reconstruct(articles: list[ArticleRow], spans: list[SpanRow], fecha: str) -> list[Segment]`

- [ ] **Step 1: Write the failing test**

Create `tests/test_spans.py`:

```python
from segment import canonical_text, segment
from spans import (
    ArticleRow, SpanRow, VersionInput, build_articles_and_spans, reconstruct,
)


def _v(desde, hasta, texto):
    return VersionInput(desde=desde, hasta=hasta, texto=texto)


V1 = "#### Artículo 1º\nOriginal uno.\n\n#### Artículo 2°\nOriginal dos."
V2 = "#### Artículo 1º\nOriginal uno.\n\n#### Artículo 2°\nMODIFICADO dos."


def test_unchanged_article_is_stored_once_with_one_wide_span():
    arts, spans = build_articles_and_spans(42, [
        _v("2000-01-01", "2009-12-31", V1),
        _v("2010-01-01", None, V2),
    ])
    art1 = [a for a in arts if a.slug == "art-1"]
    assert len(art1) == 1, "unchanged article must not be duplicated"

    span1 = [s for s in spans if s.slug == "art-1"]
    assert len(span1) == 1
    assert (span1[0].desde, span1[0].hasta) == ("2000-01-01", None)


def test_modified_article_yields_two_disjoint_spans():
    arts, spans = build_articles_and_spans(42, [
        _v("2000-01-01", "2009-12-31", V1),
        _v("2010-01-01", None, V2),
    ])
    assert len([a for a in arts if a.slug == "art-2"]) == 2
    span2 = sorted([s for s in spans if s.slug == "art-2"], key=lambda s: s.desde)
    assert [(s.desde, s.hasta) for s in span2] == [
        ("2000-01-01", "2009-12-31"), ("2010-01-01", None),
    ]


def test_article_that_reverts_produces_two_spans_for_one_article_row():
    arts, spans = build_articles_and_spans(7, [
        _v("2000-01-01", "2004-12-31", V1),
        _v("2005-01-01", "2009-12-31", V2),
        _v("2010-01-01", None, V1),
    ])
    # art-2 body A appears in v0 and v2 (non-contiguous) -> one row, two spans
    a2 = [a for a in arts if a.slug == "art-2" and a.body == "Original dos."]
    assert len(a2) == 1
    revert_spans = [s for s in spans if s.slug == "art-2" and s.content_sha256 == a2[0].content_sha256]
    assert len(revert_spans) == 2


def test_ord_lives_on_the_span_so_insertions_do_not_corrupt_order():
    v_before = "#### Artículo 1º\nUno."
    v_after = "#### Artículo 0\nCero.\n\n#### Artículo 1º\nUno."
    arts, spans = build_articles_and_spans(9, [
        _v("2000-01-01", "2009-12-31", v_before),
        _v("2010-01-01", None, v_after),
    ])
    # art-1's body never changed, but its position did -> two spans, different ord
    s1 = sorted([s for s in spans if s.slug == "art-1"], key=lambda s: s.desde)
    assert [s.ord for s in s1] == [0, 1]
    assert len([a for a in arts if a.slug == "art-1"]) == 1, "body unchanged: one row"


def test_reconstruct_round_trips_canonical_text():
    versions = [_v("2000-01-01", "2009-12-31", V1), _v("2010-01-01", None, V2)]
    arts, spans = build_articles_and_spans(42, versions)
    for v in versions:
        got = reconstruct(arts, spans, v.desde)
        assert canonical_text(got) == canonical_text(segment(v.texto))


def test_reconstruct_at_a_date_inside_a_range():
    arts, spans = build_articles_and_spans(42, [_v("2000-01-01", None, V1)])
    assert canonical_text(reconstruct(arts, spans, "2005-06-06")) == canonical_text(segment(V1))


def test_reconstruct_outside_every_span_is_empty():
    arts, spans = build_articles_and_spans(42, [_v("2000-01-01", "2001-01-01", V1)])
    assert reconstruct(arts, spans, "1999-01-01") == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_spans.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'spans'`.

- [ ] **Step 3: Write `scripts/spans.py`**

```python
"""Article dedup and validity-span coalescing.

Store each distinct article body once; store when it was in force. A version's
text is reconstructed by selecting the articles whose span contains the date.

Run identity is (slug, content_sha256, ord): a body that survives unchanged but
moves position must split its span, because `ord` determines reading order and
reading order is a property of the version, not of the article.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import groupby

from segment import Segment, segment, sha256_text

__all__ = [
    "VersionInput", "ArticleRow", "SpanRow", "build_articles_and_spans", "reconstruct",
]


@dataclass(frozen=True)
class VersionInput:
    desde: str            # YYYY-MM-DD
    hasta: str | None     # None = vigente
    texto: str


@dataclass(frozen=True)
class ArticleRow:
    id_norma: int
    slug: str
    label: str
    raw_heading: str
    body: str
    content_sha256: str


@dataclass(frozen=True)
class SpanRow:
    id_norma: int
    slug: str
    content_sha256: str
    desde: str
    hasta: str | None
    ord: int


def _contiguous_runs(indices: list[int]) -> list[list[int]]:
    """[0,1,3,4,5] -> [[0,1],[3,4,5]]"""
    runs: list[list[int]] = []
    for _, group in groupby(enumerate(sorted(indices)), key=lambda p: p[1] - p[0]):
        runs.append([i for _, i in group])
    return runs


def build_articles_and_spans(
    id_norma: int, versions: list[VersionInput]
) -> tuple[list[ArticleRow], list[SpanRow]]:
    ordered = sorted(versions, key=lambda v: v.desde)

    articles: dict[tuple[str, str], ArticleRow] = {}
    # (slug, content_sha256, ord) -> version indices where it appears at that position
    occurrences: dict[tuple[str, str, int], list[int]] = {}

    for i, v in enumerate(ordered):
        for position, seg in enumerate(segment(v.texto)):
            sha = sha256_text(seg.body)
            articles.setdefault(
                (seg.slug, sha),
                ArticleRow(id_norma, seg.slug, seg.label, seg.raw_heading, seg.body, sha),
            )
            occurrences.setdefault((seg.slug, sha, position), []).append(i)

    spans: list[SpanRow] = []
    for (slug, sha, position), idxs in occurrences.items():
        for run in _contiguous_runs(idxs):
            spans.append(SpanRow(
                id_norma=id_norma, slug=slug, content_sha256=sha,
                desde=ordered[run[0]].desde, hasta=ordered[run[-1]].hasta, ord=position,
            ))

    spans.sort(key=lambda s: (s.desde, s.ord))
    return list(articles.values()), spans


def _contains(span: SpanRow, fecha: str) -> bool:
    return span.desde <= fecha and (span.hasta is None or fecha <= span.hasta)


def reconstruct(
    articles: list[ArticleRow], spans: list[SpanRow], fecha: str
) -> list[Segment]:
    """Rebuild a version's segments as of `fecha`, in reading order."""
    by_key = {(a.slug, a.content_sha256): a for a in articles}
    live = sorted((s for s in spans if _contains(s, fecha)), key=lambda s: s.ord)
    return [
        Segment(
            label=by_key[(s.slug, s.content_sha256)].label,
            slug=s.slug,
            raw_heading=by_key[(s.slug, s.content_sha256)].raw_heading,
            body=by_key[(s.slug, s.content_sha256)].body,
        )
        for s in live
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_spans.py -q`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/spans.py tests/test_spans.py
git commit -m "feat(spans): article dedup with contiguous validity spans

ord lives on the span, not the article: an unchanged body that moves
position splits its span, because reading order is a property of the
version. A body that reverts yields one article row and two disjoint spans."
```

---

### Task 6: Snapshot row schemas and range closing

The NDJSON wire format shared by exporter and loader. Also the pure function that turns a list of publication dates into closed `[desde, hasta]` ranges — the thing the `EXCLUDE` constraint will reject if we get it wrong.

**Files:**
- Create: `scripts/schemas/snapshot.py`
- Create: `tests/test_snapshot_schema.py`

**Interfaces:**
- Consumes: `ArticleRow`, `SpanRow` from Task 5.
- Produces:
  - `NormaRow` (frozen: `id_norma: int`, `tipo: str`, `numero: str`, `titulo: str`, `organismo: str`, `clasificacion: str`, `derogado: bool`, `fecha_publicacion: str | None`, `law_dir: str`)
  - `VersionRow` (frozen: `id_norma: int`, `desde: str`, `hasta: str | None`, `commit_sha: str`, `causa_id: int | None`, `subject: str`, `magnitude: int`, `texto_sha256: str`, `canonical_sha256: str`)
  - `ModRow` (frozen: `causa_id: int`, `target_id: int`, `fecha: str`, `commit_sha: str`)
  - `close_ranges(desde_dates: list[str]) -> list[tuple[str, str | None]]`
  - `to_ndjson(rows) -> str`, `from_ndjson(line: str, cls) -> Any`
  - `Manifest` (frozen: `snapshot_version: str`, `watermark: str`, `last_delta_seq: int`, `shards: list[str]`)

- [ ] **Step 1: Write the failing test**

Create `tests/test_snapshot_schema.py`:

```python
import pytest
from schemas.snapshot import (
    Manifest, ModRow, NormaRow, VersionRow, close_ranges, from_ndjson, to_ndjson,
)


def test_close_ranges_makes_adjacent_non_overlapping_ranges():
    # Each range ends the day BEFORE the next date in the list. The last is open.
    assert close_ranges(["2000-01-01", "2010-06-15", "2020-03-01"]) == [
        ("2000-01-01", "2010-06-14"),   # day before 2010-06-15
        ("2010-06-15", "2020-02-29"),   # day before 2020-03-01; 2020 is a leap year
        ("2020-03-01", None),           # still in force
    ]


def test_close_ranges_boundary_arithmetic():
    # The cases where naive string surgery goes wrong.
    assert close_ranges(["2010-06-01", "2010-07-01"])[0][1] == "2010-06-30"  # month
    assert close_ranges(["2019-01-01", "2020-01-01"])[0][1] == "2019-12-31"  # year
    assert close_ranges(["2020-01-01", "2020-03-01"])[0][1] == "2020-02-29"  # leap
    assert close_ranges(["2019-01-01", "2019-03-01"])[0][1] == "2019-02-28"  # non-leap


def test_close_ranges_single_version_is_open_ended():
    assert close_ranges(["1997-03-04"]) == [("1997-03-04", None)]


def test_close_ranges_empty():
    assert close_ranges([]) == []


def test_close_ranges_rejects_unsorted_input():
    with pytest.raises(ValueError, match="sorted"):
        close_ranges(["2010-01-01", "2000-01-01"])


def test_close_ranges_rejects_duplicates():
    # Two versions with the same desde would violate UNIQUE (id_norma, desde).
    with pytest.raises(ValueError, match="duplicate"):
        close_ranges(["2000-01-01", "2000-01-01"])


def test_ndjson_round_trip():
    row = NormaRow(
        id_norma=20330, tipo="ley", numero="20330", titulo="LEY",
        organismo="MIN", clasificacion="sustantiva", derogado=False,
        fecha_publicacion="2009-02-25", law_dir="leyes/20330",
    )
    line = to_ndjson([row]).strip()
    assert from_ndjson(line, NormaRow) == row


def test_ndjson_round_trip_with_nulls():
    row = VersionRow(
        id_norma=1, desde="2000-01-01", hasta=None, commit_sha="abc",
        causa_id=None, subject="s", magnitude=0,
        texto_sha256="t", canonical_sha256="c",
    )
    assert from_ndjson(to_ndjson([row]).strip(), VersionRow) == row


def test_manifest_round_trip():
    m = Manifest(snapshot_version="2026-07-09T00:00:00Z", watermark="2026-05-29",
                 last_delta_seq=7, shards=["normas-000.ndjson.gz"])
    assert from_ndjson(to_ndjson([m]).strip(), Manifest) == m


def test_mod_row_round_trip():
    m = ModRow(causa_id=1, target_id=2, fecha="2001-01-01", commit_sha="deadbeef")
    assert from_ndjson(to_ndjson([m]).strip(), ModRow) == m
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_snapshot_schema.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'schemas.snapshot'`.

- [ ] **Step 3: Write `scripts/schemas/snapshot.py`**

```python
"""NDJSON wire format shared by export_snapshot.py and the Railway loader.

Rows are plain frozen dataclasses. Keep them dumb: any logic here has to be
duplicated on both sides of an artifact boundary that spans two machines and
possibly two deploys.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields
from datetime import date, timedelta
from typing import Any, Iterable, TypeVar

__all__ = [
    "NormaRow", "VersionRow", "ModRow", "Manifest",
    "close_ranges", "to_ndjson", "from_ndjson",
]

T = TypeVar("T")


@dataclass(frozen=True)
class NormaRow:
    id_norma: int
    tipo: str
    numero: str
    titulo: str
    organismo: str
    clasificacion: str
    derogado: bool
    fecha_publicacion: str | None
    law_dir: str


@dataclass(frozen=True)
class VersionRow:
    id_norma: int
    desde: str
    hasta: str | None
    commit_sha: str
    causa_id: int | None
    subject: str
    magnitude: int
    texto_sha256: str      # sha256 of the committed texto.md (provenance)
    canonical_sha256: str  # sha256 of canonical_text(segment(texto)) — the gate


@dataclass(frozen=True)
class ModRow:
    causa_id: int
    target_id: int
    fecha: str
    commit_sha: str


@dataclass(frozen=True)
class Manifest:
    snapshot_version: str
    watermark: str
    last_delta_seq: int
    shards: list[str]


def close_ranges(desde_dates: list[str]) -> list[tuple[str, str | None]]:
    """Turn publication dates into non-overlapping closed ranges.

    The last range is open-ended (hasta=None). Every other range ends the day
    before the next one begins — which is exactly what the version table's
    EXCLUDE constraint enforces, so getting this wrong fails loudly at load.
    """
    if not desde_dates:
        return []
    if desde_dates != sorted(desde_dates):
        raise ValueError("close_ranges requires sorted dates")
    if len(set(desde_dates)) != len(desde_dates):
        raise ValueError("duplicate desde dates would violate UNIQUE (id_norma, desde)")

    out: list[tuple[str, str | None]] = []
    for i, d in enumerate(desde_dates):
        if i + 1 == len(desde_dates):
            out.append((d, None))
        else:
            nxt = date.fromisoformat(desde_dates[i + 1]) - timedelta(days=1)
            out.append((d, nxt.isoformat()))
    return out


def to_ndjson(rows: Iterable[Any]) -> str:
    return "".join(
        json.dumps(asdict(r), ensure_ascii=False, sort_keys=True) + "\n" for r in rows
    )


def from_ndjson(line: str, cls: type[T]) -> T:
    data = json.loads(line)
    known = {f.name for f in fields(cls)}
    return cls(**{k: v for k, v in data.items() if k in known})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_snapshot_schema.py -q`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/schemas/snapshot.py tests/test_snapshot_schema.py
git commit -m "feat(schemas): NDJSON snapshot rows and range closing"
```

---

### Task 7: `export_snapshot.py`

Runs in GitHub Actions where `historial` and `graph.json` are already on disk. Reads every version's `texto.md` at its commit SHA via a single `git cat-file --batch` process — 408k individual `git show` invocations would take hours.

**Files:**
- Create: `scripts/export_snapshot.py`
- Create: `tests/test_export_snapshot.py`

**Interfaces:**
- Consumes: `real_date` from `build_web_indexes`; `segment`, `canonical_text`, `sha256_text` from Task 2; `build_articles_and_spans` from Task 5; all rows from Task 6.
- Produces:
  - `CommitMeta` (frozen: `sha: str`, `committer_date: str`, `subject: str`, `causa_id: int | None`, `magnitude: int`)
  - `versions_for_norma(id_norma: int, law_dir: str, commits: list[CommitMeta], textos: dict[str, str]) -> tuple[list[VersionRow], list[ArticleRow], list[SpanRow]]` — `textos` maps commit sha → that commit's `texto.md`
  - `shard_name(kind: str, index: int) -> str`
  - `build_manifest(snapshot_version: str, watermark: str, last_delta_seq: int, shards: list[str]) -> Manifest`

- [ ] **Step 1: Write the failing test**

Create `tests/test_export_snapshot.py`:

```python
from export_snapshot import CommitMeta, build_manifest, shard_name, versions_for_norma
from segment import canonical_text, segment, sha256_text

V1 = "#### Artículo 1º\nUno."
V2 = "#### Artículo 1º\nUno modificado."


def _commits():
    return [
        # committer dates are deliberately wrong; real_date() must win
        CommitMeta(sha="aaa", committer_date="1970-01-01",
                   subject="feat(ley): Ley 42 promulgada (1943-05-10)",
                   causa_id=42, magnitude=10),
        CommitMeta(sha="bbb", committer_date="2011-02-22",
                   subject="update(ley): Ley 42 modificada (2011-02-21)",
                   causa_id=99, magnitude=3),
    ]


def test_real_date_overrides_bogus_committer_date():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert [v.desde for v in versions] == ["1943-05-10", "2011-02-21"]


def test_ranges_are_closed_and_last_is_open_ended():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert versions[0].hasta == "2011-02-20"
    assert versions[1].hasta is None


def test_canonical_sha_matches_the_gate_definition():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert versions[0].canonical_sha256 == sha256_text(canonical_text(segment(V1)))
    assert versions[0].texto_sha256 == sha256_text(V1)
    assert versions[0].canonical_sha256 != versions[0].texto_sha256


def test_commit_sha_and_causa_are_carried_through():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert (versions[1].commit_sha, versions[1].causa_id) == ("bbb", 99)


def test_articles_are_deduped_across_versions():
    unchanged = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos."
    changed = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos MODIFICADO."
    _, arts, spans = versions_for_norma(42, "leyes/42", _commits(),
                                        {"aaa": unchanged, "bbb": changed})
    assert len([a for a in arts if a.slug == "art-1"]) == 1
    assert len([s for s in spans if s.slug == "art-1"]) == 1


def test_commits_out_of_order_are_sorted_by_real_date():
    versions, _, _ = versions_for_norma(42, "leyes/42", list(reversed(_commits())),
                                        {"aaa": V1, "bbb": V2})
    assert [v.desde for v in versions] == ["1943-05-10", "2011-02-21"]


def test_shard_name():
    assert shard_name("normas", 0) == "normas-000.ndjson.gz"
    assert shard_name("articulos", 42) == "articulos-042.ndjson.gz"


def test_build_manifest():
    m = build_manifest("v1", "2026-05-29", 3, ["normas-000.ndjson.gz"])
    assert (m.watermark, m.last_delta_seq) == ("2026-05-29", 3)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_export_snapshot.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'export_snapshot'`.

- [ ] **Step 3: Write `scripts/export_snapshot.py`**

```python
"""Export the historial branch as NDJSON snapshot artifacts.

Runs at the end of the GitHub Actions pipeline, where the historial worktree is
already on disk. The Railway loader ingests what this writes. Git stays
canonical; these artifacts are the rebuild input that makes "drop the DB and
rebuild" a command you can actually run.

Dates come from real_date(), never from committer dates: GitHub rejects
negative Unix timestamps, so pre-1970 events clamp to 1970-01-01.
"""
from __future__ import annotations

import argparse
import gzip
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from build_web_indexes import real_date
from schemas.snapshot import Manifest, ModRow, NormaRow, VersionRow, close_ranges, to_ndjson
from segment import canonical_text, segment, sha256_text
from spans import ArticleRow, SpanRow, VersionInput, build_articles_and_spans

SHARD_SIZE = 50_000


@dataclass(frozen=True)
class CommitMeta:
    sha: str
    committer_date: str
    subject: str
    causa_id: int | None
    magnitude: int


def shard_name(kind: str, index: int) -> str:
    return f"{kind}-{index:03d}.ndjson.gz"


def build_manifest(
    snapshot_version: str, watermark: str, last_delta_seq: int, shards: list[str]
) -> Manifest:
    return Manifest(
        snapshot_version=snapshot_version,
        watermark=watermark,
        last_delta_seq=last_delta_seq,
        shards=shards,
    )


def versions_for_norma(
    id_norma: int,
    law_dir: str,
    commits: list[CommitMeta],
    textos: dict[str, str],
) -> tuple[list[VersionRow], list[ArticleRow], list[SpanRow]]:
    """Project a norma's commit history onto version, article and span rows."""
    dated = sorted(
        ((real_date(subject=c.subject, committer_date=c.committer_date), c) for c in commits),
        key=lambda pair: pair[0],
    )
    ranges = close_ranges([d for d, _ in dated])

    versions = [
        VersionRow(
            id_norma=id_norma,
            desde=desde,
            hasta=hasta,
            commit_sha=c.sha,
            causa_id=c.causa_id,
            subject=c.subject,
            magnitude=c.magnitude,
            texto_sha256=sha256_text(textos[c.sha]),
            canonical_sha256=sha256_text(canonical_text(segment(textos[c.sha]))),
        )
        for (desde, hasta), (_, c) in zip(ranges, dated)
    ]

    articles, spans = build_articles_and_spans(
        id_norma,
        [VersionInput(desde=v.desde, hasta=v.hasta, texto=textos[v.commit_sha]) for v in versions],
    )
    return versions, articles, spans


# --------------------------------------------------------------------------
# Git reading. Not unit-tested (requires a repo); exercised by Task 11's E2E.
# --------------------------------------------------------------------------

def read_commits(historial: Path, law_dir: str) -> list[CommitMeta]:
    """`git log` over one law's directory, newest last."""
    out = subprocess.run(
        ["git", "-C", str(historial), "log", "--reverse",
         "--format=%H%x1f%cI%x1f%s", "--", law_dir],
        capture_output=True, text=True, check=True,
    ).stdout
    commits: list[CommitMeta] = []
    for line in out.splitlines():
        sha, cdate, subject = line.split("\x1f", 2)
        commits.append(CommitMeta(
            sha=sha, committer_date=cdate[:10], subject=subject,
            causa_id=_causa_from_subject(subject), magnitude=0,
        ))
    return commits


_CAUSA_RE = __import__("re").compile(r"\bidNorma=(\d+)\b")


def _causa_from_subject(subject: str) -> int | None:
    m = _CAUSA_RE.search(subject)
    return int(m.group(1)) if m else None


def read_textos(historial: Path, refs: list[tuple[str, str]]) -> dict[str, str]:
    """Batch-read `{sha}:{path}` blobs. One process for all 408k versions.

    `git cat-file --batch` reads requests on stdin and emits
    `<oid> <type> <size>\\n<contents>\\n` per hit, `<ref> missing\\n` per miss.
    """
    stdin = "".join(f"{sha}:{path}\n" for sha, path in refs)
    proc = subprocess.run(
        ["git", "-C", str(historial), "cat-file", "--batch"],
        input=stdin.encode(), capture_output=True, check=True,
    )
    out, pos, result = proc.stdout, 0, {}
    for sha, _path in refs:
        header_end = out.index(b"\n", pos)
        header = out[pos:header_end].decode()
        if header.endswith("missing"):
            pos = header_end + 1
            continue
        size = int(header.rsplit(" ", 1)[1])
        body_start = header_end + 1
        result[sha] = out[body_start:body_start + size].decode("utf-8", errors="replace")
        pos = body_start + size + 1  # trailing newline
    return result


def _write_shards(out_dir: Path, kind: str, rows: list) -> list[str]:
    names = []
    for i in range(0, max(len(rows), 1), SHARD_SIZE):
        chunk = rows[i:i + SHARD_SIZE]
        if not chunk:
            break
        name = shard_name(kind, i // SHARD_SIZE)
        with gzip.open(out_dir / name, "wt", encoding="utf-8") as fh:
            fh.write(to_ndjson(chunk))
        names.append(name)
    return names


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--historial", type=Path, required=True)
    ap.add_argument("--graph", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--snapshot-version", required=True)
    ap.add_argument("--watermark", required=True)
    ap.add_argument("--delta-seq", type=int, default=0)
    ap.add_argument("--only", type=Path, default=None,
                    help="newline-delimited idNormas for a delta artifact")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    graph = json.loads(args.graph.read_text(encoding="utf-8"))

    wanted = None
    if args.only:
        wanted = {int(x) for x in args.only.read_text().split()}

    normas, versions, articles, spans, mods = [], [], [], [], []
    for key, node in graph.items():
        id_norma = int(key)
        if wanted is not None and id_norma not in wanted:
            continue
        law_dir = node.get("law_dir")
        if not law_dir or not (args.historial / law_dir / "texto.md").exists():
            continue

        commits = read_commits(args.historial, law_dir)
        if not commits:
            continue
        textos = read_textos(args.historial, [(c.sha, f"{law_dir}/texto.md") for c in commits])
        commits = [c for c in commits if c.sha in textos]
        if not commits:
            continue

        v, a, s = versions_for_norma(id_norma, law_dir, commits, textos)
        versions += v
        articles += a
        spans += s
        normas.append(NormaRow(
            id_norma=id_norma,
            tipo=node.get("tipo", ""),
            numero=str(node.get("numero", "")),
            titulo=node.get("titulo", ""),
            organismo=(node.get("organismos") or [""])[0],
            clasificacion=node.get("clasificacion", ""),
            derogado=bool(node.get("derogado", False)),
            fecha_publicacion=node.get("fechaPublicacion") or None,
            law_dir=law_dir,
        ))
        for edge in node.get("modificadaPor_edges") or []:
            mods.append(ModRow(causa_id=int(edge), target_id=id_norma,
                               fecha=node.get("fechaPublicacion", ""), commit_sha=""))

    shards: list[str] = []
    for kind, rows in [("normas", normas), ("versions", versions),
                       ("articulos", articles), ("spans", spans), ("mods", mods)]:
        shards += _write_shards(args.out, kind, rows)

    manifest = build_manifest(args.snapshot_version, args.watermark, args.delta_seq, shards)
    (args.out / "manifest.json").write_text(
        json.dumps(manifest.__dict__, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"normas={len(normas)} versions={len(versions)} "
          f"articulos={len(articles)} spans={len(spans)} shards={len(shards)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_export_snapshot.py -q`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/export_snapshot.py tests/test_export_snapshot.py
git commit -m "feat(export): NDJSON snapshot artifacts from historial

Reads every version's texto.md through one `git cat-file --batch` process.
Dates come from real_date(), never committer dates."
```

---

### Task 8: Postgres schema

**Files:**
- Create: `sql/001_schema.sql`
- Create: `scripts/loader/__init__.py` (empty)
- Create: `scripts/loader/db.py`
- Create: `requirements-loader.txt`
- Create: `tests/test_db_schema.py`
- Modify: `tests/conftest.py` (add the shared `conn` fixture used by Tasks 8, 9, 10, 12)
- Modify: `pytest.ini` (register the `integration` marker)

**Interfaces:**
- Consumes: nothing.
- Produces: `connect(dsn: str | None = None) -> psycopg.Connection`, `apply_schema(conn, sql_path: Path) -> None`, `SCHEMA_PATH: Path`.

- [ ] **Step 1: Add dependencies and the pytest marker**

Create `requirements-loader.txt`:

```
psycopg[binary]>=3.2.0
meilisearch>=0.31.0
requests>=2.31.0
```

Append to `pytest.ini` under `[pytest]`:

```ini
markers =
    integration: requires a live Postgres via DATABASE_URL (deselect with '-m "not integration"')
```

Install: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && pip install -r requirements-loader.txt`

- [ ] **Step 2: Add the shared `conn` fixture to `tests/conftest.py`**

Four test modules (Tasks 8, 9, 10, 12) need a clean database per test. Define it once. Append to `tests/conftest.py`:

```python
import os

DSN = os.environ.get("DATABASE_URL")


@pytest.fixture()
def conn():
    """A connection to a freshly-schema'd database. Integration tests only.

    Skips rather than fails when DATABASE_URL is unset, so the default
    `pytest -m "not integration"` run needs no Postgres.
    """
    if not DSN:
        pytest.skip("DATABASE_URL not set")
    from loader.db import SCHEMA_PATH, apply_schema, connect

    c = connect(DSN)
    c.execute("DROP SCHEMA IF EXISTS analytics CASCADE")
    c.execute("DROP TABLE IF EXISTS articulo_span, articulo, version, "
              "modificacion, norma, load_state CASCADE")
    apply_schema(c, SCHEMA_PATH)
    yield c
    c.close()
```

`tests/conftest.py` already inserts `scripts/` onto `sys.path`, so `from loader.db import ...` resolves.

- [ ] **Step 3: Write the failing test**

Create `tests/test_db_schema.py`. These assert the constraints that make a bad load impossible — the `EXCLUDE` on overlapping versions is the one that catches delta-loader bugs.

```python
import os
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


# The `conn` fixture is shared, from tests/conftest.py (added in Task 8).
# It drops and reapplies the schema per test. Do not redefine it here.


@requires_db
def test_btree_gist_extension_is_present(conn):
    row = conn.execute("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'").fetchone()
    assert row is not None, "EXCLUDE mixes '=' (btree) with '&&' (gist); btree_gist is required"


@requires_db
def test_overlapping_versions_are_rejected(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2000-01-01', '2009-12-31', 'a', 't', 'c')")
    with pytest.raises(psycopg.errors.ExclusionViolation):
        conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                     "VALUES (1, '2005-01-01', '2012-01-01', 'b', 't', 'c')")


@requires_db
def test_adjacent_versions_are_accepted(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2000-01-01', '2009-12-31', 'a', 't', 'c')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2010-01-01', NULL, 'b', 't', 'c')")
    assert conn.execute("SELECT count(*) FROM version").fetchone()[0] == 2


@requires_db
def test_duplicate_desde_is_rejected(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2000-01-01', NULL, 'a', 't', 'c')")
    with pytest.raises((psycopg.errors.UniqueViolation, psycopg.errors.ExclusionViolation)):
        conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                     "VALUES (1, '2000-01-01', NULL, 'b', 't', 'c')")


@requires_db
def test_articulo_dedup_key_rejects_exact_duplicates(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    ins = ("INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256) "
           "VALUES (1, 'art-1', 'articulo 1', 'Artículo 1', 'B', 'sha')")
    conn.execute(ins)
    with pytest.raises(psycopg.errors.UniqueViolation):
        conn.execute(ins)


@requires_db
def test_tsvector_is_generated_and_indexed(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256) "
                 "VALUES (1, 'art-1', 'articulo 1', 'Artículo 1', 'Los contratos de arrendamiento', 'sha')")
    hit = conn.execute(
        "SELECT 1 FROM articulo WHERE tsv @@ websearch_to_tsquery('spanish', 'arrendamiento')"
    ).fetchone()
    assert hit is not None


@requires_db
def test_analytics_matview_exists_and_refreshes(conn):
    conn.execute("REFRESH MATERIALIZED VIEW analytics.norma_signal")
    assert conn.execute("SELECT count(*) FROM analytics.norma_signal").fetchone()[0] == 0
```

- [ ] **Step 4: Run test to verify it fails**

Start a throwaway Postgres and run:

```bash
docker run -d --name leychile-pg -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16
export DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_db_schema.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'loader.db'`.

- [ ] **Step 5: Write `sql/001_schema.sql`**

```sql
-- Derived read model. Droppable: everything here rebuilds from snapshot artifacts.
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy título lookup (cold-path fallback)
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- EXCLUDE mixes `=` (btree) with `&&` (gist)

CREATE TABLE IF NOT EXISTS norma (
  id_norma           integer PRIMARY KEY,
  tipo               text NOT NULL,
  numero             text NOT NULL,
  titulo             text NOT NULL,
  organismo          text,
  clasificacion      text,
  derogado           boolean NOT NULL DEFAULT false,
  fecha_publicacion  date,
  law_dir            text NOT NULL,
  index_tier         text NOT NULL DEFAULT 'meta' CHECK (index_tier IN ('full','meta')),
  seeded             boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS norma_tipo_numero_idx ON norma (tipo, numero);
CREATE INDEX IF NOT EXISTS norma_titulo_trgm_idx ON norma USING gin (titulo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS norma_tier_idx ON norma (index_tier);

CREATE TABLE IF NOT EXISTS version (
  id                bigserial PRIMARY KEY,
  id_norma          integer NOT NULL REFERENCES norma ON DELETE CASCADE,
  desde             date NOT NULL,
  hasta             date,
  commit_sha        text NOT NULL,
  causa_id          integer,
  subject           text,
  magnitude         integer,
  texto_sha256      text NOT NULL,      -- sha256 of committed texto.md (provenance)
  canonical_sha256  text NOT NULL,      -- sha256 of canonical_text(segment(texto)) — the gate
  vigencia          daterange GENERATED ALWAYS AS (daterange(desde, hasta, '[]')) STORED,
  UNIQUE (id_norma, desde),
  -- The bug a delta loader introduces, and the one that makes "text as of D"
  -- ambiguous. Let the database refuse it.
  EXCLUDE USING gist (id_norma WITH =, vigencia WITH &&)
);
CREATE INDEX IF NOT EXISTS version_vigencia_idx ON version USING gist (vigencia);

CREATE TABLE IF NOT EXISTS articulo (
  id           bigserial PRIMARY KEY,
  id_norma     integer NOT NULL REFERENCES norma ON DELETE CASCADE,
  slug         text NOT NULL,
  label        text NOT NULL,
  raw_heading  text NOT NULL,
  body         text NOT NULL,
  content_sha256  text NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('spanish', body)) STORED,
  UNIQUE (id_norma, slug, content_sha256)
);
CREATE INDEX IF NOT EXISTS articulo_tsv_idx ON articulo USING gin (tsv);

CREATE TABLE IF NOT EXISTS articulo_span (
  articulo_id  bigint NOT NULL REFERENCES articulo ON DELETE CASCADE,
  desde        date NOT NULL,
  hasta        date,
  ord          integer NOT NULL,
  vigencia     daterange GENERATED ALWAYS AS (daterange(desde, hasta, '[]')) STORED,
  -- ord is in the key: one body may legitimately appear at two positions in a
  -- single version (deviates from spec §6.1's two-column key, which would
  -- collide in that case).
  PRIMARY KEY (articulo_id, desde, ord)
);
CREATE INDEX IF NOT EXISTS articulo_span_vigencia_idx ON articulo_span USING gist (vigencia);

CREATE TABLE IF NOT EXISTS modificacion (
  causa_id   integer NOT NULL,
  target_id  integer NOT NULL,
  fecha      date NOT NULL,
  commit_sha text,
  PRIMARY KEY (causa_id, target_id, fecha)
);

CREATE TABLE IF NOT EXISTS load_state (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  watermark        date NOT NULL,
  snapshot_version text NOT NULL,
  last_delta_seq   integer NOT NULL
);

-- ---------------------------------------------------------------------------
-- Analytics. Centralize collection; interpretation stays per-consumer.
-- No user dimension is ever collected: no IP, cookie, session id, fingerprint.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.event (
  ts           timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL CHECK (kind IN ('search','result_click','cold_surface')),
  query_norm   text,
  id_norma     integer,
  tier         text CHECK (tier IN ('hot','cold')),
  result_count integer,
  clicked_rank integer
);
CREATE INDEX IF NOT EXISTS event_ts_idx ON analytics.event (ts);
CREATE INDEX IF NOT EXISTS event_kind_norma_idx ON analytics.event (kind, id_norma);

-- The only consumer that feeds the index policy.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.norma_signal AS
  SELECT id_norma,
         SUM(CASE kind WHEN 'cold_surface' THEN 3
                       WHEN 'result_click' THEN 1
                       ELSE 0 END)::integer AS score
  FROM analytics.event
  WHERE id_norma IS NOT NULL
    AND ts >= now() - interval '90 days'
  GROUP BY id_norma;
CREATE UNIQUE INDEX IF NOT EXISTS norma_signal_pk ON analytics.norma_signal (id_norma);
```

- [ ] **Step 6: Write `scripts/loader/db.py` and empty `scripts/loader/__init__.py`**

```python
"""Postgres connection and schema application for the Railway loader."""
from __future__ import annotations

import os
from pathlib import Path

import psycopg

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "sql" / "001_schema.sql"


def connect(dsn: str | None = None) -> psycopg.Connection:
    resolved = dsn or os.environ.get("DATABASE_URL")
    if not resolved:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(resolved, autocommit=True)


def apply_schema(conn: psycopg.Connection, sql_path: Path = SCHEMA_PATH) -> None:
    conn.execute(sql_path.read_text(encoding="utf-8"))
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest tests/test_db_schema.py -q`
Expected: PASS, 7 tests.

Verify the whole suite still ignores integration tests by default:
Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest -q -m "not integration"`
Expected: PASS, no DB required.

- [ ] **Step 8: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add sql/ scripts/loader/ requirements-loader.txt tests/test_db_schema.py pytest.ini
git commit -m "feat(db): Postgres schema for the derived read model

EXCLUDE USING gist rejects overlapping versions at load time — the bug a
delta loader introduces, and the one that makes 'text as of D' ambiguous.
articulo_span's PK includes ord (deviation from spec §6.1): one body may
appear at two positions in a single version."
```

---

### Task 9: Idempotent loader

Every write is an upsert. A crashed load is retried, never repaired. The test that matters is "load the same delta twice and get the same database."

**Files:**
- Create: `scripts/loader/load.py`
- Create: `tests/test_loader_load.py`

**Interfaces:**
- Consumes: `connect` from Task 8; row types from Task 6; `ArticleRow`/`SpanRow` from Task 5.
- Produces:
  - `load_normas(conn, rows: list[NormaRow]) -> int`
  - `load_versions(conn, rows: list[VersionRow]) -> int`
  - `load_articles(conn, rows: list[ArticleRow]) -> int`
  - `load_spans(conn, rows: list[SpanRow]) -> int` — resolves `articulo_id` from `(id_norma, slug, content_sha256)`
  - `load_mods(conn, rows: list[ModRow]) -> int`
  - `replace_norma(conn, id_norma: int) -> None` — deletes versions/articles/spans for one norma so a delta can rewrite it cleanly
  - `set_load_state(conn, *, watermark: str, snapshot_version: str, last_delta_seq: int) -> None`
  - `get_load_state(conn) -> tuple[str, str, int] | None`

- [ ] **Step 1: Write the failing test**

Create `tests/test_loader_load.py`:

```python
import os

import pytest

pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

from schemas.snapshot import ModRow, NormaRow, VersionRow          # noqa: E402
from spans import ArticleRow, SpanRow                              # noqa: E402

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


# The `conn` fixture is shared, from tests/conftest.py (added in Task 8).
# It drops and reapplies the schema per test. Do not redefine it here.


NORMA = NormaRow(id_norma=42, tipo="ley", numero="42", titulo="LEY CUARENTA Y DOS",
                 organismo="MIN", clasificacion="sustantiva", derogado=False,
                 fecha_publicacion="1943-05-10", law_dir="leyes/42")
VERSION = VersionRow(id_norma=42, desde="1943-05-10", hasta=None, commit_sha="aaa",
                     causa_id=42, subject="s", magnitude=1,
                     texto_sha256="t1", canonical_sha256="c1")
ARTICLE = ArticleRow(id_norma=42, slug="art-1", label="articulo 1",
                     raw_heading="Artículo 1º", body="Uno.", content_sha256="sha1")
SPAN = SpanRow(id_norma=42, slug="art-1", content_sha256="sha1",
               desde="1943-05-10", hasta=None, ord=0)
MOD = ModRow(causa_id=99, target_id=42, fecha="2011-02-21", commit_sha="bbb")


def _load_all(conn):
    from loader import load
    load.load_normas(conn, [NORMA])
    load.load_versions(conn, [VERSION])
    load.load_articles(conn, [ARTICLE])
    load.load_spans(conn, [SPAN])
    load.load_mods(conn, [MOD])


@requires_db
def test_load_is_idempotent(conn):
    _load_all(conn)
    _load_all(conn)   # same delta applied twice
    counts = {
        t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        for t in ("norma", "version", "articulo", "articulo_span", "modificacion")
    }
    assert counts == {"norma": 1, "version": 1, "articulo": 1,
                      "articulo_span": 1, "modificacion": 1}


@requires_db
def test_spans_resolve_their_articulo_id(conn):
    _load_all(conn)
    row = conn.execute(
        "SELECT a.slug, s.ord FROM articulo_span s JOIN articulo a ON a.id = s.articulo_id"
    ).fetchone()
    assert row == ("art-1", 0)


@requires_db
def test_load_normas_updates_changed_metadata(conn):
    from loader import load
    load.load_normas(conn, [NORMA])
    load.load_normas(conn, [NormaRow(**{**NORMA.__dict__, "titulo": "NUEVO TÍTULO"})])
    assert conn.execute("SELECT titulo FROM norma").fetchone()[0] == "NUEVO TÍTULO"


@requires_db
def test_load_normas_preserves_index_tier_across_reloads(conn):
    """Retier state is loader-owned, not artifact-owned. A reload must not reset it."""
    from loader import load
    load.load_normas(conn, [NORMA])
    conn.execute("UPDATE norma SET index_tier = 'full', seeded = true WHERE id_norma = 42")
    load.load_normas(conn, [NORMA])
    assert conn.execute("SELECT index_tier, seeded FROM norma").fetchone() == ("full", True)


@requires_db
def test_replace_norma_clears_derived_rows_only(conn):
    from loader import load
    _load_all(conn)
    load.replace_norma(conn, 42)
    assert conn.execute("SELECT count(*) FROM version").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM articulo").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM norma").fetchone()[0] == 1


@requires_db
def test_replace_then_reload_lets_a_version_range_change(conn):
    """The EXCLUDE constraint would reject an overlapping rewrite without replace."""
    from loader import load
    _load_all(conn)
    load.replace_norma(conn, 42)
    load.load_versions(conn, [
        VersionRow(**{**VERSION.__dict__, "hasta": "2010-12-31"}),
        VersionRow(id_norma=42, desde="2011-01-01", hasta=None, commit_sha="bbb",
                   causa_id=99, subject="s2", magnitude=2,
                   texto_sha256="t2", canonical_sha256="c2"),
    ])
    assert conn.execute("SELECT count(*) FROM version").fetchone()[0] == 2


@requires_db
def test_load_state_round_trip(conn):
    from loader import load
    assert load.get_load_state(conn) is None
    load.set_load_state(conn, watermark="2026-05-29", snapshot_version="v1", last_delta_seq=3)
    load.set_load_state(conn, watermark="2026-06-01", snapshot_version="v1", last_delta_seq=4)
    assert load.get_load_state(conn) == ("2026-06-01", "v1", 4)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest tests/test_loader_load.py -q`
Expected: FAIL with `ImportError: cannot import name 'load' from 'loader'`.

- [ ] **Step 3: Write `scripts/loader/load.py`**

```python
"""Idempotent upserts from snapshot rows into Postgres.

Everything is keyed so a re-applied delta is a no-op. `index_tier` and `seeded`
are deliberately excluded from the norma upsert: they are loader-owned retier
state, not artifact-owned, and a reload must not reset them.
"""
from __future__ import annotations

from typing import Iterable

import psycopg

from schemas.snapshot import ModRow, NormaRow, VersionRow
from spans import ArticleRow, SpanRow


def load_normas(conn: psycopg.Connection, rows: Iterable[NormaRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO norma (id_norma, tipo, numero, titulo, organismo,
                               clasificacion, derogado, fecha_publicacion, law_dir)
            VALUES (%(id_norma)s, %(tipo)s, %(numero)s, %(titulo)s, %(organismo)s,
                    %(clasificacion)s, %(derogado)s, %(fecha_publicacion)s, %(law_dir)s)
            ON CONFLICT (id_norma) DO UPDATE SET
                tipo = EXCLUDED.tipo, numero = EXCLUDED.numero, titulo = EXCLUDED.titulo,
                organismo = EXCLUDED.organismo, clasificacion = EXCLUDED.clasificacion,
                derogado = EXCLUDED.derogado, fecha_publicacion = EXCLUDED.fecha_publicacion,
                law_dir = EXCLUDED.law_dir
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_versions(conn: psycopg.Connection, rows: Iterable[VersionRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO version (id_norma, desde, hasta, commit_sha, causa_id,
                                 subject, magnitude, texto_sha256, canonical_sha256)
            VALUES (%(id_norma)s, %(desde)s, %(hasta)s, %(commit_sha)s, %(causa_id)s,
                    %(subject)s, %(magnitude)s, %(texto_sha256)s, %(canonical_sha256)s)
            ON CONFLICT (id_norma, desde) DO UPDATE SET
                hasta = EXCLUDED.hasta, commit_sha = EXCLUDED.commit_sha,
                causa_id = EXCLUDED.causa_id, subject = EXCLUDED.subject,
                magnitude = EXCLUDED.magnitude, texto_sha256 = EXCLUDED.texto_sha256,
                canonical_sha256 = EXCLUDED.canonical_sha256
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_articles(conn: psycopg.Connection, rows: Iterable[ArticleRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256)
            VALUES (%(id_norma)s, %(slug)s, %(label)s, %(raw_heading)s, %(body)s, %(content_sha256)s)
            ON CONFLICT (id_norma, slug, content_sha256) DO UPDATE SET
                label = EXCLUDED.label, raw_heading = EXCLUDED.raw_heading
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_spans(conn: psycopg.Connection, rows: Iterable[SpanRow]) -> int:
    """Resolve articulo_id from the dedup key, then upsert the span."""
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO articulo_span (articulo_id, desde, hasta, ord)
            SELECT a.id, %(desde)s, %(hasta)s, %(ord)s
              FROM articulo a
             WHERE a.id_norma = %(id_norma)s
               AND a.slug = %(slug)s
               AND a.content_sha256 = %(content_sha256)s
            ON CONFLICT (articulo_id, desde, ord) DO UPDATE SET hasta = EXCLUDED.hasta
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_mods(conn: psycopg.Connection, rows: Iterable[ModRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO modificacion (causa_id, target_id, fecha, commit_sha)
            VALUES (%(causa_id)s, %(target_id)s, %(fecha)s, %(commit_sha)s)
            ON CONFLICT (causa_id, target_id, fecha) DO UPDATE SET commit_sha = EXCLUDED.commit_sha
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def replace_norma(conn: psycopg.Connection, id_norma: int) -> None:
    """Drop a norma's derived rows so a delta can rewrite them.

    Required because a re-exported norma may close a previously open-ended
    version range, which the EXCLUDE constraint would otherwise reject.
    The norma row itself survives, preserving index_tier and seeded.
    """
    conn.execute("DELETE FROM version WHERE id_norma = %s", (id_norma,))
    conn.execute("DELETE FROM articulo WHERE id_norma = %s", (id_norma,))  # cascades to spans


def set_load_state(
    conn: psycopg.Connection, *, watermark: str, snapshot_version: str, last_delta_seq: int
) -> None:
    conn.execute(
        """
        INSERT INTO load_state (id, watermark, snapshot_version, last_delta_seq)
        VALUES (true, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            watermark = EXCLUDED.watermark,
            snapshot_version = EXCLUDED.snapshot_version,
            last_delta_seq = EXCLUDED.last_delta_seq
        """,
        (watermark, snapshot_version, last_delta_seq),
    )


def get_load_state(conn: psycopg.Connection) -> tuple[str, str, int] | None:
    row = conn.execute(
        "SELECT watermark, snapshot_version, last_delta_seq FROM load_state WHERE id"
    ).fetchone()
    return (row[0].isoformat(), row[1], row[2]) if row else None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest tests/test_loader_load.py -q`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/loader/load.py tests/test_loader_load.py
git commit -m "feat(loader): idempotent upserts

index_tier and seeded are excluded from the norma upsert — retier state is
loader-owned, not artifact-owned, and a reload must not reset it."
```

---

### Task 10: The validation gate

Reconstruct every version from `articulo` + `articulo_span`, hash its canonical form, compare against `version.canonical_sha256`. This is the one acceptance criterion that blocks cutover.

**Files:**
- Create: `scripts/loader/verify.py`
- Create: `tests/test_loader_verify.py`

**Interfaces:**
- Consumes: `connect` from Task 8; `reconstruct` from Task 5; `canonical_text`, `sha256_text` from Task 2.
- Produces:
  - `Mismatch` (frozen: `id_norma: int`, `desde: str`, `expected: str`, `actual: str`)
  - `verify_norma(conn, id_norma: int) -> list[Mismatch]`
  - `verify_all(conn, *, limit: int | None = None) -> list[Mismatch]`

- [ ] **Step 1: Write the failing test**

Create `tests/test_loader_verify.py`:

```python
import os

import pytest

pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

from schemas.snapshot import NormaRow, VersionRow    # noqa: E402
from segment import canonical_text, segment, sha256_text  # noqa: E402
from spans import VersionInput, build_articles_and_spans  # noqa: E402

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")

V1 = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos."
V2 = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos MODIFICADO."


# The `conn` fixture is shared, from tests/conftest.py (added in Task 8).
# It drops and reapplies the schema per test. Do not redefine it here.


def _seed(conn, textos: dict[str, str]):
    """textos maps desde -> texto. Loads a fully consistent norma 42."""
    from loader import load
    load.load_normas(conn, [NormaRow(
        id_norma=42, tipo="ley", numero="42", titulo="T", organismo="M",
        clasificacion="sustantiva", derogado=False,
        fecha_publicacion="2000-01-01", law_dir="leyes/42")])

    desdes = sorted(textos)
    inputs, versions = [], []
    for i, d in enumerate(desdes):
        hasta = None if i + 1 == len(desdes) else "2009-12-31"
        inputs.append(VersionInput(desde=d, hasta=hasta, texto=textos[d]))
        versions.append(VersionRow(
            id_norma=42, desde=d, hasta=hasta, commit_sha=f"sha{i}", causa_id=None,
            subject="s", magnitude=0,
            texto_sha256=sha256_text(textos[d]),
            canonical_sha256=sha256_text(canonical_text(segment(textos[d]))),
        ))
    arts, spans = build_articles_and_spans(42, inputs)
    load.load_versions(conn, versions)
    load.load_articles(conn, arts)
    load.load_spans(conn, spans)


@requires_db
def test_consistent_load_verifies_clean(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1, "2010-01-01": V2})
    assert verify_all(conn) == []


@requires_db
def test_single_version_norma_verifies(conn):
    from loader.verify import verify_norma
    _seed(conn, {"2000-01-01": V1})
    assert verify_norma(conn, 42) == []


@requires_db
def test_a_dropped_article_is_caught(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1})
    conn.execute("DELETE FROM articulo WHERE slug = 'art-2'")
    mismatches = verify_all(conn)
    assert len(mismatches) == 1
    assert mismatches[0].id_norma == 42


@requires_db
def test_a_corrupted_body_is_caught(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1})
    conn.execute("UPDATE articulo SET body = 'CORRUPTO' WHERE slug = 'art-1'")
    assert len(verify_all(conn)) == 1


@requires_db
def test_a_reordered_article_is_caught(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1})
    conn.execute("UPDATE articulo_span SET ord = 10 - ord")
    assert len(verify_all(conn)) == 1


@requires_db
def test_whitespace_in_the_source_does_not_trip_the_gate(conn):
    """canonical_text is whitespace-insensitive by design; that is the point."""
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": "#### Artículo 1º\n\n\n   Uno.   \n\n"})
    assert verify_all(conn) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest tests/test_loader_verify.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'loader.verify'`.

- [ ] **Step 3: Write `scripts/loader/verify.py`**

```python
"""The validation gate (spec §8.1).

Reconstruct every version from articulo + articulo_span, hash its canonical
form, compare against version.canonical_sha256. 100% match or no cutover.

Not a byte-comparison against texto.md: segmentation strips bodies and rewrites
headings, so byte-identity is unachievable by construction. canonical_text is
order-, heading- and body-sensitive while ignoring the whitespace segmentation
was always going to discard — which is exactly the property we need.
"""
from __future__ import annotations

from dataclasses import dataclass

import psycopg

from segment import canonical_text, sha256_text
from spans import ArticleRow, SpanRow, reconstruct


@dataclass(frozen=True)
class Mismatch:
    id_norma: int
    desde: str
    expected: str
    actual: str


def _rows_for(conn: psycopg.Connection, id_norma: int) -> tuple[list[ArticleRow], list[SpanRow]]:
    articles = [
        ArticleRow(id_norma=id_norma, slug=slug, label=label,
                   raw_heading=raw_heading, body=body, content_sha256=sha)
        for slug, label, raw_heading, body, sha in conn.execute(
            "SELECT slug, label, raw_heading, body, content_sha256 FROM articulo WHERE id_norma = %s",
            (id_norma,),
        )
    ]
    spans = [
        SpanRow(id_norma=id_norma, slug=slug, content_sha256=sha,
                desde=desde.isoformat(), hasta=hasta.isoformat() if hasta else None, ord=ord_)
        for slug, sha, desde, hasta, ord_ in conn.execute(
            """
            SELECT a.slug, a.content_sha256, s.desde, s.hasta, s.ord
              FROM articulo_span s JOIN articulo a ON a.id = s.articulo_id
             WHERE a.id_norma = %s
            """,
            (id_norma,),
        )
    ]
    return articles, spans


def verify_norma(conn: psycopg.Connection, id_norma: int) -> list[Mismatch]:
    articles, spans = _rows_for(conn, id_norma)
    out: list[Mismatch] = []
    for desde, expected in conn.execute(
        "SELECT desde, canonical_sha256 FROM version WHERE id_norma = %s ORDER BY desde",
        (id_norma,),
    ).fetchall():
        actual = sha256_text(canonical_text(reconstruct(articles, spans, desde.isoformat())))
        if actual != expected:
            out.append(Mismatch(id_norma, desde.isoformat(), expected, actual))
    return out


def verify_all(conn: psycopg.Connection, *, limit: int | None = None) -> list[Mismatch]:
    sql = "SELECT id_norma FROM norma ORDER BY id_norma"
    if limit:
        sql += f" LIMIT {int(limit)}"
    ids = [r[0] for r in conn.execute(sql).fetchall()]
    mismatches: list[Mismatch] = []
    for id_norma in ids:
        mismatches += verify_norma(conn, id_norma)
    return mismatches


def main() -> int:
    from loader.db import connect
    conn = connect()
    mismatches = verify_all(conn)
    if mismatches:
        for m in mismatches[:20]:
            print(f"MISMATCH id_norma={m.id_norma} desde={m.desde}")
        print(f"\nGATE FAILED: {len(mismatches)} versions did not reconstruct.")
        return 1
    print("GATE PASSED: every version reconstructs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest tests/test_loader_verify.py -q`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/loader/verify.py tests/test_loader_verify.py
git commit -m "feat(loader): canonical-form reconstruction gate

Catches dropped, corrupted and reordered articles; ignores whitespace, which
segmentation was always going to discard."
```

---

### Task 11: Meilisearch indexer

Postgres → Meilisearch, hot tier only. Nothing else writes to Meili, so it is always rebuildable from Postgres without touching git.

**Files:**
- Create: `scripts/loader/index_meili.py`
- Create: `tests/test_index_meili.py`

**Interfaces:**
- Consumes: `connect` from Task 8.
- Produces:
  - `OPEN_ENDED_TS: int = 253402300799`
  - `SETTINGS: dict` — the index settings payload
  - `to_ts(d: date | None) -> int`
  - `articulo_documents(conn, id_normas: list[int] | None = None) -> list[dict]` — only `index_tier='full'`
  - `norma_documents(conn, id_normas: list[int] | None = None) -> list[dict]` — all tiers
  - `sync_articulos(client, docs: list[dict], delete_id_normas: list[int]) -> None`
  - `rank_tipo(tipo: str) -> int`

- [ ] **Step 1: Write the failing test**

Create `tests/test_index_meili.py`. The Meili client is faked, so this stays a pure-function test with no network.

```python
from datetime import date


class FakeMeiliIndex:
    def __init__(self):
        self.added, self.deleted, self.settings = [], [], None

    def add_documents(self, docs, primary_key=None):
        self.added.extend(docs)

    def delete_documents_by_filter(self, filter):
        self.deleted.append(filter)

    def update_settings(self, settings):
        self.settings = settings


def test_open_ended_sentinel():
    from loader.index_meili import OPEN_ENDED_TS, to_ts
    assert to_ts(None) == OPEN_ENDED_TS
    assert OPEN_ENDED_TS == 253402300799


def test_to_ts_is_utc_midnight():
    from loader.index_meili import to_ts
    assert to_ts(date(1970, 1, 1)) == 0
    assert to_ts(date(2000, 1, 1)) == 946684800


def test_rank_tipo_puts_ley_above_res():
    from loader.index_meili import rank_tipo
    assert rank_tipo("ley") < rank_tipo("dto") < rank_tipo("res")
    assert rank_tipo("desconocido") == rank_tipo("res")


def test_settings_do_not_set_index_level_distinct():
    """Index-level distinct would break 'all matching artículos inside this law'."""
    from loader.index_meili import SETTINGS
    assert "distinctAttribute" not in SETTINGS
    assert "id_norma" in SETTINGS["filterableAttributes"]
    assert SETTINGS["searchableAttributes"] == ["titulo", "label", "body"]
    assert "desde_ts" in SETTINGS["filterableAttributes"]
    assert "hasta_ts" in SETTINGS["filterableAttributes"]


def test_sync_deletes_before_adding():
    from loader.index_meili import sync_articulos
    idx = FakeMeiliIndex()
    sync_articulos(idx, [{"id": "1:art-1:abc", "id_norma": 1}], [1, 2])
    assert idx.deleted == ["id_norma IN [1, 2]"]
    assert len(idx.added) == 1


def test_sync_with_no_deletes_skips_the_delete_call():
    from loader.index_meili import sync_articulos
    idx = FakeMeiliIndex()
    sync_articulos(idx, [{"id": "1:art-1:abc"}], [])
    assert idx.deleted == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_index_meili.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'loader.index_meili'`.

- [ ] **Step 3: Write `scripts/loader/index_meili.py`**

```python
"""Postgres → Meilisearch. The hot tier only.

Nothing else writes to Meilisearch, so it can always be rebuilt from Postgres
without touching git. Indexing in parallel from the pipeline would create two
ingestion paths that drift, and the drift surfaces as "search returns a norma
whose page 404s".
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import psycopg

OPEN_ENDED_TS = 253402300799  # year 9999; matches Meilisearch's numeric range filters

# Lower sorts first. A `ley` outranks a `res` at equal textual relevance.
_TIPO_RANK = {"ley": 0, "dl": 1, "dfl": 2, "cod": 3, "dto": 4}
_DEFAULT_RANK = 5

SETTINGS: dict = {
    # Order sets ranking priority.
    "searchableAttributes": ["titulo", "label", "body"],
    "filterableAttributes": [
        "id_norma", "tipo", "organismo", "anio_pub", "derogado", "desde_ts", "hasta_ts",
    ],
    "sortableAttributes": ["desde_ts", "anio_pub"],
    "rankingRules": [
        "words", "typo", "proximity", "attribute", "sort", "exactness", "rank_tipo:asc",
    ],
    # NOTE: distinctAttribute is deliberately absent. Index-level distinct applies
    # to every query and would silently break "show me all matching artículos
    # inside this law". Pass distinct: "id_norma" as a per-search parameter.
}


def rank_tipo(tipo: str) -> int:
    return _TIPO_RANK.get(tipo, _DEFAULT_RANK)


def to_ts(d: date | None) -> int:
    if d is None:
        return OPEN_ENDED_TS
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


_ARTICULO_SQL = """
SELECT n.id_norma, n.tipo, n.numero, n.titulo, n.organismo, n.derogado,
       n.fecha_publicacion, a.slug, a.label, a.body, a.content_sha256,
       s.desde, s.hasta
  FROM articulo a
  JOIN norma n ON n.id_norma = a.id_norma
  JOIN articulo_span s ON s.articulo_id = a.id
 WHERE n.index_tier = 'full'
   {norma_filter}
"""


def articulo_documents(
    conn: psycopg.Connection, id_normas: list[int] | None = None
) -> list[dict]:
    clause, params = "", ()
    if id_normas:
        clause, params = "AND n.id_norma = ANY(%s)", (id_normas,)
    rows = conn.execute(_ARTICULO_SQL.format(norma_filter=clause), params).fetchall()
    return [
        {
            "id": f"{id_norma}:{slug}:{sha[:8]}",
            "id_norma": id_norma,
            "tipo": tipo,
            "numero": numero,
            "titulo": titulo,
            "organismo": organismo,
            "derogado": derogado,
            "anio_pub": fecha_pub.year if fecha_pub else 0,
            "slug": slug,
            "label": label,
            "body": body,
            "desde_ts": to_ts(desde),
            "hasta_ts": to_ts(hasta),
            "rank_tipo": rank_tipo(tipo),
        }
        for (id_norma, tipo, numero, titulo, organismo, derogado, fecha_pub,
             slug, label, body, sha, desde, hasta) in rows
    ]


def norma_documents(
    conn: psycopg.Connection, id_normas: list[int] | None = None
) -> list[dict]:
    """Every norma, regardless of tier: no norma is ever unfindable by name or number."""
    sql = ("SELECT id_norma, tipo, numero, titulo, organismo, fecha_publicacion, derogado "
           "FROM norma")
    params = ()
    if id_normas:
        sql += " WHERE id_norma = ANY(%s)"
        params = (id_normas,)
    return [
        {
            "id": id_norma, "tipo": tipo, "numero": numero, "titulo": titulo,
            "organismo": organismo, "anio_pub": fp.year if fp else 0,
            "derogado": derogado, "rank_tipo": rank_tipo(tipo),
        }
        for id_norma, tipo, numero, titulo, organismo, fp, derogado in conn.execute(sql, params)
    ]


def sync_articulos(index, docs: list[dict], delete_id_normas: list[int]) -> None:
    """Delete demoted/stale normas' documents first, then add. Order matters: a
    promoted norma whose articles changed must not keep its old documents."""
    if delete_id_normas:
        index.delete_documents_by_filter(f"id_norma IN {sorted(delete_id_normas)}")
    if docs:
        index.add_documents(docs, primary_key="id")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_index_meili.py -q`
Expected: PASS, 6 tests.

- [ ] **Step 5: Phase 0 measurement #3 — index size**

Seed a local Meilisearch with a 5% sample of the seed tier and read back its size.

```bash
docker run -d --name leychile-meili -p 7700:7700 -e MEILI_MASTER_KEY=dev getmeili/meilisearch:v1.11
# after Task 13's loader has populated Postgres from a sample snapshot:
curl -s -H "Authorization: Bearer dev" http://localhost:7700/stats | python3 -m json.tool
```

Extrapolate `databaseSize` × 20 to the full seed tier. Record the number; it sets `INDEX_BUDGET_BYTES` in Task 12 and validates the spec §10 RAM guess.

- [ ] **Step 6: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/loader/index_meili.py tests/test_index_meili.py
git commit -m "feat(loader): Meilisearch indexer, hot tier only

distinctAttribute is deliberately not set at the index level; distinct is a
per-search parameter so in-law search still returns every matching artículo."
```

---

### Task 12: Retier — the usage-based indexing policy

**Files:**
- Create: `scripts/loader/retier.py`
- Create: `tests/test_retier.py`

**Interfaces:**
- Consumes: `connect` from Task 8.
- Produces:
  - `SEED_TIPOS: frozenset[str] = frozenset({"ley", "dl", "dfl", "cod"})`
  - `PROMOTION_THRESHOLD: int = 3`
  - `apply_seed(conn) -> int` — sets `seeded=true, index_tier='full'` for seed tipos and any `dto` in `modificacion`
  - `refresh_signal(conn) -> None`
  - `estimate_tier_bytes(conn) -> int`
  - `compute_promotions(conn, *, budget_bytes: int) -> list[int]`
  - `apply_promotions(conn, id_normas: list[int]) -> None`
  - `prune_events(conn, *, days: int = 90) -> int`

- [ ] **Step 1: Write the failing test**

Create `tests/test_retier.py`:

```python
import os

import pytest

pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


# Pytest fixture override: this `conn` requests the shared `conn` from
# tests/conftest.py (Task 8) and layers a small corpus on top. Test bodies
# below take `conn` and get the seeded connection.
@pytest.fixture()
def conn(conn):  # noqa: F811 — intentional pytest fixture override
    for i, tipo in [(1, "ley"), (2, "res"), (3, "dto"), (4, "dto"), (5, "cod")]:
        conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                     "VALUES (%s, %s, %s, 'T', %s)", (i, tipo, str(i), f"{tipo}/{i}"))
    conn.execute("INSERT INTO modificacion (causa_id, target_id, fecha) VALUES (3, 1, '2001-01-01')")
    return conn


@requires_db
def test_seed_promotes_leyes_and_codigos_but_not_resoluciones(conn):
    from loader.retier import apply_seed
    apply_seed(conn)
    tiers = dict(conn.execute("SELECT id_norma, index_tier FROM norma").fetchall())
    assert tiers[1] == "full" and tiers[5] == "full"   # ley, cod
    assert tiers[2] == "meta"                          # res
    assert tiers[4] == "meta"                          # inert dto


@requires_db
def test_seed_promotes_a_dto_that_appears_as_a_modifier(conn):
    from loader.retier import apply_seed
    apply_seed(conn)
    assert conn.execute("SELECT index_tier, seeded FROM norma WHERE id_norma = 3").fetchone() \
        == ("full", True)


@requires_db
def test_promotion_requires_the_threshold(conn):
    from loader.retier import compute_promotions, refresh_signal
    # one click on norma 2 = score 1; one cold_surface on norma 4 = score 3
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('result_click', 2)")
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('cold_surface', 4)")
    refresh_signal(conn)
    assert compute_promotions(conn, budget_bytes=10**12) == [4]


@requires_db
def test_events_outside_the_90_day_window_do_not_promote(conn):
    from loader.retier import compute_promotions, refresh_signal
    conn.execute("INSERT INTO analytics.event (ts, kind, id_norma) "
                 "VALUES (now() - interval '91 days', 'cold_surface', 2)")
    refresh_signal(conn)
    assert compute_promotions(conn, budget_bytes=10**12) == []


@requires_db
def test_budget_refuses_promotion_rather_than_evicting(conn):
    from loader.retier import apply_seed, compute_promotions, refresh_signal
    apply_seed(conn)
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('cold_surface', 2)")
    refresh_signal(conn)
    assert compute_promotions(conn, budget_bytes=0) == []
    # v1 never demotes: the seeded normas keep their tier
    assert conn.execute("SELECT count(*) FROM norma WHERE index_tier = 'full'").fetchone()[0] == 3


@requires_db
def test_apply_promotions_never_touches_seeded_rows(conn):
    from loader.retier import apply_promotions, apply_seed
    apply_seed(conn)
    apply_promotions(conn, [2])
    assert conn.execute("SELECT index_tier, seeded FROM norma WHERE id_norma = 2").fetchone() \
        == ("full", False)
    assert conn.execute("SELECT seeded FROM norma WHERE id_norma = 1").fetchone()[0] is True


@requires_db
def test_prune_events_drops_only_old_rows(conn):
    from loader.retier import prune_events
    conn.execute("INSERT INTO analytics.event (ts, kind, id_norma) "
                 "VALUES (now() - interval '91 days', 'search', NULL)")
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('search', NULL)")
    assert prune_events(conn) == 1
    assert conn.execute("SELECT count(*) FROM analytics.event").fetchone()[0] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest tests/test_retier.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'loader.retier'`.

- [ ] **Step 3: Write `scripts/loader/retier.py`**

```python
"""Usage-based indexing policy (spec §7.3).

Seed statically, promote on signal, cap at budget. v1 never demotes: exceeding
the budget refuses further promotion and logs. Eviction ships when the cap
actually binds — until then it is speculative machinery.

The signal that makes this work is `cold_surface`: Meilisearch could not find
something a user wanted and Postgres could. Without the cold path, the policy
is self-fulfilling — an unindexed phrase is never found, so its norma never
earns promotion, so the phrase stays unfindable.
"""
from __future__ import annotations

import psycopg

SEED_TIPOS = frozenset({"ley", "dl", "dfl", "cod"})
PROMOTION_THRESHOLD = 3


def apply_seed(conn: psycopg.Connection) -> int:
    """Seed tier: substantive legislation, plus any dto that modifies something."""
    result = conn.execute(
        """
        UPDATE norma SET index_tier = 'full', seeded = true
         WHERE seeded = false
           AND (tipo = ANY(%s) OR id_norma IN (SELECT causa_id FROM modificacion))
        """,
        (sorted(SEED_TIPOS),),
    )
    return result.rowcount


def refresh_signal(conn: psycopg.Connection) -> None:
    conn.execute("REFRESH MATERIALIZED VIEW analytics.norma_signal")


def estimate_tier_bytes(conn: psycopg.Connection) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(octet_length(a.body)), 0)
          FROM articulo a JOIN norma n ON n.id_norma = a.id_norma
         WHERE n.index_tier = 'full'
        """
    ).fetchone()
    return int(row[0])


def compute_promotions(conn: psycopg.Connection, *, budget_bytes: int) -> list[int]:
    """Normas scoring >= threshold in the trailing 90 days, while under budget."""
    if estimate_tier_bytes(conn) >= budget_bytes:
        return []
    return [
        r[0]
        for r in conn.execute(
            """
            SELECT s.id_norma
              FROM analytics.norma_signal s
              JOIN norma n ON n.id_norma = s.id_norma
             WHERE n.index_tier = 'meta' AND s.score >= %s
             ORDER BY s.score DESC, s.id_norma
            """,
            (PROMOTION_THRESHOLD,),
        ).fetchall()
    ]


def apply_promotions(conn: psycopg.Connection, id_normas: list[int]) -> None:
    if not id_normas:
        return
    conn.execute(
        "UPDATE norma SET index_tier = 'full' WHERE id_norma = ANY(%s) AND seeded = false",
        (id_normas,),
    )


def prune_events(conn: psycopg.Connection, *, days: int = 90) -> int:
    result = conn.execute(
        "DELETE FROM analytics.event WHERE ts < now() - make_interval(days => %s)", (days,)
    )
    return result.rowcount
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest tests/test_retier.py -q`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/loader/retier.py tests/test_retier.py
git commit -m "feat(loader): usage-based indexing policy

Seed, promote on signal, cap at budget. v1 refuses promotion rather than
evicting. cold_surface events are what stop the policy being self-fulfilling."
```

---

### Task 13: Loader entrypoint

Phases in order: **load → verify → index → retier → revalidate.** Verify sits before index deliberately: never publish to search what did not reconstruct.

**Files:**
- Create: `scripts/loader/main.py`
- Create: `tests/test_loader_main.py`

**Interfaces:**
- Consumes: everything from Tasks 8–12.
- Produces:
  - `should_load(published: Manifest, current: tuple[str, str, int] | None) -> bool`
  - `revalidate(url: str, token: str, id_normas: list[int], *, post=requests.post) -> bool`
  - `run(conn, client, artifacts_dir: Path, *, budget_bytes: int, revalidate_url: str | None) -> int`

- [ ] **Step 1: Write the failing test**

Create `tests/test_loader_main.py`. `should_load` and `revalidate` are pure enough to test without a database.

```python
from schemas.snapshot import Manifest


def _m(version="v2", seq=5):
    return Manifest(snapshot_version=version, watermark="2026-06-01",
                    last_delta_seq=seq, shards=[])


def test_first_run_always_loads():
    from loader.main import should_load
    assert should_load(_m(), None) is True


def test_loads_when_delta_seq_advanced():
    from loader.main import should_load
    assert should_load(_m(seq=5), ("2026-06-01", "v2", 4)) is True


def test_skips_when_already_current():
    from loader.main import should_load
    assert should_load(_m(seq=5), ("2026-06-01", "v2", 5)) is False


def test_reloads_when_snapshot_version_changed():
    """A schema change republishes a full snapshot under a new version."""
    from loader.main import should_load
    assert should_load(_m(version="v3", seq=0), ("2026-06-01", "v2", 9)) is True


def test_revalidate_posts_changed_normas():
    from loader.main import revalidate
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, json=json, headers=headers)
        class R:
            status_code = 200
        return R()

    assert revalidate("https://x/api/revalidate", "tok", [1, 2], post=fake_post) is True
    assert seen["json"] == {"idNormas": [1, 2]}
    assert seen["headers"]["Authorization"] == "Bearer tok"


def test_revalidate_reports_failure_without_raising():
    from loader.main import revalidate

    def fake_post(url, json, headers, timeout):
        class R:
            status_code = 503
        return R()

    assert revalidate("https://x", "tok", [1], post=fake_post) is False


def test_revalidate_with_no_normas_is_a_noop():
    from loader.main import revalidate

    def explode(*a, **k):
        raise AssertionError("must not POST for an empty list")

    assert revalidate("https://x", "tok", [], post=explode) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_loader_main.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'loader.main'`.

- [ ] **Step 3: Write `scripts/loader/main.py`**

```python
"""Railway cron entrypoint: load → verify → index → retier → revalidate.

Verify precedes index on purpose: never publish to search what did not
reconstruct. A failed verify aborts before Meilisearch or the web tier learn
anything about the bad data.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path

import requests

from schemas.snapshot import Manifest, ModRow, NormaRow, VersionRow, from_ndjson
from spans import ArticleRow, SpanRow

from . import index_meili, load, retier, verify
from .db import connect

_KINDS = {
    "normas": (NormaRow, load.load_normas),
    "versions": (VersionRow, load.load_versions),
    "articulos": (ArticleRow, load.load_articles),
    "spans": (SpanRow, load.load_spans),
    "mods": (ModRow, load.load_mods),
}


def should_load(published: Manifest, current: tuple[str, str, int] | None) -> bool:
    if current is None:
        return True
    _watermark, snapshot_version, last_delta_seq = current
    if published.snapshot_version != snapshot_version:
        return True   # schema change republished a full snapshot
    return published.last_delta_seq > last_delta_seq


def revalidate(url: str, token: str, id_normas: list[int], *, post=requests.post) -> bool:
    if not id_normas:
        return True
    resp = post(url, json={"idNormas": id_normas},
                headers={"Authorization": f"Bearer {token}"}, timeout=30)
    return 200 <= resp.status_code < 300


def _read_shard(path: Path, cls):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return [from_ndjson(line, cls) for line in fh if line.strip()]


def run(conn, client, artifacts_dir: Path, *, budget_bytes: int,
        revalidate_url: str | None, revalidate_token: str = "") -> int:
    manifest = Manifest(**json.loads((artifacts_dir / "manifest.json").read_text()))
    if not should_load(manifest, load.get_load_state(conn)):
        print("up to date; nothing to do")
        return 0

    normas = _read_shard(next(artifacts_dir.glob("normas-*.ndjson.gz")), NormaRow)
    touched = [n.id_norma for n in normas]

    # Clear derived rows first: a re-exported norma may close a previously
    # open-ended version range, which the EXCLUDE constraint would reject.
    load.load_normas(conn, normas)
    for id_norma in touched:
        load.replace_norma(conn, id_norma)

    for kind in ("versions", "articulos", "spans", "mods"):
        cls, fn = _KINDS[kind]
        for shard in sorted(artifacts_dir.glob(f"{kind}-*.ndjson.gz")):
            fn(conn, _read_shard(shard, cls))

    mismatches = verify.verify_all(conn)
    if mismatches:
        for m in mismatches[:20]:
            print(f"MISMATCH id_norma={m.id_norma} desde={m.desde}")
        print(f"ABORT: {len(mismatches)} versions failed to reconstruct; nothing indexed.")
        return 1

    retier.apply_seed(conn)
    retier.refresh_signal(conn)
    promoted = retier.compute_promotions(conn, budget_bytes=budget_bytes)
    if not promoted and retier.estimate_tier_bytes(conn) >= budget_bytes:
        print(f"INDEX_BUDGET_BYTES={budget_bytes} reached; promotion refused this run")
    retier.apply_promotions(conn, promoted)
    retier.prune_events(conn)

    art_index = client.index("articulos")
    art_index.update_settings(index_meili.SETTINGS)
    index_meili.sync_articulos(
        art_index, index_meili.articulo_documents(conn, touched), touched
    )
    client.index("normas").add_documents(
        index_meili.norma_documents(conn, touched), primary_key="id"
    )

    load.set_load_state(conn, watermark=manifest.watermark,
                        snapshot_version=manifest.snapshot_version,
                        last_delta_seq=manifest.last_delta_seq)

    if revalidate_url:
        ok = revalidate(revalidate_url, revalidate_token, touched)
        print(f"revalidate: {'ok' if ok else 'FAILED (pages will serve stale)'}")

    print(f"loaded {len(normas)} normas, promoted {len(promoted)}")
    return 0


def main() -> int:
    import meilisearch

    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", type=Path, required=True)
    ap.add_argument("--budget-bytes", type=int,
                    default=int(os.environ.get("INDEX_BUDGET_BYTES", 4 * 1024**3)))
    args = ap.parse_args()

    client = meilisearch.Client(
        os.environ["MEILI_URL"], os.environ.get("MEILI_MASTER_KEY")
    )
    return run(
        connect(), client, args.artifacts,
        budget_bytes=args.budget_bytes,
        revalidate_url=os.environ.get("REVALIDATE_URL"),
        revalidate_token=os.environ.get("REVALIDATE_TOKEN", ""),
    )


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && python -m pytest tests/test_loader_main.py -q`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full data-plane suite**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest -q`
Expected: PASS, all tests including integration.

- [ ] **Step 6: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add scripts/loader/main.py tests/test_loader_main.py
git commit -m "feat(loader): cron entrypoint

Verify precedes index: never publish to search what did not reconstruct."
```

---

> **Milestone.** Tasks 1–13 are the complete data plane. It is independently shippable: the pipeline exports, the loader ingests, verifies, indexes and retiers. If execution stalls, stop here with working software.

---

### Task 14: Next.js scaffold and data access

**Files:**
- Create: `site/package.json`, `site/next.config.ts`, `site/tsconfig.json`
- Create: `site/lib/db.ts`
- Create: `site/lib/norma.ts`
- Create: `site/lib/norma.test.ts`
- Create: `site/app/layout.tsx`

**Interfaces:**
- Consumes: the Postgres schema from Task 8.
- Produces:
  - `pool: Pool` from `site/lib/db.ts`
  - `Norma` (`idNorma`, `tipo`, `numero`, `titulo`, `organismo`, `derogado`, `fechaPublicacion`, `lawDir`)
  - `Version` (`desde`, `hasta`, `commitSha`, `causaId`, `subject`)
  - `Article` (`slug`, `label`, `rawHeading`, `body`, `ord`)
  - `getNorma(tipo: string, numero: string): Promise<Norma | null>`
  - `getVersions(idNorma: number): Promise<Version[]>`
  - `getArticlesAsOf(idNorma: number, fecha: string): Promise<Article[]>`
  - `currentFecha(versions: Version[]): string` — the `desde` of the open-ended version
  - `isMultiVersion(versions: Version[]): boolean`
  - `canonicalPath(n: Norma, fecha: string, versions: Version[]): string`

- [ ] **Step 1: Scaffold**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
mkdir -p site/lib site/app
cd site && pnpm init
pnpm add next@16 react@19 react-dom@19 pg meilisearch
pnpm add -D typescript @types/node @types/react @types/pg vitest
```

Create `site/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',        // Railway runs the built server directly
  cacheComponents: true,       // enables `use cache`, cacheLife, cacheTag
}

export default config
```

- [ ] **Step 2: Write the failing test**

Create `site/lib/norma.test.ts`. These are the pure functions; the SQL is exercised end-to-end in Task 18.

```ts
import { describe, it, expect } from 'vitest'
import { canonicalPath, currentFecha, isMultiVersion, type Norma, type Version } from './norma'

const LEY: Norma = {
  idNorma: 20330, tipo: 'ley', numero: '20330', titulo: 'T',
  organismo: 'M', derogado: false, fechaPublicacion: '2009-02-25', lawDir: 'leyes/20330',
}
const v = (desde: string, hasta: string | null): Version =>
  ({ desde, hasta, commitSha: 'x', causaId: null, subject: '' })

describe('currentFecha', () => {
  it('returns the desde of the open-ended version', () => {
    expect(currentFecha([v('2000-01-01', '2009-12-31'), v('2010-01-01', null)])).toBe('2010-01-01')
  })
  it('falls back to the latest desde when none is open-ended', () => {
    expect(currentFecha([v('2000-01-01', '2001-01-01')])).toBe('2000-01-01')
  })
})

describe('isMultiVersion', () => {
  it('is false for the ~97% of normas with one version', () => {
    expect(isMultiVersion([v('2000-01-01', null)])).toBe(false)
  })
  it('is true when there is more than one', () => {
    expect(isMultiVersion([v('2000-01-01', '2009-12-31'), v('2010-01-01', null)])).toBe(true)
  })
})

describe('canonicalPath', () => {
  const single = [v('2009-02-25', null)]
  const multi = [v('2009-02-25', '2011-01-01'), v('2011-01-02', null)]

  it('points a single-version dated URL at the undated one', () => {
    // /ley/20330 and /ley/20330/2009-02-25 are byte-identical: duplicate content
    expect(canonicalPath(LEY, '2009-02-25', single)).toBe('/ley/20330')
  })

  it('lets a multi-version dated URL be self-canonical', () => {
    expect(canonicalPath(LEY, '2009-02-25', multi)).toBe('/ley/20330/2009-02-25')
  })

  it('points the current version of a multi-version norma at the undated URL', () => {
    expect(canonicalPath(LEY, '2011-01-02', multi)).toBe('/ley/20330')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site && pnpm vitest run lib/norma.test.ts`
Expected: FAIL — `Failed to resolve import "./norma"`.

- [ ] **Step 4: Write `site/lib/db.ts` and `site/lib/norma.ts`**

```ts
// site/lib/db.ts
import { Pool } from 'pg'

// One pool per process. Railway runs a single web replica (see spec §9.2), so
// Next's in-memory `use cache` is coherent and this pool is the only client.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})
```

```ts
// site/lib/norma.ts
import { pool } from './db'

export interface Norma {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  organismo: string
  derogado: boolean
  fechaPublicacion: string | null
  lawDir: string
}

export interface Version {
  desde: string
  hasta: string | null
  commitSha: string
  causaId: number | null
  subject: string
}

export interface Article {
  slug: string
  label: string
  rawHeading: string
  body: string
  ord: number
}

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

export async function getNorma(tipo: string, numero: string): Promise<Norma | null> {
  const { rows } = await pool.query(
    `SELECT id_norma, tipo, numero, titulo, organismo, derogado, fecha_publicacion, law_dir
       FROM norma WHERE tipo = $1 AND numero = $2 LIMIT 1`,
    [tipo, numero],
  )
  if (!rows[0]) return null
  const r = rows[0]
  return {
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    organismo: r.organismo, derogado: r.derogado,
    fechaPublicacion: iso(r.fecha_publicacion), lawDir: r.law_dir,
  }
}

export async function getVersions(idNorma: number): Promise<Version[]> {
  const { rows } = await pool.query(
    `SELECT desde, hasta, commit_sha, causa_id, subject
       FROM version WHERE id_norma = $1 ORDER BY desde`,
    [idNorma],
  )
  return rows.map(r => ({
    desde: iso(r.desde)!, hasta: iso(r.hasta),
    commitSha: r.commit_sha, causaId: r.causa_id, subject: r.subject ?? '',
  }))
}

/** One range-containment query against the GiST index on articulo_span. */
export async function getArticlesAsOf(idNorma: number, fecha: string): Promise<Article[]> {
  const { rows } = await pool.query(
    `SELECT a.slug, a.label, a.raw_heading, a.body, s.ord
       FROM articulo_span s
       JOIN articulo a ON a.id = s.articulo_id
      WHERE a.id_norma = $1 AND s.vigencia @> $2::date
      ORDER BY s.ord`,
    [idNorma, fecha],
  )
  return rows.map(r => ({
    slug: r.slug, label: r.label, rawHeading: r.raw_heading, body: r.body, ord: r.ord,
  }))
}

export function currentFecha(versions: Version[]): string {
  const open = versions.find(v => v.hasta === null)
  if (open) return open.desde
  return versions.map(v => v.desde).sort().at(-1)!
}

export function isMultiVersion(versions: Version[]): boolean {
  return versions.length > 1
}

/** SEO: ~350k single-version normas would otherwise serve byte-identical pages
 *  at /ley/X and /ley/X/<fecha>. Point the dated one at the undated one. */
export function canonicalPath(n: Norma, fecha: string, versions: Version[]): string {
  const base = `/${n.tipo}/${n.numero}`
  if (!isMultiVersion(versions)) return base
  return fecha === currentFecha(versions) ? base : `${base}/${fecha}`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site && pnpm vitest run lib/norma.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Write `site/app/layout.tsx`**

```tsx
export const metadata = {
  title: 'ley-chile',
  description: 'Cada versión de cada ley chilena, desde 1810.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add site/
git commit -m "feat(site): Next.js scaffold and Postgres data access

canonicalPath collapses ~350k duplicate dated URLs for single-version normas."
```

---

### Task 15: Norma pages, JSON-LD, sitemaps

**Files:**
- Create: `site/lib/jsonld.ts`
- Create: `site/lib/jsonld.test.ts`
- Create: `site/lib/page-data.ts` (the shared `'use cache'` loader)
- Create: `site/components/NormaView.tsx` (the shared view)
- Create: `site/app/[tipo]/[numero]/page.tsx`
- Create: `site/app/[tipo]/[numero]/[fecha]/page.tsx`
- Create: `site/app/sitemap.ts`
- Create: `site/app/robots.ts`

**Interfaces:**
- Consumes: `getNorma`, `getVersions`, `getArticlesAsOf`, `canonicalPath`, `currentFecha` from Task 14.
- Produces: `legislationJsonLd(n: Norma, fecha: string, versions: Version[], mods: number[]): object`, `RESERVED_TIPOS: Set<string>`.

- [ ] **Step 1: Write the failing test**

Create `site/lib/jsonld.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { legislationJsonLd, RESERVED_TIPOS } from './jsonld'
import type { Norma, Version } from './norma'

const LEY: Norma = {
  idNorma: 20330, tipo: 'ley', numero: '20330', titulo: 'LEY 20330',
  organismo: 'MINEDUC', derogado: false, fechaPublicacion: '2009-02-25', lawDir: 'leyes/20330',
}
const versions: Version[] = [
  { desde: '2009-02-25', hasta: '2011-01-01', commitSha: 'a', causaId: null, subject: '' },
  { desde: '2011-01-02', hasta: null, commitSha: 'b', causaId: 99, subject: '' },
]

describe('legislationJsonLd', () => {
  it('emits schema.org Legislation', () => {
    const ld = legislationJsonLd(LEY, '2011-01-02', versions, [99]) as Record<string, unknown>
    expect(ld['@type']).toBe('Legislation')
    expect(ld['legislationIdentifier']).toBe('20330')
    expect(ld['legislationDate']).toBe('2009-02-25')
  })

  it('marks a superseded version as not in force', () => {
    const ld = legislationJsonLd(LEY, '2009-02-25', versions, []) as Record<string, unknown>
    expect(ld['legislationLegalForce']).toBe('NotInForce')
  })

  it('marks the current version as in force', () => {
    const ld = legislationJsonLd(LEY, '2011-01-02', versions, []) as Record<string, unknown>
    expect(ld['legislationLegalForce']).toBe('InForce')
  })

  it('marks a derogated norma as not in force even at its current version', () => {
    const ld = legislationJsonLd({ ...LEY, derogado: true }, '2011-01-02', versions, [])
    expect((ld as Record<string, unknown>)['legislationLegalForce']).toBe('NotInForce')
  })

  it('lists modifying normas under legislationChanges', () => {
    const ld = legislationJsonLd(LEY, '2011-01-02', versions, [99, 100]) as Record<string, unknown>
    expect(ld['legislationChanges']).toHaveLength(2)
  })
})

describe('RESERVED_TIPOS', () => {
  it('protects app routes from the tipo namespace', () => {
    for (const r of ['buscar', 'api', 'sitemap', '_next']) {
      expect(RESERVED_TIPOS.has(r)).toBe(true)
    }
    expect(RESERVED_TIPOS.has('ley')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site && pnpm vitest run lib/jsonld.test.ts`
Expected: FAIL — `Failed to resolve import "./jsonld"`.

- [ ] **Step 3: Write `site/lib/jsonld.ts`**

```ts
import { currentFecha, type Norma, type Version } from './norma'

export const SITE = process.env.SITE_URL ?? 'https://leychile.dev'

/** `tipo` is the first path segment, so these names can never be a tipo. */
export const RESERVED_TIPOS = new Set(['buscar', 'api', 'sitemap', 'robots', '_next'])

export function legislationJsonLd(
  n: Norma, fecha: string, versions: Version[], modifiedBy: number[],
): object {
  const isCurrent = fecha === currentFecha(versions)
  return {
    '@context': 'https://schema.org',
    '@type': 'Legislation',
    name: n.titulo,
    legislationIdentifier: n.numero,
    legislationType: n.tipo,
    legislationDate: n.fechaPublicacion,
    legislationDateVersion: fecha,
    legislationLegalForce: isCurrent && !n.derogado ? 'InForce' : 'NotInForce',
    legislationJurisdiction: 'CL',
    legislationPassedBy: n.organismo,
    legislationChanges: modifiedBy.map(id => ({
      '@type': 'Legislation',
      legislationIdentifier: String(id),
    })),
    url: `${SITE}/${n.tipo}/${n.numero}${isCurrent ? '' : `/${fecha}`}`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site && pnpm vitest run lib/jsonld.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the two page routes**

`site/app/[tipo]/[numero]/[fecha]/page.tsx` — the general case. Cached forever and tagged; the loader invalidates by tag.

```tsx
import { notFound } from 'next/navigation'
import { cacheLife, cacheTag } from 'next/cache'
import { pool } from '@/lib/db'
import { legislationJsonLd, RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { canonicalPath, currentFecha, getArticlesAsOf, getNorma, getVersions } from '@/lib/norma'

interface Props { params: Promise<{ tipo: string; numero: string; fecha: string }> }

async function loadNorma(tipo: string, numero: string, fecha: string) {
  'use cache'
  cacheLife('max')                       // a 1997 law's text as of 1997 never changes
  const norma = await getNorma(tipo, numero)
  if (!norma) return null
  cacheTag(`norma:${norma.idNorma}`)     // loader POSTs /api/revalidate -> revalidateTag
  const [versions, articles, mods] = await Promise.all([
    getVersions(norma.idNorma),
    getArticlesAsOf(norma.idNorma, fecha),
    pool.query('SELECT causa_id FROM modificacion WHERE target_id = $1', [norma.idNorma]),
  ])
  return { norma, versions, articles, mods: mods.rows.map(r => r.causa_id as number) }
}

export async function generateMetadata({ params }: Props) {
  const { tipo, numero, fecha } = await params
  const data = await loadNorma(tipo, numero, fecha)
  if (!data) return {}
  return {
    title: `${data.norma.titulo} — texto al ${fecha}`,
    alternates: { canonical: `${SITE}${canonicalPath(data.norma, fecha, data.versions)}` },
  }
}

export default async function Page({ params }: Props) {
  const { tipo, numero, fecha } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()

  const data = await loadNorma(tipo, numero, fecha)
  if (!data || data.articles.length === 0) notFound()
  const { norma, versions, articles, mods } = data

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(legislationJsonLd(norma, fecha, versions, mods)),
        }}
      />
      <h1>{norma.titulo}</h1>
      <p>
        {norma.tipo.toUpperCase()} {norma.numero} · texto vigente al {fecha}
        {fecha !== currentFecha(versions) && ' (versión histórica)'}
      </p>
      {articles.map(a => (
        <section key={a.slug} id={a.slug}>
          {a.rawHeading && <h2>{a.rawHeading}</h2>}
          <div>{a.body}</div>
        </section>
      ))}
    </main>
  )
}
```

`site/app/[tipo]/[numero]/page.tsx` — the undated URL renders the current version.

It must **not** call the dated page component as a plain function. A route component is not a reusable view: doing so skips that route's `generateMetadata`, so `/ley/20330` would ship no canonical link — defeating the entire duplicate-content fix this route exists to serve. Both routes share a view component instead.

Extract `loadNorma` into `site/lib/page-data.ts` (exporting the same `'use cache'` function shown above) and the markup into `site/components/NormaView.tsx`:

```tsx
// site/components/NormaView.tsx
import { legislationJsonLd } from '@/lib/jsonld'
import { currentFecha, type Article, type Norma, type Version } from '@/lib/norma'

export function NormaView(
  { norma, fecha, versions, articles, mods }:
  { norma: Norma; fecha: string; versions: Version[]; articles: Article[]; mods: number[] },
) {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(legislationJsonLd(norma, fecha, versions, mods)),
        }}
      />
      <h1>{norma.titulo}</h1>
      <p>
        {norma.tipo.toUpperCase()} {norma.numero} · texto vigente al {fecha}
        {fecha !== currentFecha(versions) && ' (versión histórica)'}
      </p>
      {articles.map(a => (
        <section key={a.slug} id={a.slug}>
          {a.rawHeading && <h2>{a.rawHeading}</h2>}
          <div>{a.body}</div>
        </section>
      ))}
    </main>
  )
}
```

```tsx
// site/app/[tipo]/[numero]/page.tsx
import { notFound } from 'next/navigation'
import { NormaView } from '@/components/NormaView'
import { RESERVED_TIPOS, SITE } from '@/lib/jsonld'
import { canonicalPath, currentFecha, getNorma, getVersions } from '@/lib/norma'
import { loadNorma } from '@/lib/page-data'

interface Props { params: Promise<{ tipo: string; numero: string }> }

async function resolveCurrent(tipo: string, numero: string) {
  const norma = await getNorma(tipo, numero)
  if (!norma) return null
  const fecha = currentFecha(await getVersions(norma.idNorma))
  return loadNorma(tipo, numero, fecha)
}

export async function generateMetadata({ params }: Props) {
  const { tipo, numero } = await params
  const data = await resolveCurrent(tipo, numero)
  if (!data) return {}
  const fecha = currentFecha(data.versions)
  return {
    title: data.norma.titulo,
    alternates: { canonical: `${SITE}${canonicalPath(data.norma, fecha, data.versions)}` },
  }
}

export default async function Page({ params }: Props) {
  const { tipo, numero } = await params
  if (RESERVED_TIPOS.has(tipo)) notFound()
  const data = await resolveCurrent(tipo, numero)
  if (!data || data.articles.length === 0) notFound()
  return <NormaView {...data} fecha={currentFecha(data.versions)} />
}
```

The dated route (`[fecha]/page.tsx`) likewise imports `loadNorma` and `NormaView` rather than defining them inline; its `generateMetadata` is as shown above.

- [ ] **Step 6: Write `site/app/sitemap.ts` and `site/app/robots.ts`**

```ts
// site/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { pool } from '@/lib/db'
import { SITE } from '@/lib/jsonld'

const PER_SITEMAP = 50_000   // Google's hard limit

export async function generateSitemaps() {
  // Indexable URLs: one per norma, plus one per *non-current* version of a
  // multi-version norma. Single-version dated URLs are canonicalised away.
  const { rows } = await pool.query(`
    SELECT count(*)::int AS n FROM (
      SELECT id_norma FROM norma
      UNION ALL
      SELECT v.id_norma FROM version v
       WHERE v.hasta IS NOT NULL
         AND (SELECT count(*) FROM version w WHERE w.id_norma = v.id_norma) > 1
    ) t`)
  const total = rows[0].n as number
  return Array.from({ length: Math.ceil(total / PER_SITEMAP) }, (_, id) => ({ id }))
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id)
  const { rows } = await pool.query(
    `SELECT url, lastmod FROM (
       SELECT '/' || tipo || '/' || numero AS url, fecha_publicacion AS lastmod, id_norma, 0 AS k
         FROM norma
       UNION ALL
       SELECT '/' || n.tipo || '/' || n.numero || '/' || v.desde, v.desde, v.id_norma, 1
         FROM version v JOIN norma n ON n.id_norma = v.id_norma
        WHERE v.hasta IS NOT NULL
          AND (SELECT count(*) FROM version w WHERE w.id_norma = v.id_norma) > 1
     ) t ORDER BY id_norma, k, url OFFSET $1 LIMIT $2`,
    [id * PER_SITEMAP, PER_SITEMAP],
  )
  return rows.map(r => ({ url: `${SITE}${r.url}`, lastModified: r.lastmod ?? undefined }))
}
```

```ts
// site/app/robots.ts
import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/jsonld'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
```

- [ ] **Step 7: Typecheck and commit**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site && pnpm tsc --noEmit && pnpm vitest run`
Expected: no type errors; all tests PASS.

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add site/
git commit -m "feat(site): norma pages, Legislation JSON-LD, sharded sitemaps

Single-version normas canonicalise their dated URL to the undated one,
cutting ~350k duplicate-content pages from the index."
```

---

### Task 16: Tiered search and the analytics event log

**Files:**
- Create: `site/lib/search.ts`
- Create: `site/lib/search.test.ts`
- Create: `site/lib/analytics.ts`
- Create: `site/app/buscar/page.tsx`
- Create: `site/app/api/events/route.ts`

**Interfaces:**
- Consumes: `pool` from Task 14; the `articulos` Meilisearch index from Task 11.
- Produces:
  - `OPEN_ENDED_TS: number = 253402300799`
  - `asOfFilter(asOf: string): string` — the Meilisearch filter expression
  - `normalizeQuery(q: string): string`
  - `COLD_THRESHOLD: number = 5`
  - `needsColdPath(hotCount: number): boolean`
  - `searchHot(q: string, asOf: string): Promise<Hit[]>`
  - `searchCold(q: string, asOf: string): Promise<Hit[]>`
  - `Hit` (`idNorma`, `tipo`, `numero`, `titulo`, `slug`, `snippet`, `tier: 'hot' | 'cold'`)
  - `recordEvent(e: Event): void` and `flush(): Promise<void>` from `analytics.ts`

- [ ] **Step 1: Write the failing test**

Create `site/lib/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { asOfFilter, COLD_THRESHOLD, needsColdPath, normalizeQuery, OPEN_ENDED_TS } from './search'

describe('asOfFilter', () => {
  it('is a range-containment predicate on the validity window', () => {
    // 2000-01-01T00:00:00Z = 946684800
    expect(asOfFilter('2000-01-01')).toBe('desde_ts <= 946684800 AND hasta_ts >= 946684800')
  })
  it('matches open-ended versions via the sentinel', () => {
    expect(OPEN_ENDED_TS).toBe(253402300799)
  })
  it('rejects a malformed date rather than building a broken filter', () => {
    expect(() => asOfFilter('ayer')).toThrow(/YYYY-MM-DD/)
  })
})

describe('normalizeQuery', () => {
  it('lowercases and folds accents so query_norm aggregates cleanly', () => {
    expect(normalizeQuery('  Arrendamiento CIVIL  ')).toBe('arrendamiento civil')
    expect(normalizeQuery('Código')).toBe('codigo')
  })
})

describe('needsColdPath', () => {
  it('falls through to Postgres when the hot tier is thin', () => {
    expect(needsColdPath(0)).toBe(true)
    expect(needsColdPath(COLD_THRESHOLD - 1)).toBe(true)
  })
  it('stays on the hot path when there are enough results', () => {
    expect(needsColdPath(COLD_THRESHOLD)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site && pnpm vitest run lib/search.test.ts`
Expected: FAIL — `Failed to resolve import "./search"`.

- [ ] **Step 3: Write `site/lib/search.ts`**

```ts
import { MeiliSearch } from 'meilisearch'
import { pool } from './db'

export const OPEN_ENDED_TS = 253402300799
export const COLD_THRESHOLD = 5

const meili = new MeiliSearch({
  host: process.env.MEILI_URL!,
  apiKey: process.env.MEILI_SEARCH_KEY,
})

export interface Hit {
  idNorma: number
  tipo: string
  numero: string
  titulo: string
  slug: string
  snippet: string
  tier: 'hot' | 'cold'
}

export function asOfFilter(asOf: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be YYYY-MM-DD, got ${asOf}`)
  const ts = Math.floor(Date.parse(`${asOf}T00:00:00Z`) / 1000)
  return `desde_ts <= ${ts} AND hasta_ts >= ${ts}`
}

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

export function needsColdPath(hotCount: number): boolean {
  return hotCount < COLD_THRESHOLD
}

/** Hot path: the ~8% of the corpus anyone searches. Typo-tolerant, instant.
 *  `distinct` is a per-search parameter, never an index setting — otherwise
 *  "all matching artículos inside this law" would silently collapse to one. */
export async function searchHot(q: string, asOf: string): Promise<Hit[]> {
  const res = await meili.index('articulos').search(q, {
    filter: asOfFilter(asOf),
    distinct: 'id_norma',
    limit: 20,
    attributesToCrop: ['body'],
    cropLength: 40,
  })
  return res.hits.map(h => ({
    idNorma: h.id_norma as number,
    tipo: h.tipo as string,
    numero: h.numero as string,
    titulo: h.titulo as string,
    slug: h.slug as string,
    snippet: (h._formatted?.body as string) ?? '',
    tier: 'hot' as const,
  }))
}

/** Cold path: exhaustive Postgres FTS over the tier Meilisearch does not hold.
 *  The `index_tier = 'meta'` predicate keeps the two result sets disjoint.
 *  This is also what stops the promotion policy from being self-fulfilling. */
export async function searchCold(q: string, asOf: string): Promise<Hit[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (n.id_norma)
            n.id_norma, n.tipo, n.numero, n.titulo, a.slug,
            ts_headline('spanish', a.body, websearch_to_tsquery('spanish', $1),
                        'MaxWords=40, MinWords=15') AS snippet,
            ts_rank_cd(a.tsv, websearch_to_tsquery('spanish', $1)) AS rank
       FROM articulo a
       JOIN norma n ON n.id_norma = a.id_norma
       JOIN articulo_span s ON s.articulo_id = a.id
      WHERE n.index_tier = 'meta'
        AND a.tsv @@ websearch_to_tsquery('spanish', $1)
        AND s.vigencia @> $2::date
      ORDER BY n.id_norma, rank DESC
      LIMIT 20`,
    [q, asOf],
  )
  return rows.map(r => ({
    idNorma: r.id_norma, tipo: r.tipo, numero: r.numero, titulo: r.titulo,
    slug: r.slug, snippet: r.snippet, tier: 'cold' as const,
  }))
}
```

- [ ] **Step 4: Write `site/lib/analytics.ts`**

```ts
import { pool } from './db'

/** No user dimension is ever collected: no IP, cookie, session id, fingerprint.
 *  For a site where someone may search "ley de aborto", never collecting the
 *  means to link queries to people beats any retention policy. */
export interface Event {
  kind: 'search' | 'result_click' | 'cold_surface'
  queryNorm?: string
  idNorma?: number
  tier?: 'hot' | 'cold'
  resultCount?: number
  clickedRank?: number
}

const FLUSH_MS = 10_000
let buffer: Event[] = []
let timer: NodeJS.Timeout | null = null

/** Buffered: a search click costs zero round-trips on the hot path. A redeploy
 *  loses ≤10s of events, which against a 90-day promotion window is noise. */
export function recordEvent(e: Event): void {
  buffer.push(e)
  timer ??= setInterval(() => void flush(), FLUSH_MS).unref?.() ?? null
}

export async function flush(): Promise<void> {
  if (buffer.length === 0) return
  const batch = buffer
  buffer = []
  const values = batch.map((_, i) => {
    const b = i * 6
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`
  }).join(',')
  const params = batch.flatMap(e => [
    e.kind, e.queryNorm ?? null, e.idNorma ?? null,
    e.tier ?? null, e.resultCount ?? null, e.clickedRank ?? null,
  ])
  try {
    await pool.query(
      `INSERT INTO analytics.event (kind, query_norm, id_norma, tier, result_count, clicked_rank)
       VALUES ${values}`, params,
    )
  } catch (err) {
    // Analytics must never take the site down. Drop the batch and move on.
    console.error('[analytics] flush failed, dropping batch', err)
  }
}
```

- [ ] **Step 5: Write the search page and the events route**

```tsx
// site/app/buscar/page.tsx
import Link from 'next/link'
import { recordEvent } from '@/lib/analytics'
import { needsColdPath, normalizeQuery, searchCold, searchHot, type Hit } from '@/lib/search'

export const dynamic = 'force-dynamic'   // queries vary; never cache

function Results({ hits }: { hits: Hit[] }) {
  return (
    <ul>
      {hits.map(h => (
        <li key={`${h.idNorma}:${h.slug}`}>
          <Link href={`/${h.tipo}/${h.numero}#${h.slug}`}>{h.titulo}</Link>
          <p dangerouslySetInnerHTML={{ __html: h.snippet }} />
        </li>
      ))}
    </ul>
  )
}

export default async function Buscar({
  searchParams,
}: { searchParams: Promise<{ q?: string; asOf?: string }> }) {
  const { q = '', asOf = new Date().toISOString().slice(0, 10) } = await searchParams
  if (!q) return <main><h1>Buscar</h1></main>

  const queryNorm = normalizeQuery(q)
  const hot = await searchHot(q, asOf)

  let cold: Hit[] = []
  if (needsColdPath(hot.length)) {
    cold = await searchCold(q, asOf)
    // Strong signal: Meilisearch could not find what Postgres could.
    for (const h of cold) recordEvent({ kind: 'cold_surface', idNorma: h.idNorma, tier: 'cold' })
  }
  recordEvent({ kind: 'search', queryNorm, resultCount: hot.length + cold.length, tier: 'hot' })

  return (
    <main>
      <h1>Resultados para “{q}”</h1>
      <p>Texto vigente al {asOf}.</p>
      <Results hits={hot} />
      {cold.length > 0 && (
        <>
          {/* Two rankers, two behaviours. Label the seam rather than merging
              the lists, which would imply a coherence that does not exist. */}
          <h2>Otros resultados en el resto del corpus</h2>
          <Results hits={cold} />
        </>
      )}
    </main>
  )
}
```

```ts
// site/app/api/events/route.ts
import { recordEvent } from '@/lib/analytics'

export async function POST(req: Request) {
  const body = await req.json()
  if (body.kind !== 'result_click' || typeof body.idNorma !== 'number') {
    return new Response('bad request', { status: 400 })
  }
  recordEvent({ kind: 'result_click', idNorma: body.idNorma, clickedRank: body.clickedRank })
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site && pnpm vitest run && pnpm tsc --noEmit`
Expected: PASS, 8 search tests; no type errors.

- [ ] **Step 7: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add site/
git commit -m "feat(site): tiered search and the analytics event log

Meilisearch over the hot tier; Postgres FTS over everything else. Cold-path
surfacing is the promotion signal, and the reason the policy is not
self-fulfilling. No user dimension is collected."
```

---

### Task 17: Railway deployment

**Files:**
- Create: `site/app/api/revalidate/route.ts`
- Create: `site/Dockerfile`
- Create: `Dockerfile.loader`
- Create: `railway.toml`
- Modify: `.github/workflows/pipeline.yml` (append the export + release step)

- [ ] **Step 1: Write the revalidate route**

```ts
// site/app/api/revalidate/route.ts
import { revalidateTag } from 'next/cache'

export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.REVALIDATE_TOKEN}`) {
    return new Response('unauthorized', { status: 401 })
  }
  const { idNormas } = await req.json()
  if (!Array.isArray(idNormas)) return new Response('bad request', { status: 400 })

  // stale-while-revalidate: this is not read-your-writes, so revalidateTag,
  // not updateTag.
  for (const id of idNormas) revalidateTag(`norma:${id}`)
  return Response.json({ revalidated: idNormas.length })
}
```

- [ ] **Step 2: Write `site/Dockerfile`**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write `Dockerfile.loader`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements-loader.txt .
RUN pip install --no-cache-dir -r requirements-loader.txt
COPY scripts/ ./scripts/
COPY sql/ ./sql/
ENV PYTHONPATH=/app/scripts
CMD ["python", "-m", "loader.main", "--artifacts", "/tmp/artifacts"]
```

- [ ] **Step 4: Write the per-service Railway configs**

Railway's config-as-code is **per-service**, not project-wide: each service reads its own `railway.toml` (or `railway.json`) from its root directory, with top-level `build`, `deploy` and `environments` keys. There is no `[[services]]` array. Postgres and Meilisearch are provisioned from Railway's dashboard as image-backed services (no repo, so no config file); set their root directories and private networking there.

Create `site/railway.toml`:

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
# `use cache` is backed by process memory on Railway, not a distributed cache,
# so replicas would not share it. Single replica; see spec §9.2.
numReplicas = 1
restartPolicyType = "on_failure"
# Serverless/app-sleeping is deliberately NOT enabled. Railway's docs note the
# first request to a slept service "may return a 502 Bad Gateway", and a 502
# served to Googlebot on a cold page is the outcome this port exists to avoid.
```

Create `railway.loader.toml` (set the loader service's config path to this file in the Railway dashboard):

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile.loader"

[deploy]
cronSchedule = "0 */6 * * *"
restartPolicyType = "never"   # a cron job that exits must not be restarted
```

- [ ] **Step 5: Append the export step to the pipeline workflow**

Add to `.github/workflows/pipeline.yml` after the `build_history` step:

```yaml
      - name: Export snapshot artifacts
        run: |
          python scripts/export_snapshot.py \
            --historial ./historial \
            --graph ./graph.json \
            --out ./artifacts \
            --snapshot-version "${{ github.sha }}" \
            --watermark "$(python scripts/compute_watermark.py --graph-path ./graph.json \
                            --cache-dir ./cache --historial-dir ./historial --print-watermark)" \
            --delta-seq "${{ github.run_number }}"

      - name: Publish snapshot to a GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TAG="snapshot-${{ github.run_number }}"
          gh release create "$TAG" ./artifacts/* \
            --title "Snapshot ${{ github.run_number }}" --notes "Automated snapshot export"
```

- [ ] **Step 6: Verify the web image builds and serves**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr/site
docker build -t leychile-web .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:pg@host.docker.internal:5433/postgres \
  -e MEILI_URL=http://host.docker.internal:7700 \
  -e SITE_URL=http://localhost:3000 leychile-web &
sleep 5
curl -sI http://localhost:3000/ley/20330 | head -1
```

Expected: `HTTP/1.1 200 OK` (after Task 18 has loaded data; before that, `404`, which also proves routing works).

- [ ] **Step 7: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add site/app/api/revalidate/ site/Dockerfile Dockerfile.loader railway.toml .github/
git commit -m "feat(deploy): Railway services and snapshot publication

App-sleeping is off for web: a 502 to Googlebot on a cold page is the
outcome this port exists to avoid."
```

---

### Task 18: Cutover

**Files:**
- Delete: `web/src/lib/segment.ts`, `web/src/lib/segment.golden.test.ts`
- Modify: `web/src/lib/diff.ts` (drop the re-export), `tests/test_segment_golden.py` (delete)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full validation gate against real data**

This is the binary acceptance criterion. Do not proceed on anything less than a clean run.

```bash
git clone --single-branch -b historial https://github.com/pisanvs/ley-chile /tmp/historial-real
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
python scripts/export_snapshot.py --historial /tmp/historial-real --graph /tmp/historial-real/graph.json \
  --out /tmp/artifacts --snapshot-version full-1 --watermark 2026-05-29
DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres \
  MEILI_URL=http://localhost:7700 MEILI_MASTER_KEY=dev \
  python -m loader.main --artifacts /tmp/artifacts
DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m loader.verify
```

Expected: `GATE PASSED: every version reconstructs.`

If it prints `GATE FAILED`, **stop**. Every mismatch is a norma whose text the database would serve wrong. Investigate before deploying; do not add exceptions.

- [ ] **Step 2: Verify the site serves real pages end to end**

```bash
curl -s http://localhost:3000/ley/20330 | grep -o 'Artículo 1º'
curl -s http://localhost:3000/ley/20330 | grep -o '"@type":"Legislation"'
curl -s 'http://localhost:3000/buscar?q=arrendamiento' | head -c 400
curl -sI http://localhost:3000/buscar | head -1
```

Expected: the artículo heading renders, JSON-LD is present, search returns results, `/buscar` returns 200 (proving `buscar` is reserved against the `tipo` namespace, not treated as a norma).

- [ ] **Step 3: Delete the TypeScript segmentation**

Its only consumer was the golden test, and Python is now the single source of truth (spec §6.2). The frontend receives pre-segmented articles from the database.

**This deletes tests, which is normally a red flag — brief the final reviewer explicitly.** The justification: the golden test's job was to prove the *port* correct, and once the §8.1 validation gate passes on real data that job is done. `web/src/lib/segment.ts` then has no runtime consumer, so its test guards dead code. `tests/test_segment.py` and `tests/fixtures/segment_corpus.json` remain as the live regression suite for the surviving implementation. Coverage of segmentation behaviour does not decrease; what is removed is the duplicate implementation and the cross-language check that existed solely to retire it.

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git rm web/src/lib/segment.ts web/src/lib/segment.golden.test.ts web/src/lib/segment.test.ts
git rm tests/test_segment_golden.py
```

Then remove from `web/src/lib/diff.ts` the two re-export lines added in Task 1:

```ts
export type { Segment } from './segment'
export { normalizeLabel, labelToSlug, segment, canonicalText } from './segment'
```

`diff.ts` keeps `align`, `wordDiff`, `joinDiffText` and imports `Segment` as a type from the API response shape instead.

- [ ] **Step 4: Run the full suite one last time**

Run: `cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr && DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres python -m pytest -q && cd site && pnpm vitest run && pnpm tsc --noEmit`
Expected: all PASS. `tests/fixtures/segment_expected.json` stays committed as a regression fixture for `tests/test_segment.py`.

- [ ] **Step 5: Point GitHub Pages at Railway**

Once DNS is live, replace the `pages` branch content with a redirect stub. Keep the branch: rollback is "revert the stub."

```html
<!-- pages/index.html -->
<!doctype html>
<meta charset="utf-8">
<title>ley-chile</title>
<link rel="canonical" href="https://leychile.dev/">
<meta http-equiv="refresh" content="0; url=https://leychile.dev/">
<script>location.replace('https://leychile.dev' + location.pathname.replace(/^\/ley-chile/, ''))</script>
```

The path rewrite matters: `pisanvs.github.io/ley-chile/ley/20330` must land on `leychile.dev/ley/20330`, not `leychile.dev/ley-chile/ley/20330`.

- [ ] **Step 6: Update `CLAUDE.md`**

Replace the `## Frontend` section: the SPA in `web/` is superseded by `site/` (Next.js on Railway); document the loader commands, `DATABASE_URL`/`MEILI_URL`, the `-m "not integration"` default, and that `git commit` needs the sandbox disabled for GPG.

- [ ] **Step 7: Commit**

```bash
cd /home/pisanvs/code/ley-chile/.worktrees/railway-ssr
git add -A
git commit -m "chore: cutover to Railway

Validation gate passed: all 408,182 versions reconstruct. TypeScript
segmentation deleted — Python is the single source of truth."
```

---

## Self-Review

**Spec coverage.** §3 source of truth → Tasks 7, 9. §4 topology → Tasks 13, 17. §5 ingestion → Tasks 6, 7, 9, 13. §6 data model → Tasks 5, 8. §6.2 segmentation moves to Python → Tasks 2, 18. §6.3 ordinal bug → Task 1. §7 tiered search → Tasks 11, 12, 16. §7.5 analytics → Tasks 8, 16. §8.1 gate → Tasks 10, 18. §8.2 tests → Task 3. §8.3 fallback → Tasks 2, 4. §9 web tier → Tasks 14–16. §10 cost → Tasks 11 (measurement 3), 17. §11 rollout → Tasks 4, 18.

**Two gaps I found and closed while reviewing.** `replace_norma` was missing from the first draft of Task 9: without it, a re-exported norma that closes a previously open-ended version range trips the `EXCLUDE` constraint, so every delta after the first would fail. And `load_normas` originally upserted `index_tier`, which would have silently reset the retier state on every load — now excluded, with a test pinning it.

**Deviation from the spec, logged deliberately.** `articulo_span`'s primary key is `(articulo_id, desde, ord)`, not `(articulo_id, desde)`. One body can legitimately appear at two positions in one version, which the two-column key would reject.
