import { describe, it, expect } from 'vitest'
import {
  INDEX_GENERATED, deferredVigencia, deferredVigenciaWarning,
  expectedVersions, incompleteHistoryWarning,
} from './corpus'

/** Real idNormas, so the committed index is checked and not just the logic. */
const LEY_20000 = 235507
const COD_TRABAJO = 207436
const LEY_18045 = 29472   // Mercado de Valores — has a Con Vigencia Diferida por Evento

describe('expectedVersions', () => {
  it('knows the version counts the graph recorded', () => {
    // The case that started this: the API serves five, the graph knows eight.
    expect(expectedVersions(LEY_20000)).toBe(8)
    expect(expectedVersions(COD_TRABAJO)).toBe(129)
  })

  it('says nothing about single-version normas', () => {
    // They are excluded from the index on purpose: their history cannot be
    // short, and carrying 326k entries to say so would be 10x the payload.
    expect(expectedVersions(999999999)).toBeNull()
  })

  it('carries a generation date, so a stale index can be spotted', () => {
    expect(INDEX_GENERATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('incompleteHistoryWarning', () => {
  it('warns when the served history is shorter than the catalogue', () => {
    // Production serves 5 of ley 20.000's 8 versions.
    const w = incompleteHistoryWarning(LEY_20000, 5)!
    expect(w).toContain('HISTORIAL INCOMPLETO')
    expect(w).toContain('se sirven 5')
    expect(w).toContain('registra 8')
    expect(w).toContain('faltan 3')
  })

  it('names the consequence, not just the arithmetic', () => {
    // The point is not that a number is small. It is that a dated query inside
    // a missing stretch silently returns an older version's text.
    expect(incompleteHistoryWarning(COD_TRABAJO, 65)).toContain('sin avisar')
  })

  it('is silent when the served history is complete', () => {
    expect(incompleteHistoryWarning(LEY_20000, 8)).toBeNull()
  })

  it('is silent when the pipeline is AHEAD of this snapshot', () => {
    // A served history longer than the graph's is not a defect — it means the
    // pipeline has moved on since the index was generated, which is the normal
    // direction of travel and must not produce a scary warning.
    expect(incompleteHistoryWarning(LEY_20000, 12)).toBeNull()
  })

  it('is silent for a norma the index says nothing about', () => {
    expect(incompleteHistoryWarning(999999999, 0)).toBeNull()
  })
})

describe('deferredVigencia', () => {
  it('reads the markers LeyChile publishes and the pipeline discarded', () => {
    // Ley 18.045 has a "Con Vigencia Diferida por Evento" version, sentinel-
    // dated 2222-02-02. The pipeline filtered sentinels BEFORE reading the
    // type, so the signal the sentinel carries was destroyed by the filter.
    const marks = deferredVigencia(LEY_18045)
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.some((m) => m.kind === 'evento')).toBe(true)
  })

  it('is empty for a norma with no deferred versions', () => {
    expect(deferredVigencia(LEY_20000)).toEqual([])
  })
})

describe('deferredVigenciaWarning', () => {
  it('says an event-conditioned entry cannot be dated', () => {
    const w = deferredVigenciaWarning(LEY_18045)!
    expect(w).toContain('VIGENCIA DIFERIDA')
    expect(w).toContain('no se puede fechar')
  })

  it('is silent for a norma with nothing deferred', () => {
    expect(deferredVigenciaWarning(LEY_20000)).toBeNull()
  })
})
