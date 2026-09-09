import { describe, it, expect } from 'vitest'
import { parseIdNorma, parseFecha } from './apiparams'
import { BadRequest } from './apiroute'

describe('parseIdNorma', () => {
  it('accepts a positive integer', () => {
    expect(parseIdNorma('29994')).toBe(29994)
  })
  it('rejects anything that is not one', () => {
    // A NaN reaching a SQL parameter is a 500 waiting to happen.
    for (const bad of ['', 'abc', '-1', '0', '1.5', '12e3', ' 12 ']) {
      expect(() => parseIdNorma(bad)).toThrow(BadRequest)
    }
  })
})

describe('parseFecha', () => {
  it('accepts YYYY-MM-DD and falls back when absent', () => {
    expect(parseFecha('2020-01-31', '2026-01-01')).toBe('2020-01-31')
    expect(parseFecha(null, '2026-01-01')).toBe('2026-01-01')
  })
  it('rejects a malformed date rather than searching an unintended day', () => {
    for (const bad of ['ayer', '2020-1-1', '20200101', '2020-13-01']) {
      expect(() => parseFecha(bad, '2026-01-01')).toThrow(BadRequest)
    }
  })
})
