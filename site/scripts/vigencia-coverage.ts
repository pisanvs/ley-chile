/**
 * vigencia-coverage.ts — how much of the corpus's deferred-entry data we can read.
 *
 * The in-force layer (lib/vigencia.ts) reads phase-in schedules out of the
 * notas LeyChile attaches to individual articles, which the pipeline already
 * carries into texto.md as `> **Nota.** …` blockquotes. This walks the
 * historial worktree and reports what fraction of those notas parse into a
 * dated calendar, what fraction key entry to an event instead of a date, and
 * what fraction read as deferred-entry provisions but yield nothing.
 *
 * That last bucket is the one to watch: it is the parser's blind spot, and the
 * only honest way to claim coverage is to measure it rather than assert it.
 * A norma whose entry depends on a reglamento being issued is NOT a failure —
 * it is correctly unresolvable, and belongs in its own column.
 *
 *   cd site && pnpm exec tsx scripts/vigencia-coverage.ts ../historial
 *   cd site && pnpm exec tsx scripts/vigencia-coverage.ts ../historial --sample 5
 *
 * Reads only; touches no database and no network.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { extractNotas, parseCondicionEvento, parseGradualidad } from '../lib/vigencia'

interface Tally {
  files: number
  notas: number
  /** Notas that read as deferred-entry provisions. */
  deferred: number
  /** …of those, the ones that parsed into a dated calendar. */
  dated: number
  /** …of the dated ones, those with at least one event-keyed provision. */
  conditioned: number
  /** Undated because entry keys to a fact, not a date. Correct, not a miss. */
  evento: number
  /** Deferred-looking notas that produced no calendar. The blind spot. */
  unparsed: string[]
}

function* walkTextos(root: string): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === '.git') continue
    const p = join(root, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) yield* walkTextos(p)
    else if (name === 'texto.md') yield p
  }
}

function main(argv: string[]): number {
  const root = argv[0]
  if (!root) {
    console.error('usage: tsx scripts/vigencia-coverage.ts <historial-dir> [--sample N]')
    return 2
  }
  const sampleIdx = argv.indexOf('--sample')
  const sample = sampleIdx >= 0 ? Number(argv[sampleIdx + 1] ?? 5) : 0

  const t: Tally = { files: 0, notas: 0, deferred: 0, dated: 0, conditioned: 0, evento: 0, unparsed: [] }
  // Cheap proxy for "reads as a deferred-entry provision", matching the gate in
  // parseGradualidad. Kept here rather than exported so the module's contract
  // stays the parse itself.
  const DEFERRED =
    /(gradual|gradualidad|por etapas|se implementar|comenzar[aá]n? a regir|entrar[aá]n? en vigencia|se aplicar[aá]|regir[aá]n? a contar)/i

  for (const file of walkTextos(root)) {
    t.files++
    let body: string
    try {
      body = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const nota of extractNotas(body)) {
      t.notas++
      if (!DEFERRED.test(nota.normalize('NFKD').replace(/[̀-ͯ]/g, ''))) continue
      t.deferred++
      const g = parseGradualidad(nota)
      if (g) {
        t.dated++
        if (g.condicionadaAEvento) t.conditioned++
      } else if (parseCondicionEvento(nota)) {
        t.evento++
      } else if (t.unparsed.length < Math.max(sample, 0)) {
        t.unparsed.push(`${file}\n    ${nota.slice(0, 240)}`)
      }
    }
  }

  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—')
  console.log(`texto.md leídos:                ${t.files}`)
  console.log(`notas encontradas:              ${t.notas}`)
  console.log(`  hablan de entrada en vigencia ${t.deferred}  (${pct(t.deferred, t.notas)} de las notas)`)
  console.log(`  con calendario fechado        ${t.dated}  (${pct(t.dated, t.deferred)} de ésas)`)
  console.log(`  con alguna etapa condicionada`)
  console.log(`  a un hecho, no a una fecha    ${t.conditioned}  (${pct(t.conditioned, t.dated)} de las fechadas)`)
  console.log(`  sin fecha porque dependen de`)
  console.log(`  un hecho (correcto, no falla)  ${t.evento}  (${pct(t.evento, t.deferred)} de ésas)`)
  const blind = t.deferred - t.dated - t.evento
  console.log(`  sin calendario legible        ${blind}  (${pct(blind, t.deferred)} de ésas)`)
  if (t.unparsed.length) {
    console.log('\nMuestra de notas sin calendario legible — el punto ciego del parser:')
    for (const u of t.unparsed) console.log(`  - ${u}`)
  }
  return 0
}

process.exit(main(process.argv.slice(2)))
