import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'
import type { Segment } from './segment'

export type { Segment } from './segment'
export { normalizeLabel, labelToSlug, segment, canonicalText } from './segment'

/**
 * Align two segment lists by label. Returns triples (prev?, curr?, status).
 * Order follows the *current* version (so additions land in place); deletions
 * appear at the position of their nearest surviving neighbor.
 */
export interface Aligned {
  prev: Segment | null
  curr: Segment | null
  status: 'unchanged' | 'modified' | 'added' | 'removed'
}

export function align(prev: Segment[], curr: Segment[]): Aligned[] {
  // Match the k-th occurrence of a label in `prev` to the k-th in `curr`.
  //
  // A plain Map<label, Segment> collapses duplicate labels (last one wins),
  // which mis-pairs every repeated article number. Chilean laws routinely
  // renumber from 1 in their transitory section, so a body with permanent
  // *and* transitory "Artículo 2" would compare the permanent one against the
  // transitory one — flagging a dozen untouched articles as fully rewritten.
  // Observed on ley 19.300: 12 "modified" articles where only 2 truly changed,
  // with permanent text diffed against unrelated transitory text.
  //
  // Queue of unconsumed prev *indices* per label, in document order. Indices
  // (not the segments) so the removed-segment pass below can restore original
  // order. For non-duplicate labels this is identical to the old behavior.
  const prevIdxByLabel = new Map<string, number[]>()
  prev.forEach((s, i) => {
    const q = prevIdxByLabel.get(s.label)
    if (q) q.push(i)
    else prevIdxByLabel.set(s.label, [i])
  })

  const result: Aligned[] = []
  const consumed = new Set<number>()

  for (const c of curr) {
    const q = prevIdxByLabel.get(c.label)
    const idx = q && q.length > 0 ? q.shift()! : undefined
    if (idx === undefined) {
      result.push({ prev: null, curr: c, status: 'added' })
    } else {
      consumed.add(idx)
      const p = prev[idx]
      const status: Aligned['status'] = p.body === c.body ? 'unchanged' : 'modified'
      result.push({ prev: p, curr: c, status })
    }
  }
  // Removed segments (in prev but not consumed by any curr) — append at the end
  // so the reader sees what disappeared, with original order preserved.
  for (let i = 0; i < prev.length; i++) {
    if (!consumed.has(i)) {
      result.push({ prev: prev[i], curr: null, status: 'removed' })
    }
  }
  return result
}

/** A semantic chunk in a rendered diff segment. */
export type DiffOp =
  | { op: 'equal'; text: string }
  | { op: 'insert'; text: string }
  | { op: 'delete'; text: string }

/** Word-level diff between two strings, using diff-match-patch's word-mode. */
export function wordDiff(prev: string, curr: string): DiffOp[] {
  const dmp = new DiffMatchPatch()
  // Convert to word-level diff: tokenize via line-mode trick where each "line" is one word.
  const a = wordsAsLines(prev)
  const b = wordsAsLines(curr)
  const tokens = dmp.diff_linesToChars_(a.text, b.text)
  const raw = dmp.diff_main(tokens.chars1, tokens.chars2, false)
  dmp.diff_charsToLines_(raw, tokens.lineArray)
  dmp.diff_cleanupSemantic(raw)
  return raw.map(([op, text]) => ({
    op: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  })) as DiffOp[]
}

function wordsAsLines(text: string): { text: string } {
  // Split by whitespace boundaries but keep separators so reassembly is faithful.
  // diff-match-patch's char-based line trick needs newline separators.
  const tokens = text.match(/(\s+|[^\s]+)/g) ?? []
  return { text: tokens.join('\n') }
}

/** Reassemble word-tokens back into rendered text by joining without adding spaces. */
export function joinDiffText(s: string): string {
  return s.replace(/\n/g, '')
}
