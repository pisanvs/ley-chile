import { describe, it, expect } from 'vitest'
import {
  availableLabels, checkFecha, checkRange, coverage, futureWarning, matchArticle,
  notYetInForce, versionAt,
} from './mcpguards'
import type { Version } from './norma'

const v = (desde: string, hasta: string | null): Version => ({
  desde, hasta, commitSha: 'deadbeef', causaId: null, subject: '',
})

// Ley 20.000: published 2005-02-16, art. 22 repealed by a version starting
// 2024-09-04, still in force today. The shape every case below is drawn from.
const LEY_20000 = [v('2005-02-16', '2023-05-22'), v('2023-05-23', '2024-09-03'), v('2024-09-04', null)]

describe('checkFecha', () => {
  it('accepts strict ISO 8601', () => {
    expect(checkFecha('2024-09-03')).toEqual({ ok: true, value: '2024-09-03' })
    expect(checkFecha('2005-02-16')).toEqual({ ok: true, value: '2005-02-16' })
  })

  it('rejects DD-MM-YYYY rather than picking a reading', () => {
    // The bug: "03-09-2024" was accepted, resolved to 3 September, and echoed
    // back as "vigente al 03-09-2024". A caller who meant 9 March got a
    // different year's law with no warning.
    const r = checkFecha('03-09-2024')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('ISO 8601')
  })

  it('rejects malformed and non-calendar dates', () => {
    for (const bad of ['banana', '2024-13-45', '2024-2-3', '20240203', '', '2024-02-30']) {
      expect(checkFecha(bad).ok).toBe(false)
    }
  })

  it('names the offending parameter so the caller knows which to fix', () => {
    const r = checkFecha('ayer', 'desde')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('`desde`')
  })
})

describe('checkRange', () => {
  it('accepts an ordered range', () => {
    expect(checkRange('2023-05-23', '2024-09-04').ok).toBe(true)
  })

  it('refuses a reversed range instead of rendering history backwards', () => {
    // diff_versions ley 20000 --desde 2024-09-04 --hasta 2023-05-23 returned
    // "[-] Derogado. [+] Será circunstancia atenuante…", which asserts the
    // attenuant was created in 2023. It was repealed in 2024.
    const r = checkRange('2024-09-04', '2023-05-23')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('posterior')
      // The fix should be obvious from the message alone.
      expect(r.message).toContain('intercambiadas')
    }
  })

  it('refuses an empty range', () => {
    expect(checkRange('2024-09-04', '2024-09-04').ok).toBe(false)
  })
})

describe('versionAt', () => {
  it('treats `hasta` as inclusive', () => {
    // With `<` instead of `<=` the last day of every version reports no text.
    expect(versionAt(LEY_20000, '2024-09-03')?.desde).toBe('2023-05-23')
    expect(versionAt(LEY_20000, '2024-09-04')?.desde).toBe('2024-09-04')
  })

  it('returns nothing before the first version', () => {
    expect(versionAt(LEY_20000, '2000-01-01')).toBeUndefined()
  })
})

describe('coverage', () => {
  const TODAY = '2026-09-13'

  it('reports a date inside the series as covered', () => {
    const c = coverage(LEY_20000, '2024-09-03', TODAY)
    expect(c.kind).toBe('covered')
    if (c.kind === 'covered') expect(c.version.desde).toBe('2023-05-23')
  })

  it('reports a pre-enactment date as `before`, not as a missing article', () => {
    const c = coverage(LEY_20000, '2000-01-01', TODAY)
    expect(c.kind).toBe('before')
    if (c.kind === 'before') expect(c.first.desde).toBe('2005-02-16')
  })

  it('reports a future date as extrapolation even though the last version is open', () => {
    // The open-ended last version means "as far as the corpus knows", and
    // versionAt stretches it to 2030 — which is how "vigente al 2030-01-01"
    // came to be asserted as settled law.
    expect(versionAt(LEY_20000, '2030-01-01')?.desde).toBe('2024-09-04')
    const c = coverage(LEY_20000, '2030-01-01', TODAY)
    expect(c.kind).toBe('future')
    if (c.kind === 'future') expect(c.last.desde).toBe('2024-09-04')
  })

  it('checks the horizon before containment, so today is still covered', () => {
    expect(coverage(LEY_20000, TODAY, TODAY).kind).toBe('covered')
  })

  it('handles a norma with no versions', () => {
    expect(coverage([], '2024-01-01', TODAY).kind).toBe('empty')
  })
})

