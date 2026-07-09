import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { segment, canonicalText } from './segment'

// web/package.json sets "type": "module", so __dirname does not exist here.
const CORPUS = resolve(import.meta.dirname, '../../../tests/fixtures/segment_corpus.json')
const GOLDEN = resolve(import.meta.dirname, '../../../tests/fixtures/segment_expected.json')

interface Fixture { name: string; text: string }

function build(): Record<string, unknown> {
  const corpus: Fixture[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const out: Record<string, unknown> = {}
  for (const f of corpus) {
    const segs = segment(f.text)
    out[f.name] = { segments: segs, canonical: canonicalText(segs) }
  }
  return out
}

describe('segmentation golden file', () => {
  it('matches the committed golden (run with UPDATE_GOLDEN=1 to regenerate)', () => {
    const actual = build()
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n', 'utf-8')
    }
    const expected = JSON.parse(readFileSync(GOLDEN, 'utf-8'))
    expect(actual).toEqual(expected)
  })
})
