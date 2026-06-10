import { fetchRawText } from './rawtext'
import { segment, type Segment } from './diff'
import type { Commit } from './commits'

/** For each article slug present at some commit, the most recent commit where
 *  that segment was added or modified. */
export interface BlameEntry {
  sha: string
  date: string
  causaId: number
  status: 'introduced' | 'modified'
}

export type BlameMap = Record<string, BlameEntry>

/**
 * Build the article-level blame map by walking the commits list in order and
 * comparing each version's segments against the previous version's. Each slug
 * gets attributed to the most recent commit where its body changed (or where
 * it first appeared).
 *
 * Fetches all texto.md blobs for the law via the supplied resolver — TanStack
 * Query upstream caches them across versions, so the second blame for a
 * different version of the same law reuses everything.
 */
export async function computeBlame(opts: {
  commits: Commit[]
  relDir: string
}): Promise<BlameMap> {
  const { commits, relDir } = opts
  if (commits.length === 0) return {}

  // Fetch texts in parallel.
  const texts = await Promise.all(
    commits.map(c => fetchRawText({ sha: c.sha, relDir }))
  )

  const blame: BlameMap = {}
  let prevSegments: Segment[] = []
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]
    const segs = segment(texts[i])
    const prevByLabel = new Map<string, Segment>()
    prevSegments.forEach(s => prevByLabel.set(s.label, s))

    for (const s of segs) {
      const before = prevByLabel.get(s.label)
      if (!before) {
        // First time we see this slug — introduced in this commit.
        blame[s.slug] = {
          sha: c.sha,
          date: c.date,
          causaId: c.causaId,
          status: i === 0 ? 'introduced' : 'introduced',
        }
      } else if (before.body !== s.body) {
        blame[s.slug] = {
          sha: c.sha,
          date: c.date,
          causaId: c.causaId,
          status: 'modified',
        }
      }
      // unchanged → keep prior attribution
    }

    prevSegments = segs
  }
  return blame
}

/** Per-slug chronology: every commit that touched a given article. Sorted
 *  oldest → newest. */
export interface SlugEvent {
  sha: string
  date: string
  causaId: number
  kind: 'introduced' | 'modified' | 'removed'
}

export type ChronologyMap = Record<string, SlugEvent[]>

export interface Chronology {
  events: ChronologyMap
  /** Per-slug human heading as it last appeared in the corpus. Drives the
   *  Cronología dropdown — `Artículo 5° bis` instead of `art-5-bis`. */
  headings: Record<string, string>
}

export async function computeChronology(opts: {
  commits: Commit[]
  relDir: string
}): Promise<Chronology> {
  const { commits, relDir } = opts
  if (commits.length === 0) return { events: {}, headings: {} }
  const texts = await Promise.all(
    commits.map(c => fetchRawText({ sha: c.sha, relDir }))
  )
  const events: ChronologyMap = {}
  const headings: Record<string, string> = {}
  let prevSegments: Segment[] = []
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]
    const segs = segment(texts[i])
    const prevByLabel = new Map<string, Segment>()
    prevSegments.forEach(s => prevByLabel.set(s.label, s))
    const currByLabel = new Map<string, Segment>()
    segs.forEach(s => currByLabel.set(s.label, s))

    for (const s of segs) {
      // Last-seen wins so the heading reflects current corpus state.
      if (s.rawHeading) headings[s.slug] = s.rawHeading
      const before = prevByLabel.get(s.label)
      if (!before) {
        (events[s.slug] ??= []).push({
          sha: c.sha, date: c.date, causaId: c.causaId, kind: 'introduced',
        })
      } else if (before.body !== s.body) {
        (events[s.slug] ??= []).push({
          sha: c.sha, date: c.date, causaId: c.causaId, kind: 'modified',
        })
      }
    }
    // Removed (in prev but not in curr)
    for (const p of prevSegments) {
      if (!currByLabel.has(p.label)) {
        (events[p.slug] ??= []).push({
          sha: c.sha, date: c.date, causaId: c.causaId, kind: 'removed',
        })
      }
    }

    prevSegments = segs
  }
  return { events, headings }
}
