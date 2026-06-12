// web/src/lib/effectsOrder.ts
import { type Segment } from '@/lib/diff'
import { type ModificationRow } from '@/lib/modifies'

export interface OrderedMod extends ModificationRow {
  /** Slug of the modifier-law article that first mentions this affected law. */
  artSlug: string | null
}

/**
 * Sort `mods` by the position of their first mention in the modifier law's
 * segmented text. Unmentioned laws fall to the end in their original order.
 *
 * "Mention" is a case-insensitive substring match of the law's `numero`
 * (e.g. "21.561") inside the segment body or heading. If `numero` isn't
 * distinctive enough we also try the first word of `titulo` when it's >= 6
 * chars (e.g. "Código").
 */
export function orderByMention(
  mods: ModificationRow[],
  segments: Segment[],
): OrderedMod[] {
  const positioned = mods.map((mod, originalIdx) => {
    const slug = findMentionSlug(mod, segments)
    const segIdx = slug !== null
      ? segments.findIndex(s => s.slug === slug)
      : Number.POSITIVE_INFINITY + originalIdx
    return { mod, slug, segIdx, originalIdx }
  })

  positioned.sort((a, b) =>
    a.segIdx !== b.segIdx
      ? a.segIdx - b.segIdx
      : a.originalIdx - b.originalIdx,
  )

  return positioned.map(p => ({ ...p.mod, artSlug: p.slug }))
}

function findMentionSlug(mod: ModificationRow, segments: Segment[]): string | null {
  const needles = buildNeedles(mod)

  for (const seg of segments) {
    const haystack = (seg.rawHeading + ' ' + seg.body).toLowerCase()
    if (needles.some(n => haystack.includes(n))) return seg.slug
  }
  return null
}

function buildNeedles(mod: ModificationRow): string[] {
  const out: string[] = []

  // "21.561" → also try without dots ("21561")
  const num = mod.numero.trim().toLowerCase()
  if (num) {
    out.push(num)
    out.push(num.replace(/\./g, ''))
  }

  // First substantial word of the title (skip short words like "de", "la")
  const firstWord = mod.titulo.split(/\s+/).find(w => w.length >= 6)
  if (firstWord) out.push(firstWord.toLowerCase())

  return out
}
