/**
 * probe.ts — run the adversarial probe suite against a deployed MCP server.
 *
 * The teardown that started this work was nineteen probes typed by hand. It
 * found four P0s, which is not evidence that four existed — it is evidence that
 * nobody could run the twentieth. This makes the question answerable on demand.
 *
 *   cd site && pnpm exec tsx scripts/probe.ts
 *   cd site && pnpm exec tsx scripts/probe.ts --group dates --verbose
 *   cd site && pnpm exec tsx scripts/probe.ts --endpoint http://localhost:3000/api/mcp
 *   cd site && pnpm exec tsx scripts/probe.ts --update-baseline
 *
 * Probes assert the CONTRACT, so a failure against production means one of two
 * things: a live defect, or a fix that is merged but not deployed. The baseline
 * keeps them apart — it records what each probe did last time, so a run that
 * changes nothing prints nothing and a regression shows up as a diff in a
 * committed file rather than as a number nobody was watching.
 *
 * Exit codes: 0 all passed · 1 something failed · 2 bad usage.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpClient, RateLimiter } from './mcpclient'
import { PROBES, type Assertion, type Probe } from './probes'
import { CHECKS } from './checks'

const DEFAULT_ENDPOINT = 'https://leyes.pisanvs.cl/api/mcp'
const BASELINE = join(import.meta.dirname, 'probe-baseline.json')

interface Baseline {
  endpoint: string
  updated: string
  probes: Record<string, { status: 'pass' | 'fail'; digest: string; failures?: string[] }>
}

function digest(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 12)
}

function describe(a: Assertion): string {
  if ('contains' in a) return `contains ${JSON.stringify(a.contains)}`
  if ('notContains' in a) return `does NOT contain ${JSON.stringify(a.notContains)}`
  if ('matches' in a) return `matches /${a.matches}/`
  return `does NOT match /${a.notMatches}/`
}

/** Returns the assertions that failed, in the order they were declared. */
function check(text: string, expect: Assertion[]): Assertion[] {
  return expect.filter((a) => {
    if ('contains' in a) return !text.includes(a.contains)
    if ('notContains' in a) return text.includes(a.notContains)
    if ('matches' in a) return !new RegExp(a.matches, 'im').test(text)
    return new RegExp(a.notMatches, 'im').test(text)
  })
}

function loadBaseline(): Baseline | null {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline
  } catch {
    return null
  }
}

interface Outcome {
  probe: Probe
  text: string
  ms: number
  failures: Assertion[]
}

