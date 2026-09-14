/**
 * completeness.ts — does the served corpus carry every version the graph knows?
 *
 * Ley 20.000 is the case that raised this: `list_versions` returns five
 * versions, and `graph_shards` records eight. The three the API never mentions
 * (2005-11-14, 2013-12-27, 2015-10-22) are not flagged, not counted, and not
 * knowable from the outside — ask for the text on 2013-12-28 and you get a
 * confident answer drawn from the wrong version, with no signal at all.
 *
 * That is the most dangerous defect shape this corpus can have: wrong by
 * omission. Every probe in the suite passes on a norma whose history is missing
 * a third of its entries, because every individual answer is well-formed. Only
 * comparing the two sides finds it.
 *
 * The graph is the reference here, not the truth — it is itself a scrape, and a
 * version it lacks may be one LeyChile never published. But a version the graph
 * HAS and the API lacks is a hole in the read model, and that is what this
 * measures.
 *
 *   cd site && pnpm exec tsx scripts/completeness.ts --sample 300
 *   cd site && pnpm exec tsx scripts/completeness.ts --sample 300 --seed 7 --json
 *   cd site && pnpm exec tsx scripts/completeness.ts --ids 235507,207436
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpClient, RateLimiter } from './mcpclient'

const SHARDS = join(import.meta.dirname, '..', '..', 'graph_shards')
const MAX_REAL_YEAR = 2100

interface GraphNorma {
  idNorma: string
  tipo: string
  numero: string
  /** Real, dateable `desde` values, ascending. */
  desdes: string[]
}

function isReal(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(0, 4)) <= MAX_REAL_YEAR
}

function loadGraph(): GraphNorma[] {
  const out: GraphNorma[] = []
  for (const file of readdirSync(SHARDS).filter((f) => f.endsWith('.json'))) {
    const shard = JSON.parse(readFileSync(join(SHARDS, file), 'utf8')) as Record<string, any>
    for (const [id, node] of Object.entries(shard)) {
      if (!node || typeof node !== 'object') continue
      const desdes = [...new Set(
        (node.vigencias ?? []).map((v: any) => v?.desde).filter(isReal),
      )].sort() as string[]
      out.push({
        idNorma: String(id),
        tipo: String(node.tipo ?? ''),
        numero: String(node.numero ?? ''),
        desdes,
      })
    }
  }
  return out
}

/** Deterministic PRNG so a sample can be re-run and argued with. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sample<T>(items: T[], n: number, seed: number): T[] {
  const rnd = mulberry32(seed)
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

/** The `desde` dates a rendered list_versions response reports. */
export function parseServedDates(text: string): string[] {
  return [...text.matchAll(/^\s*\d+\.\s+(\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1])
}

interface Row {
  norma: GraphNorma
  served: string[]
  missing: string[]
  extra: string[]
  error?: string
}

async function main(argv: string[]): Promise<number> {
  const arg = (f: string) => {
    const i = argv.indexOf(f)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const size = Number(arg('--sample') ?? 200)
  const seed = Number(arg('--seed') ?? 1)
  const rps = Number(arg('--rps') ?? 5)
  const ids = arg('--ids')?.split(',').map((s) => s.trim()).filter(Boolean)
  const endpoint = arg('--endpoint') ?? 'https://leyes.pisanvs.cl/api/mcp'

  const graph = loadGraph()
  // Only multi-version normas can show the defect, and they are where the
  // corpus's value is: a single-version norma has no history to lose.
  const multi = graph.filter((n) => n.desdes.length >= 2)
  const chosen = ids
    ? graph.filter((n) => ids.includes(n.idNorma))
    : sample(multi, Math.min(size, multi.length), seed)

  console.log(`graph: ${graph.length} normas, ${multi.length} with 2+ versions`)
  console.log(`comparing ${chosen.length} against ${endpoint} at ${rps} req/s\n`)

  const client = new McpClient(endpoint, RateLimiter.perSecond(rps))
  const rows: Row[] = []
  let done = 0
  for (const norma of chosen) {
    const res = await client.call('list_versions', {
      tipo: norma.tipo || 'ley',
      numero: norma.numero || '0',
      idNorma: Number(norma.idNorma),
    })
    const served = parseServedDates(res.text)
    const row: Row = { norma, served, missing: [], extra: [] }
    if (/No se encontró|TRANSPORT ERROR|HTTP \d/.test(res.text) && served.length === 0) {
      row.error = res.text.split('\n')[0].slice(0, 90)
    } else {
      const s = new Set(served)
      const g = new Set(norma.desdes)
      row.missing = norma.desdes.filter((d) => !s.has(d))
      row.extra = served.filter((d) => !g.has(d))
    }
    rows.push(row)
    if (++done % 50 === 0) console.log(`  …${done}/${chosen.length}`)
  }

  const errored = rows.filter((r) => r.error)
  const usable = rows.filter((r) => !r.error)
  const exact = usable.filter((r) => !r.missing.length && !r.extra.length)
  const short = usable.filter((r) => r.missing.length)
  const over = usable.filter((r) => r.extra.length && !r.missing.length)

  const graphVersions = usable.reduce((a, r) => a + r.norma.desdes.length, 0)
  const missingVersions = usable.reduce((a, r) => a + r.missing.length, 0)

  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—')
  console.log(`\n${usable.length} comparable · ${errored.length} not served at all\n`)
  console.log(`normas whose served history matches the graph exactly   ${exact.length}  (${pct(exact.length, usable.length)})`)
  console.log(`normas MISSING at least one version the graph knows     ${short.length}  (${pct(short.length, usable.length)})`)
  console.log(`normas serving a version the graph does not have        ${over.length}  (${pct(over.length, usable.length)})`)
  console.log(`\nversions in the graph for these normas                  ${graphVersions}`)
  console.log(`versions the API never mentions                          ${missingVersions}  (${pct(missingVersions, graphVersions)})`)

  if (short.length) {
    const worst = short.slice().sort((a, b) => b.missing.length - a.missing.length).slice(0, 12)
    console.log('\nworst offenders (missing / known):')
    for (const r of worst) {
      console.log(
        `  ${r.norma.tipo.toUpperCase()} ${r.norma.numero} · idNorma ${r.norma.idNorma}` +
        `  ${r.missing.length}/${r.norma.desdes.length}  e.g. ${r.missing.slice(0, 3).join(', ')}`,
      )
    }
  }
  if (errored.length) {
    console.log('\nnot served at all:')
    for (const r of errored.slice(0, 8)) {
      console.log(`  idNorma ${r.norma.idNorma} (${r.norma.tipo} ${r.norma.numero}): ${r.error}`)
    }
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      sampled: chosen.length, usable: usable.length, errored: errored.length,
      exact: exact.length, short: short.length, over: over.length,
      graphVersions, missingVersions,
      worst: short.slice(0, 40).map((r) => ({
        idNorma: r.norma.idNorma, tipo: r.norma.tipo, numero: r.norma.numero,
        known: r.norma.desdes.length, missing: r.missing,
      })),
    }, null, 2))
  }
  return 0
}

main(process.argv.slice(2)).then((c) => process.exit(c))
