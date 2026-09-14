/**
 * Composite checks — invariants that take more than one call to state.
 *
 * A single-call probe can only assert things about one answer. The properties
 * that matter most are relations BETWEEN answers: that a diff quotes text which
 * actually appears in the version it claims to quote, that reversing a range
 * inverts it, that a version boundary is a real discontinuity. Those need a
 * conversation with the server, so they live here rather than in the
 * declarative set.
 *
 * Each returns the failures it found, as sentences. An empty array is a pass.
 */

import type { McpClient } from './mcpclient'

export interface Check {
  id: string
  group: string
  /** What this establishes, and why anyone should care that it broke. */
  why: string
  run: (client: McpClient) => Promise<string[]>
}

const LEY_20000 = { tipo: 'ley', numero: '20000', idNorma: 235507 }

/** Pull the `[-]` / `[+]` operation texts out of a rendered diff. */
function diffOps(text: string): { del: string[]; ins: string[] } {
  const del: string[] = []
  const ins: string[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\[([-+])\]\s?([\s\S]*)$/)
    if (!m) continue
    ;(m[1] === '-' ? del : ins).push(m[2])
  }
  return { del, ins }
}

/** Whitespace varies between the diff renderer and the article renderer; the
 *  question is whether the WORDS are there, in order. */