async function run(argv: string[]): Promise<number> {
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const has = (flag: string) => argv.includes(flag)

  if (has('--help')) {
    console.log('usage: tsx scripts/probe.ts [--endpoint URL] [--group G] [--filter SUBSTR]')
    console.log('                            [--rps N] [--verbose] [--update-baseline] [--json]')
    return 2
  }

  const endpoint = arg('--endpoint') ?? DEFAULT_ENDPOINT
  const rps = Number(arg('--rps') ?? 5)
  const group = arg('--group')
  const filter = arg('--filter')
  const verbose = has('--verbose')

  const matches = (id: string, g: string) =>
    (!group || g === group) && (!filter || id.includes(filter))
  const selected = PROBES.filter((p) => matches(p.id, p.group))
  // Composite checks are selected by the same filter. Bail only when NEITHER
  // set matched — a filter naming just a composite check is a normal thing to
  // type, and exiting on it made those checks unrunnable in isolation.
  const runChecks = CHECKS.filter((c) => matches(c.id, c.group))
  if (selected.length === 0 && runChecks.length === 0) {
    console.error('no probes or checks matched')
    return 2
  }

  const client = new McpClient(endpoint, RateLimiter.perSecond(rps))
  const baseline = loadBaseline()
  const outcomes: Outcome[] = []

  console.log(`probing ${endpoint}`)
  console.log(`${selected.length} probes + ${runChecks.length} checks at ${rps} req/s\n`)

  for (const probe of selected) {
    const res = await client.call(probe.tool, probe.args)
    const failures = check(res.text, probe.expect)
    outcomes.push({ probe, text: res.text, ms: res.ms, failures })

    const status = failures.length === 0 ? 'PASS' : 'FAIL'
    const prior = baseline?.probes[probe.id]
    // Only three transitions are worth a word: newly broken, newly fixed, and
    // a pass whose answer changed underneath us. Everything else is noise in a
    // suite you want to run every night.
    let drift = ''
    if (prior) {
      if (prior.status === 'pass' && status === 'FAIL') drift = '  ← REGRESSION'
      else if (prior.status === 'fail' && status === 'PASS') drift = '  ← fixed'
      else if (status === 'PASS' && prior.digest !== digest(res.text)) drift = '  ← answer changed'
    } else {
      drift = '  ← new'
    }
    console.log(`${status}  ${probe.id.padEnd(42)} ${String(res.ms).padStart(5)}ms${drift}`)
    for (const f of failures) {
      console.log(`      expected: ${describe(f)}`)
      console.log(`      why:      ${f.why}`)
    }
    if (verbose && failures.length) {
      console.log(`      --- got ---\n${res.text.split('\n').slice(0, 12).map((l) => `      ${l}`).join('\n')}\n`)
    }
  }

  // Composite checks: invariants stated across several calls. Run after the
  // declarative set so a transport problem shows up in the cheap probes first.
  const checkResults: { id: string; group: string; failures: string[] }[] = []
  if (runChecks.length && selected.length) console.log('')
  for (const c of runChecks) {
    const started = Date.now()
    let failures: string[]
    try {
      failures = await c.run(client)
    } catch (e) {
      failures = [`check threw: ${(e as Error).message}`]
    }
    const ms = Date.now() - started
    checkResults.push({ id: c.id, group: c.group, failures })
    const prior = baseline?.probes[c.id]
    let drift = ''
    if (prior) {
      if (prior.status === 'pass' && failures.length) drift = '  ← REGRESSION'
      else if (prior.status === 'fail' && !failures.length) drift = '  ← fixed'
    } else drift = '  ← new'
    console.log(`${failures.length ? 'FAIL' : 'PASS'}  ${c.id.padEnd(42)} ${String(ms).padStart(5)}ms${drift}`)
    if (failures.length) {
      console.log(`      why:      ${c.why}`)
      for (const f of failures.slice(0, 6)) console.log(`      found:    ${f}`)
    }
  }
  for (const c of checkResults) {
    outcomes.push({
      probe: { id: c.id, group: c.group, tool: 'composite', args: {}, expect: [] },
      text: c.failures.join('\n'),
      ms: 0,
      failures: c.failures.map((f) => ({ contains: f, why: '' })),
    })
  }

  const failed = outcomes.filter((o) => o.failures.length > 0)
  const byGroup = new Map<string, { pass: number; fail: number }>()
  for (const o of outcomes) {
    const g = byGroup.get(o.probe.group) ?? { pass: 0, fail: 0 }
    if (o.failures.length) g.fail++
    else g.pass++
    byGroup.set(o.probe.group, g)
  }

  console.log(`\n${outcomes.length - failed.length}/${outcomes.length} passed`)
  for (const [g, { pass, fail }] of [...byGroup].sort()) {
    console.log(`  ${g.padEnd(12)} ${pass}/${pass + fail}`)
  }

  const regressions = failed.filter((o) => baseline?.probes[o.probe.id]?.status === 'pass')
  if (regressions.length) {
    console.log(`\n${regressions.length} REGRESSION(S) since the baseline:`)
    for (const o of regressions) console.log(`  - ${o.probe.id}`)
  }

  if (has('--json')) {
    console.log(JSON.stringify(
      outcomes.map((o) => ({
        id: o.probe.id, group: o.probe.group, ms: o.ms,
        passed: o.failures.length === 0,
        failures: o.failures.map(describe),
      })),
      null, 2,
    ))
  }

  if (has('--update-baseline')) {
    const next: Baseline = {
      endpoint,
      updated: new Date().toISOString().slice(0, 10),
      probes: Object.fromEntries(outcomes.map((o) => [
        o.probe.id,
        {
          status: (o.failures.length === 0 ? 'pass' : 'fail') as 'pass' | 'fail',
          digest: digest(o.text),
          ...(o.failures.length ? { failures: o.failures.map(describe) } : {}),
        },
      ])),
    }
    // Merge rather than replace, so a filtered run does not silently drop the
    // probes it did not execute.
    if (baseline) next.probes = { ...baseline.probes, ...next.probes }
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`\nbaseline written: ${BASELINE}`)
  }

  return failed.length === 0 ? 0 : 1
}

run(process.argv.slice(2)).then((code) => process.exit(code))
