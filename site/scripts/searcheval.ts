/**
 * searcheval.ts — known-item retrieval, measured rather than argued about.
 *
 * "Search feels bad" is not actionable and cannot be regression-tested. This
 * turns it into recall@k on the only retrieval task with an unarguable right
 * answer: a norma should be findable by its own identity. Query built FROM the
 * corpus, expected answer known exactly, no relevance judgements needed.
 *
 * Four query shapes per norma, easiest to hardest:
 *   numero    "20000"                       — a citation
 *   titulo    the full official título       — paste from another document
 *   words     the first eight título words   — half-remembered
 *   tipo+num  "ley 20000"                    — the canonical citation form
 *
 * Only normas the corpus actually serves are sampled. Mixing in absent normas
 * would fold the completeness gap (see completeness.ts) into the ranking
 * number and make both unreadable.
 *
 *   cd site && pnpm exec tsx scripts/searcheval.ts --sample 60
 *   cd site && pnpm exec tsx scripts/searcheval.ts --sample 60 --json
 *   cd site && pnpm exec tsx scripts/searcheval.ts --endpoint http://localhost:3000/api/mcp
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpClient, RateLimiter } from './mcpclient'

const SHARDS = join(import.meta.dirname, '..', '..', 'graph_shards')

/**
 * The laws people actually look for.
 *
 * A uniform sample of 357k normas is dominated by one-paragraph decretos whose
 * título is also most of their body ("NOMBRA MINISTROS TITULARES DEL…"), so a
 * body-only search finds them by accident and the average flatters itself. The
 * normas that fail hardest are the long, heavily-reformed ones whose título
 * appears nowhere in their own articulado — which are exactly the ones with
 * readers. Both numbers are reported; this is the one that matters.
 */
const NOTABLE: [string, string][] = [
  ['ley', '20000'],   // tráfico ilícito de estupefacientes
  ['ley', '19300'],   // bases generales del medio ambiente
  ['ley', '21561'],   // 40 horas
  ['ley', '20584'],   // derechos y deberes de los pacientes
  ['ley', '19496'],   // protección al consumidor
  ['ley', '20393'],   // responsabilidad penal de las personas jurídicas
  ['ley', '19628'],   // protección de datos personales
  ['ley', '18045'],   // mercado de valores
  ['ley', '20720'],   // insolvencia y reemprendimiento
  ['ley', '21643'],   // Karin
  ['ley', '20609'],   // Zamudio — no discriminación
  ['ley', '19880'],   // bases de los procedimientos administrativos
  ['ley', '18834'],   // estatuto administrativo
  ['ley', '19968'],   // tribunales de familia
  ['dfl', '1'],       // Código del Trabajo (ambiguous key; resolved by título)
]

interface Candidate {
  idNorma: string
  tipo: string
  numero: string
  titulo: string
}

function loadCandidates(): Candidate[] {
  const out: Candidate[] = []
  for (const f of readdirSync(SHARDS).filter((n) => n.endsWith('.json'))) {
    const shard = JSON.parse(readFileSync(join(SHARDS, f), 'utf8')) as Record<string, any>
    for (const [id, node] of Object.entries(shard)) {
      if (!node || typeof node !== 'object') continue
      const titulo = String(node.titulo ?? '').replace(/\s+/g, ' ').trim()
      // A título too short to be distinctive is not a known-item task; it is a
      // coin flip, and including it would measure noise.
      if (titulo.length < 40) continue
      out.push({
        idNorma: String(id),
        tipo: String(node.tipo ?? ''),
        numero: String(node.numero ?? ''),
        titulo,
      })
    }
  }
  return out
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: T[], seed: number): T[] {
  const rnd = mulberry32(seed)
  const c = items.slice()
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[c[i], c[j]] = [c[j], c[i]]
  }
  return c
}

/** Rank of the wanted idNorma in a rendered search_laws response, or 0. */
export function rankOf(text: string, idNorma: string): number {
  const ids = [...text.matchAll(/idNorma:\s*(\d+)/g)].map((m) => m[1])
  const i = ids.indexOf(idNorma)
  return i < 0 ? 0 : i + 1
}

interface Tally {
  n: number
  at1: number
  at10: number
  rrSum: number
}

const blank = (): Tally => ({ n: 0, at1: 0, at10: 0, rrSum: 0 })

