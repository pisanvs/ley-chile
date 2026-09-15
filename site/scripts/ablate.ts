/**
 * ablate.ts — prove each fix is actually held by a test.
 *
 * A green suite says the code passes its tests. It does not say the tests would
 * notice if the code stopped working, and that distinction is not academic
 * here: three probes written during this work passed against a server that
 * demonstrably had the bug they were written for. One asserted on a string that
 * appears in the response either way; one pointed at the wrong date range; one
 * used substring containment to detect a fragment that is, unavoidably, a
 * substring. Each looked like coverage and was worth nothing.
 *
 * So for every fix: remove it, run its tests, and require them to fail. A fix
 * whose tests still pass without it has no test — whatever the suite says.
 *
 *   cd site && pnpm exec tsx scripts/ablate.ts
 *   cd site && pnpm exec tsx scripts/ablate.ts --only overlap
 *
 * Source files are restored in a `finally`, so an interrupted run does not
 * leave the tree mutilated. Exit 0 if every ablation was caught, 1 otherwise.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SITE = join(import.meta.dirname, '..')

interface Ablation {
  id: string
  /** What this fix does, so a failure report reads on its own. */
  fix: string
  /** Path relative to site/. */
  file: string
  /** Exact source to delete, or to swap for `with`. Must occur exactly once. */
  remove: string
  with?: string
  /** Test file to run, relative to site/. */
  tests: string
  /** Substrings of test names that MUST fail once the fix is removed. */
  mustFail: string[]
}

const ABLATIONS: Ablation[] = [
  {
    id: 'unreachable',
    fix: 'normas whose every version is zero-length report as unreachable, not as "too early"',
    file: 'lib/mcpguards.ts',
    remove: "  if (!coversAnyDay(versions)) return { kind: 'unreachable', versions }\n",
    tests: 'lib/mcpguards.test.ts',
    mustFail: [
      'classifies as unreachable rather than as a date that came too early',
      'is unreachable for every date, not just some',
      'outranks the future-horizon check',
    ],
  },
  {
    id: 'overlap',
    fix: 'where two versions claim the same day, the later one wins',
    file: 'lib/mcpguards.ts',
    remove: '      if (!best || v.desde > best.desde) best = v',
    with: '      if (!best) best = v',
    tests: 'lib/mcpguards.test.ts',
    mustFail: ['picks the most recent version that claims the day'],
  },
  {
    id: 'currentFecha-overlap',
    fix: 'currentFecha picks the latest open version, not the first',
    file: 'lib/norma.ts',
    remove: "  if (open.length) return open.map(v => v.desde).sort().at(-1)!",
    with: '  if (open.length) return open[0].desde',
    tests: 'lib/norma.test.ts',
    mustFail: ['latest open version'],
  },
  {
    id: 'worddiff-boundaries',
    fix: 'cleanup runs before charsToLines, so edits land on token boundaries',
    file: 'lib/diff.ts',
    remove: '  dmp.diff_cleanupSemantic(raw)\n  dmp.diff_charsToLines_(raw, tokens.lineArray)',
    with: '  dmp.diff_charsToLines_(raw, tokens.lineArray)\n  dmp.diff_cleanupSemantic(raw)',
    tests: 'lib/diff.test.ts',
    mustFail: ['never slices a word apart'],
  },
  {
    id: 'iso-dates',
    fix: 'MCP date arguments are strict ISO 8601, so DD-MM-YYYY is refused',
    file: 'lib/mcpguards.ts',
    remove: '  if (!ISO.test(raw)) {',
    with: '  if (false) {',
    tests: 'lib/mcpguards.test.ts',
    mustFail: ['rejects DD-MM-YYYY rather than picking a reading'],
  },
  {
    id: 'incomplete-history',
    fix: 'a served history shorter than the catalogue says so',
    file: 'lib/corpus.ts',
    remove: '  if (expected === null || served >= expected) return null',
    with: '  return null',
    tests: 'lib/corpus.test.ts',
    mustFail: ['warns when the served history is shorter than the catalogue'],
  },
  {
    id: 'vigencia-phase-in',
    fix: 'an article whose reform had not yet begun to bind carries a warning',
    file: 'lib/vigencia.ts',
    remove: "  if (phase.kind === 'complete') return null",
    with: '  return null',
    tests: 'lib/vigencia.test.ts',
    mustFail: ['leads with the contradiction'],
  },
]

interface VitestJson {
  testResults?: { assertionResults?: { fullName?: string; title?: string; status?: string }[] }[]
}

/** Names of the tests that failed, from vitest's JSON reporter. */
function runTests(testFile: string): { failed: string[]; ran: number } {
  const dir = mkdtempSync(join(tmpdir(), 'ablate-'))
  const out = join(dir, 'r.json')
  try {
    try {
      execFileSync(
        'pnpm',
        ['exec', 'vitest', 'run', testFile, '--reporter=json', `--outputFile=${out}`],
        { cwd: SITE, stdio: 'pipe' },
      )
    } catch {
      // Non-zero exit is the expected case under ablation; the report is what
      // matters, not the exit code.
    }
    const json = JSON.parse(readFileSync(out, 'utf8')) as VitestJson
    const all = (json.testResults ?? []).flatMap((f) => f.assertionResults ?? [])
    return {
      failed: all.filter((a) => a.status === 'failed').map((a) => a.fullName ?? a.title ?? '?'),
      ran: all.length,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function main(argv: string[]): number {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined
  const selected = ABLATIONS.filter((a) => !only || a.id === only)
  if (selected.length === 0) {
    console.error(`no ablation matched "${only}"`)
    return 2
  }

  console.log(`${selected.length} ablation(s)\n`)
  let bad = 0

  for (const ab of selected) {
    const path = join(SITE, ab.file)
    const original = readFileSync(path, 'utf8')
    const occurrences = original.split(ab.remove).length - 1
    if (occurrences !== 1) {
      console.log(`SKIP  ${ab.id.padEnd(22)} anchor occurs ${occurrences}× in ${ab.file}`)
      console.log(`      The fix moved. Update the ablation before trusting this suite.`)
      bad++
      continue
    }

    try {
      writeFileSync(path, original.replace(ab.remove, ab.with ?? ''))
      const { failed, ran } = runTests(ab.tests)
      const caught = ab.mustFail.filter((want) => failed.some((f) => f.includes(want)))
      const missed = ab.mustFail.filter((want) => !failed.some((f) => f.includes(want)))

      if (missed.length === 0 && caught.length > 0) {
        console.log(`HELD  ${ab.id.padEnd(22)} ${caught.length}/${ab.mustFail.length} caught (${ran} ran)`)
      } else {
        bad++
        console.log(`LOOSE ${ab.id.padEnd(22)} ${caught.length}/${ab.mustFail.length} caught (${ran} ran)`)
        console.log(`      fix: ${ab.fix}`)
        for (const m of missed) {
          console.log(`      NOT CAUGHT: "${m}" still passed with the fix removed`)
        }
      }
    } finally {
      // Always, even on throw or interrupt: an ablation run must not leave a
      // mutilated source tree behind.
      writeFileSync(path, original)
    }
  }

  console.log(
    bad === 0
      ? `\nevery fix is held by a failing test`
      : `\n${bad} ablation(s) not held — those fixes could regress silently`,
  )
  return bad === 0 ? 0 : 1
}

process.exit(main(process.argv.slice(2)))
