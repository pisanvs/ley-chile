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
  const prevByLabel = new Map<string, Segment>()
  prev.forEach(s => prevByLabel.set(s.label, s))

  const result: Aligned[] = []
  const usedPrev = new Set<string>()

  for (const c of curr) {
    const p = prevByLabel.get(c.label)
    if (!p) {
      result.push({ prev: null, curr: c, status: 'added' })
    } else {
      usedPrev.add(c.label)
      const status: Aligned['status'] = p.body === c.body ? 'unchanged' : 'modified'
      result.push({ prev: p, curr: c, status })
    }
  }
  // Removed segments (in prev but not in curr) — append at the end so the
  // reader sees what disappeared, with order preserved.
  for (const p of prev) {
    if (!usedPrev.has(p.label)) {
      result.push({ prev: p, curr: null, status: 'removed' })
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
