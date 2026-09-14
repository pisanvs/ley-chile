/**
 * build-corpus-index.ts — freeze what the graph knows into something the app can carry.
 *
 * The served corpus cannot currently tell whether its own answer is complete.
 * A norma with half its version history missing responds exactly like one with
 * all of it — same shape, same confidence, no signal (see completeness.ts: 54%
 * of known version records are never served). The read model has no idea what
 * it is missing, because the only thing that knows is `graph_shards/`, and that
 * lives at the repo root while the Docker build context is `site/`.
 *
 * So the knowledge is compiled in: this writes `lib/corpus-index.json`, which is
 * committed and ships inside the image. Generated, reviewable, and diffable —
 * a change in what the corpus expects shows up in a pull request rather than
 * appearing at runtime.
 *
 * Only normas worth carrying are included: those with more than one version
 * (the only ones whose history can be short) and those LeyChile marks as having
 * deferred entry into force. That is ~31k of 357k entries.
 *
 *   cd site && pnpm exec tsx scripts/build-corpus-index.ts
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SHARDS = join(import.meta.dirname, '..', '..', 'graph_shards')
const OUT = join(import.meta.dirname, '..', 'lib', 'corpus-index.json')

const MAX_REAL_YEAR = 2100

/** LeyChile's own labels for versions whose entry or repeal is deferred. */
const DEFERRED_BY_DATE = new Set([
  'Con Vigencia Diferida por Fecha',
  'Con Derogación Diferida por fecha',
])
const DEFERRED_BY_EVENT = new Set([
  'Con Vigencia Diferida por Evento',
  'Con Derogación Diferida por evento',
  'Con Vigencia Diferida por Evento y Derogación Diferida por evento',
])

function isReal(d: unknown): d is string {
  return typeof d === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(d)
    && Number(d.slice(0, 4)) <= MAX_REAL_YEAR
}

function main(): number {
  const versions: Record<string, number> = {}
  const deferred: Record<string, string[]> = {}
  let nodes = 0

  for (const file of readdirSync(SHARDS).filter((f) => f.endsWith('.json'))) {
    const shard = JSON.parse(readFileSync(join(SHARDS, file), 'utf8')) as Record<string, any>
    for (const [id, node] of Object.entries(shard)) {
      if (!node || typeof node !== 'object') continue
      nodes++
      const vigencias: any[] = node.vigencias ?? []

      const count = new Set(vigencias.map((v) => v?.desde).filter(isReal)).size
      if (count > 1) versions[id] = count

      const marks: string[] = []
      for (const v of vigencias) {
        const t = v?.tipo_version_s ?? ''
        // Read the type BEFORE discarding the sentinel date: for the "por
        // Evento" versions the sentinel IS the marker, so a pipeline that
        // filters sentinels first destroys the very signal it is filtering.
        if (DEFERRED_BY_DATE.has(t)) marks.push(`fecha:${v?.desde ?? ''}`)
        else if (DEFERRED_BY_EVENT.has(t)) marks.push('evento')
      }
      if (marks.length) deferred[id] = [...new Set(marks)]
    }
  }

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    nodes,
    versions,
    deferred,
  }
  writeFileSync(OUT, `${JSON.stringify(payload)}\n`)
  const bytes = readFileSync(OUT).length
  console.log(`${nodes} nodes scanned`)
  console.log(`${Object.keys(versions).length} normas with >1 version`)
  console.log(`${Object.keys(deferred).length} normas with deferred vigencia`)
  console.log(`wrote ${OUT} (${(bytes / 1024).toFixed(0)} KB)`)
  return 0
}

process.exit(main())