function record(t: Tally, rank: number): void {
  t.n++
  if (rank === 1) t.at1++
  if (rank >= 1 && rank <= 10) t.at10++
  if (rank >= 1) t.rrSum += 1 / rank
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%`.padStart(5) : '    —')

async function main(argv: string[]): Promise<number> {
  const arg = (f: string) => {
    const i = argv.indexOf(f)
    return i >= 0 ? argv[i + 1] : undefined
  }
  let want = Number(arg('--sample') ?? 50)
  const seed = Number(arg('--seed') ?? 3)
  const rps = Number(arg('--rps') ?? 5)
  const endpoint = arg('--endpoint') ?? 'https://leyes.pisanvs.cl/api/mcp'

  const client = new McpClient(endpoint, RateLimiter.perSecond(rps))
  const notableOnly = argv.includes('--notable')
  const all = loadCandidates()
  let pool: Candidate[]
  if (notableOnly) {
    const byKey = new Map<string, Candidate[]>()
    for (const c of all) {
      const k = `${c.tipo}/${c.numero}`
      byKey.set(k, [...(byKey.get(k) ?? []), c])
    }
    pool = []
    for (const [tipo, numero] of NOTABLE) {
      const found = byKey.get(`${tipo}/${numero}`) ?? []
      // An ambiguous key resolves to the norma with the longest título, which
      // for these is reliably the substantive one rather than a namesake.
      const best = found.sort((a, b) => b.titulo.length - a.titulo.length)[0]
      if (best) pool.push(best)
      else console.log(`  (not in graph: ${tipo} ${numero})`)
    }
  } else {
    pool = shuffled(all, seed)
  }

  if (notableOnly) want = pool.length
  console.log(`known-item retrieval against ${endpoint}`)
  console.log(notableOnly
    ? `${pool.length} well-known normas\n`
    : `looking for ${want} served normas with a distinctive título\n`)

  const shapes = ['numero', 'titulo', 'words', 'tipo+num'] as const
  const tallies: Record<string, Tally> = Object.fromEntries(shapes.map((s) => [s, blank()]))
  const misses: { c: Candidate; shape: string }[] = []

  let used = 0
  for (const c of pool) {
    if (used >= want) break
    // Skip normas the corpus does not serve: their recall is a completeness
    // problem, not a ranking one, and averaging the two hides both.
    const law = await client.call('get_law', { tipo: c.tipo || 'ley', numero: c.numero || '0', idNorma: Number(c.idNorma) })
    if (/No se encontró/.test(law.text)) continue
    used++

    const queries: Record<typeof shapes[number], string> = {
      numero: c.numero,
      titulo: c.titulo,
      words: c.titulo.split(' ').slice(0, 8).join(' '),
      'tipo+num': `${c.tipo} ${c.numero}`,
    }
    for (const shape of shapes) {
      const q = queries[shape]
      if (!q || q.length < 2) continue
      const res = await client.call('search_laws', { query: q })
      const rank = rankOf(res.text, c.idNorma)
      record(tallies[shape], rank)
      if (rank === 0 && shape !== 'numero') misses.push({ c, shape })
    }
    if (used % 10 === 0) console.log(`  …${used}/${want}`)
  }

  console.log(`\n${used} normas × ${shapes.length} query shapes\n`)
  console.log('query shape   n     recall@1  recall@10   MRR')
  for (const s of shapes) {
    const t = tallies[s]
    console.log(
      `${s.padEnd(12)}  ${String(t.n).padStart(3)}   ${pct(t.at1, t.n)}     ${pct(t.at10, t.n)}   ` +
      `${(t.n ? t.rrSum / t.n : 0).toFixed(3)}`,
    )
  }

  const overall = blank()
  for (const s of shapes) {
    overall.n += tallies[s].n
    overall.at1 += tallies[s].at1
    overall.at10 += tallies[s].at10
    overall.rrSum += tallies[s].rrSum
  }
  console.log(
    `\noverall       ${String(overall.n).padStart(3)}   ${pct(overall.at1, overall.n)}     ` +
    `${pct(overall.at10, overall.n)}   ${(overall.n ? overall.rrSum / overall.n : 0).toFixed(3)}`,
  )

  if (misses.length) {
    console.log(`\n${misses.length} complete misses (not in the top 20 at all). First few:`)
    for (const m of misses.slice(0, 8)) {
      console.log(`  [${m.shape}] ${m.c.tipo} ${m.c.numero} · idNorma ${m.c.idNorma}`)
      console.log(`      ${m.c.titulo.slice(0, 92)}`)
    }
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      endpoint, sampled: used,
      shapes: Object.fromEntries(shapes.map((s) => [s, {
        n: tallies[s].n,
        recallAt1: tallies[s].n ? tallies[s].at1 / tallies[s].n : null,
        recallAt10: tallies[s].n ? tallies[s].at10 / tallies[s].n : null,
        mrr: tallies[s].n ? tallies[s].rrSum / tallies[s].n : null,
      }])),
    }, null, 2))
  }
  return 0
}

main(process.argv.slice(2)).then((c) => process.exit(c))
