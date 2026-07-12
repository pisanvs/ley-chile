import { describe, it, expect } from 'vitest'
import { canonicalPath, currentFecha, isMultiVersion, type Norma, type Version } from './norma'

const LEY: Norma = {
  idNorma: 20330, tipo: 'ley', numero: '20330', titulo: 'T',
  organismo: 'M', derogado: false, fechaPublicacion: '2009-02-25', lawDir: 'leyes/20330',
}
const v = (desde: string, hasta: string | null): Version =>
  ({ desde, hasta, commitSha: 'x', causaId: null, subject: '' })

describe('currentFecha', () => {
  it('returns the desde of the open-ended version', () => {
    expect(currentFecha([v('2000-01-01', '2009-12-31'), v('2010-01-01', null)])).toBe('2010-01-01')
  })
  it('falls back to the latest desde when none is open-ended', () => {
    expect(currentFecha([v('2000-01-01', '2001-01-01')])).toBe('2000-01-01')
  })
})

describe('isMultiVersion', () => {
  it('is false for the ~97% of normas with one version', () => {
    expect(isMultiVersion([v('2000-01-01', null)])).toBe(false)
  })
  it('is true when there is more than one', () => {
    expect(isMultiVersion([v('2000-01-01', '2009-12-31'), v('2010-01-01', null)])).toBe(true)
  })
})

describe('canonicalPath', () => {
  const single = [v('2009-02-25', null)]
  const multi = [v('2009-02-25', '2011-01-01'), v('2011-01-02', null)]

  it('points a single-version dated URL at the undated one', () => {
    // /ley/20330 and /ley/20330/2009-02-25 are byte-identical: duplicate content
    expect(canonicalPath(LEY, '2009-02-25', single)).toBe('/ley/20330')
  })

  it('lets a multi-version dated URL be self-canonical', () => {
    expect(canonicalPath(LEY, '2009-02-25', multi)).toBe('/ley/20330/2009-02-25')
  })

  it('points the current version of a multi-version norma at the undated URL', () => {
    expect(canonicalPath(LEY, '2011-01-02', multi)).toBe('/ley/20330')
  })
})