describe('futureWarning', () => {
  it('names the horizon and marks the answer as an extrapolation', () => {
    const m = futureWarning(v('2026-05-23', null), '2030-01-01', '2026-09-13')
    expect(m).toContain('2030-01-01')
    expect(m).toContain('2026-05-23')
    expect(m).toContain('extrapolación')
  })
})

describe('notYetInForce', () => {
  const norma = { tipo: 'ley', numero: '20000', fechaPublicacion: '2005-02-16' }

  it('makes the statement about the norma, not the article', () => {
    const m = notYetInForce(norma, v('2005-02-16', null), '2000-01-01')
    expect(m).toContain('no estaba vigente al 2000-01-01')
    expect(m).toContain('2005-02-16')
    expect(m).not.toContain('No se encontró el artículo')
  })

  it('points at the predecessor norma, which is the question actually asked', () => {
    const m = notYetInForce(norma, v('2005-02-16', null), '2000-01-01', [
      { tipo: 'ley', numero: '19366', titulo: 'Sanciona el tráfico ilícito…', idNorma: 30545 },
    ])
    expect(m).toContain('LEY 19366')
    expect(m).toContain('idNorma 30545')
  })
})

describe('availableLabels', () => {
  it('says the list is empty rather than rendering a bare ellipsis', () => {
    // The old form appended "…" unconditionally, so an empty list came back as
    // "Disponibles: …" — an ellipsis standing in for nothing.
    expect(availableLabels([])).not.toContain('…')
    expect(availableLabels([])).toContain('No hay artículos')
  })

  it('marks truncation only when it truncates', () => {
    expect(availableLabels(['articulo 1', 'articulo 2'])).toBe(
      'Disponibles (2): articulo 1, articulo 2',
    )
    const many = Array.from({ length: 45 }, (_, i) => `articulo ${i + 1}`)
    const out = availableLabels(many)
    expect(out).toContain('Disponibles (45)')
    expect(out).toContain('…y 5 más')
  })
})

describe('matchArticle', () => {
  // Labels and slugs exactly as the corpus stores them (normalizeLabel /
  // labelToSlug output), so the test exercises the real comparison.
  const arts = [
    { label: 'articulo 1', slug: 'art-1' },
    { label: 'articulo 22', slug: 'art-22' },
    { label: 'articulo 22 bis', slug: 'art-22-bis' },
    { label: 'articulo primero transitorio', slug: 'art-primero-transitorio' },
  ]

  it('accepts the spellings a lawyer writes', () => {
    // "Art. 22" is the citation form in every Chilean brief and used to fail
    // while "articulo 22" worked.
    for (const spelling of ['Art. 22', 'art. 22', 'art. 22\u00b0', 'Art\u00edculo 22', 'ART\u00cdCULO 22', 'articulo 22']) {
      expect(matchArticle(arts, spelling)?.slug).toBe('art-22')
    }
  })

  it('accepts a slug pasted out of a URL', () => {
    expect(matchArticle(arts, 'art-22')?.slug).toBe('art-22')
    expect(matchArticle(arts, 'articulo-22')?.slug).toBe('art-22')
  })

  it('prefers the exact label over a longer one that contains it', () => {
    // "articulo 22" must not resolve to "articulo 22 bis" just because the
    // substring pass would match it.
    expect(matchArticle(arts, 'Art. 22')?.slug).toBe('art-22')
    expect(matchArticle(arts, 'Art. 22 bis')?.slug).toBe('art-22-bis')
  })

  it('handles ordinal and transitory labels', () => {
    expect(matchArticle(arts, 'Art\u00edculo primero transitorio')?.slug)
      .toBe('art-primero-transitorio')
  })

  it('returns nothing when there is no such article', () => {
    expect(matchArticle(arts, 'Art. 999')).toBeUndefined()
    expect(matchArticle([], 'Art. 22')).toBeUndefined()
  })
})