function normalise(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

const WORD = /[\p{L}\p{N}]/u

interface DiffSection { heading: string; del: string[]; ins: string[] }

/** Split a rendered diff into its per-article sections. */
function splitDiffSections(text: string): DiffSection[] {
  const out: DiffSection[] = []
  let cur: DiffSection | null = null
  for (const line of text.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s+—\s+(MODIFICADO|AÑADIDO|ELIMINADO)\s*$/)
    if (h) {
      if (cur) out.push(cur)
      cur = h[2] === 'MODIFICADO' ? { heading: h[1].trim(), del: [], ins: [] } : null
      continue
    }
    if (!cur) continue
    const op = line.match(/^\[([-+])\]\s?([\s\S]*)$/)
    if (op) (op[1] === '-' ? cur.del : cur.ins).push(op[2])
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Does `needle` occur in `haystack` aligned to word boundaries at both ends?
 *
 * Plain containment is not enough, and the reason is the whole bug: a fragment
 * cut off the front of a word is still a substring of the text it was cut from.
 * "uministre a menores…" appears verbatim inside "El que suministre a
 * menores…", so a containment test reports it as perfectly quotable. It is not
 * — pasted into a brief it is not a phrase in the law. Only the boundaries
 * distinguish a quotation from a slice.
 */
function containsAligned(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true
  let from = 0
  for (;;) {
    const i = haystack.indexOf(needle, from)
    if (i < 0) return false
    const before = i > 0 ? haystack[i - 1] : ''
    const after = haystack[i + needle.length] ?? ''
    const leftOk = !WORD.test(before) || !WORD.test(needle[0])
    const rightOk = !WORD.test(after) || !WORD.test(needle[needle.length - 1])
    if (leftOk && rightOk) return true
    from = i + 1
  }
}

export const CHECKS: Check[] = [
  {
    id: 'diff/ops-are-quotable',
    group: 'diffs',
    why:
      'Every "what changed" string a diff emits has to be findable, as a phrase, in the ' +
      'text it came from. This is the property C4 gold labels depend on, and the one ' +
      'character-level slicing broke.',
    async run(client) {
      const desde = '2005-02-16'
      const hasta = '2026-05-23'
      const diff = await client.call('diff_versions', { ...LEY_20000, desde, hasta })

      // Split on heading lines rather than with one regex. A lookahead using
      // `$` under the `m` flag ends the capture at the first line break, so an
      // earlier version of this check collected zero operations per block and
      // passed against a server that has the bug.
      const sections = splitDiffSections(diff.text)
      if (sections.length === 0) return [`no MODIFICADO blocks parsed from ${desde}→${hasta}`]

      // A truncated diff's last block is cut mid-text; its ops prove nothing.
      const usable = /\[truncado|\[TRUNCADO\]/.test(diff.text) ? sections.slice(0, -1) : sections

      const failures: string[] = []
      let compared = 0
      for (const sec of usable.slice(0, 6)) {
        // Normalise the label locally. The diff prints the raw heading
        // ("Artículo 5") while article lookup may only accept the stored label
        // ("articulo 5") — depending on the deployed version. Doing it here
        // keeps the check measuring the DIFF rather than the label matcher.
        const articulo = sec.heading
          .replace(/[°º]/g, '')
          .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/\bart\./g, 'articulo').replace(/\s+/g, ' ').trim()
        const [prev, curr] = await Promise.all([
          client.call('get_article', { ...LEY_20000, articulo, fecha: desde }),
          client.call('get_article', { ...LEY_20000, articulo, fecha: hasta }),
        ])
        // Not a diff defect — the article did not resolve, so there is nothing
        // to compare against. Counted, not failed.
        if (/No se encontró el artículo/.test(prev.text) || /No se encontró el artículo/.test(curr.text)) {
          continue
        }
        const hay = { del: normalise(prev.text), ins: normalise(curr.text) }
        for (const [side, ops] of [['del', sec.del], ['ins', sec.ins]] as const) {
          for (const raw of ops) {
            const op = normalise(raw)
            // Short ops are ambiguous; very long ones risk the body cap.
            if (op.length < 24 || op.length > 400) continue
            compared++
            if (!containsAligned(hay[side], op)) {
              const why = hay[side].includes(op)
                ? 'appears only mid-word, so it is a slice and not a quotation'
                : 'does not appear at all'
              failures.push(
                `${side === 'del' ? 'deletion' : 'insertion'} in ${articulo} ${why} in the ` +
                `${side === 'del' ? desde : hasta} text: "${op.slice(0, 70)}…"`,
              )
            }
          }
        }
        if (failures.length >= 6) break
      }
      // A check that compared nothing has not passed; say so.
      if (compared === 0 && failures.length === 0) {
        return ['no diff operations could be compared — the check proved nothing']
      }
      return failures.slice(0, 6)
    },
  },
  {
    id: 'diff/no-fragment-shaped-ops',
    group: 'diffs',
    why:
      'A word-level diff never begins or ends an edit inside a word. Fragments like ' +
      '[-] "s grados" or [+] "in el consentimiento" are unquotable and, worse, read as ' +
      'real Spanish to a model that has not seen the source.',
    async run(client) {
      const diff = await client.call('diff_versions', {
        ...LEY_20000, desde: '2005-02-16', hasta: '2026-05-23',
      })
      const { del, ins } = diffOps(diff.text)
      const failures: string[] = []
      // Spanish has very few real words starting with these clusters, and none
      // of them appear in this corpus; a leading one means a word was cut.
      const CUT_HEAD = /^(?:uministre|ministre\b|ños\b|in el\b|s grados|rá\b|ción\b|iento\b)/i
      // An op that ends in a bare single letter is the tail half of a cut word
      // ("incurrirá e", "será sancionado co").
      const CUT_TAIL = /\b[b-df-hj-np-tv-z]$/i
      for (const op of [...del, ...ins]) {
        const t = normalise(op)
        if (t.length < 3) continue
        if (CUT_HEAD.test(t)) failures.push(`edit begins mid-word: "${t.slice(0, 70)}…"`)
        else if (CUT_TAIL.test(t) && t.length > 20) {
          failures.push(`edit ends mid-word: "…${t.slice(-70)}"`)
        }
      }
      return failures.slice(0, 6)
    },
  },

  {
    id: 'version/boundaries-are-real-discontinuities',
    group: 'boundaries',
    why:
      'Every date list_versions reports as a boundary should be a day on which the text ' +
      'actually changed. A boundary with no change means the version series carries ' +
      'entries the text does not justify; the reverse would mean changes with no version.',
    async run(client) {
      const versions = await client.call('list_versions', LEY_20000)
      const dates = [...versions.text.matchAll(/^\s*\d+\.\s+(\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1])
      if (dates.length < 2) return [`expected several versions, parsed ${dates.length}`]

      const failures: string[] = []
      for (let i = 1; i < dates.length; i++) {
        const boundary = dates[i]
        const dayBefore = new Date(`${boundary}T00:00:00Z`)
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
        const before = dayBefore.toISOString().slice(0, 10)
        const diff = await client.call('diff_versions', {
          ...LEY_20000, desde: before, hasta: boundary,
        })
        if (/Sin cambios de texto/i.test(diff.text)) {
          failures.push(`${boundary} is listed as a version boundary but nothing changed on it`)
        }
      }
      return failures
    },
  },

  {
    id: 'version/series-covers-every-day',
    group: 'boundaries',
    why:
      'Version ranges must tile the timeline with no gap and no overlap. A gap is a day ' +
      'on which the corpus believes the law had no text; an overlap is a day with two ' +
      'answers, and nothing in the API would tell you which one you got.',
    async run(client) {
      const versions = await client.call('list_versions', LEY_20000)
      const rows = [...versions.text.matchAll(
        /^\s*\d+\.\s+(\d{4}-\d{2}-\d{2})\s+→\s+(\d{4}-\d{2}-\d{2}|vigente)/gm,
      )].map((m) => ({ desde: m[1], hasta: m[2] }))
      if (rows.length < 2) return [`expected several versions, parsed ${rows.length}`]

      const failures: string[] = []
      for (let i = 1; i < rows.length; i++) {
        const prevHasta = rows[i - 1].hasta
        if (prevHasta === 'vigente') {
          failures.push(`version ${i} is open-ended but is not the last in the series`)
          continue
        }
        const expected = new Date(`${prevHasta}T00:00:00Z`)
        expected.setUTCDate(expected.getUTCDate() + 1)
        const want = expected.toISOString().slice(0, 10)
        if (rows[i].desde !== want) {
          const kind = rows[i].desde > want ? 'gap' : 'overlap'
          failures.push(`${kind} between ${prevHasta} and ${rows[i].desde} (expected ${want})`)
        }
      }
      return failures
    },
  },

  {
    id: 'search/self-retrieval',
    group: 'search',
    why:
      'The weakest possible retrieval bar: a norma must be findable by its own official ' +
      'título, pasted verbatim. Anything that fails this is undiscoverable to everyone ' +
      'who does not already know its number — which is every non-lawyer and most lawyers.',
    async run(client) {
      // A spread of tipos and eras, each addressed by idNorma so the expected
      // answer is unambiguous.
      const cases = [
        { idNorma: 235507, tipo: 'ley', numero: '20000' },
        { idNorma: 1191554, tipo: 'ley', numero: '21561' },
        { idNorma: 207436, tipo: 'dfl', numero: '1' },
        { idNorma: 242302, tipo: 'ley', numero: '19300' },
        { idNorma: 1039348, tipo: 'ley', numero: '20584' },
      ]
      const failures: string[] = []
      for (const c of cases) {
        const law = await client.call('get_law', c)
        const titulo = law.text.split('\n')[0]?.replace(/^\S+\s+\S+\s+—\s+/, '').trim()
        if (!titulo || titulo.length < 20) {
          failures.push(`could not read a título for idNorma ${c.idNorma}`)
          continue
        }
        const hits = await client.call('search_laws', { query: titulo })
        if (!hits.text.includes(String(c.idNorma))) {
          failures.push(
            `idNorma ${c.idNorma} (${c.tipo} ${c.numero}) does not retrieve itself by its own ` +
            `título: "${titulo.slice(0, 60)}…"`,
          )
        }
      }
      return failures
    },
  },
]
