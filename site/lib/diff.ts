import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'
import type { Article } from './norma'

/**
 * Align two article lists by label. Returns triples (prev?, curr?, status).
 * Order follows the *current* version so additions land in place; removed
 * articles are appended at the end. Pure — runs server-side in an RSC.
 */
export interface Aligned {
  prev: Article | null
  curr: Article | null
  status: 'unchanged' | 'modified' | 'added' | 'removed'
}

export function alignArticles(prev: Article[], curr: Article[]): Aligned[] {
  const prevByLabel = new Map<string, Article>()
  for (const s of prev) prevByLabel.set(s.label, s)

  const out: Aligned[] = []
  const usedPrev = new Set<string>()

  for (const c of curr) {
    const p = prevByLabel.get(c.label)
    if (!p) {
      out.push({ prev: null, curr: c, status: 'added' })
    } else {
      usedPrev.add(c.label)
      out.push({ prev: p, curr: c, status: p.body === c.body ? 'unchanged' : 'modified' })
    }
  }
  for (const p of prev) {
    if (!usedPrev.has(p.label)) out.push({ prev: p, curr: null, status: 'removed' })
  }
  return out
}

export type DiffOp =
  | { op: 'equal'; text: string }
  | { op: 'insert'; text: string }
  | { op: 'delete'; text: string }

/** Word-level diff between two strings using diff-match-patch's line-mode trick. */
export function wordDiff(prev: string, curr: string): DiffOp[] {
  const dmp = new DiffMatchPatch()
  const a = wordsAsLines(prev)
  const b = wordsAsLines(curr)
  const tokens = dmp.diff_linesToChars_(a, b)
  const raw = dmp.diff_main(tokens.chars1, tokens.chars2, false)
  dmp.diff_charsToLines_(raw, tokens.lineArray)
  dmp.diff_cleanupSemantic(raw)
  return raw.map(([op, text]) => ({
    op: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  })) as DiffOp[]
}

function wordsAsLines(text: string): string {
  const tokens = text.match(/(\s+|[^\s]+)/g) ?? []
  return tokens.join('\n')
}

export function joinDiffText(s: string): string {
  return s.replace(/\n/g, '')
}

/** Diff counts for the summary chip row. */
export function diffCounts(aligned: Aligned[]): { modified: number; added: number; removed: number } {
  return {
    modified: aligned.filter((a) => a.status === 'modified').length,
    added: aligned.filter((a) => a.status === 'added').length,
    removed: aligned.filter((a) => a.status === 'removed').length,
  }
}
