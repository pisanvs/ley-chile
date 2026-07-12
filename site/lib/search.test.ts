import { describe, it, expect } from 'vitest'
import { asOfFilter, COLD_THRESHOLD, needsColdPath, normalizeQuery, OPEN_ENDED_TS } from './search'

describe('asOfFilter', () => {
  it('is a range-containment predicate on the validity window', () => {
    // 2000-01-01T00:00:00Z = 946684800
    expect(asOfFilter('2000-01-01')).toBe('desde_ts <= 946684800 AND hasta_ts >= 946684800')
  })
  it('matches open-ended versions via the sentinel', () => {
    expect(OPEN_ENDED_TS).toBe(253402300799)
  })
  it('rejects a malformed date rather than building a broken filter', () => {
    expect(() => asOfFilter('ayer')).toThrow(/YYYY-MM-DD/)
  })
})

describe('normalizeQuery', () => {
  it('lowercases and folds accents so query_norm aggregates cleanly', () => {
    expect(normalizeQuery('  Arrendamiento CIVIL  ')).toBe('arrendamiento civil')
    expect(normalizeQuery('Código')).toBe('codigo')
  })
})

describe('needsColdPath', () => {
  it('falls through to Postgres when the hot tier is thin', () => {
    expect(needsColdPath(0)).toBe(true)
    expect(needsColdPath(COLD_THRESHOLD - 1)).toBe(true)
  })
  it('stays on the hot path when there are enough results', () => {
    expect(needsColdPath(COLD_THRESHOLD)).toBe(false)
  })
})
