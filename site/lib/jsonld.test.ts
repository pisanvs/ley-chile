import { describe, it, expect } from 'vitest'
import { legislationJsonLd, RESERVED_TIPOS } from './jsonld'
import type { Norma, Version } from './norma'

const LEY: Norma = {
  idNorma: 20330, tipo: 'ley', numero: '20330', titulo: 'LEY 20330',
  organismo: 'MINEDUC', derogado: false, fechaPublicacion: '2009-02-25', lawDir: 'leyes/20330',
}
const versions: Version[] = [
  { desde: '2009-02-25', hasta: '2011-01-01', commitSha: 'a', causaId: null, subject: '' },
  { desde: '2011-01-02', hasta: null, commitSha: 'b', causaId: 99, subject: '' },
]

describe('legislationJsonLd', () => {
  it('emits schema.org Legislation', () => {
    const ld = legislationJsonLd(LEY, '2011-01-02', versions, [99]) as Record<string, unknown>
    expect(ld['@type']).toBe('Legislation')
    expect(ld['legislationIdentifier']).toBe('20330')
    expect(ld['legislationDate']).toBe('2009-02-25')
  })

  it('marks a superseded version as not in force', () => {
    const ld = legislationJsonLd(LEY, '2009-02-25', versions, []) as Record<string, unknown>
    expect(ld['legislationLegalForce']).toBe('NotInForce')
  })

  it('marks the current version as in force', () => {
    const ld = legislationJsonLd(LEY, '2011-01-02', versions, []) as Record<string, unknown>
    expect(ld['legislationLegalForce']).toBe('InForce')
  })

  it('marks a derogated norma as not in force even at its current version', () => {
    const ld = legislationJsonLd({ ...LEY, derogado: true }, '2011-01-02', versions, [])
    expect((ld as Record<string, unknown>)['legislationLegalForce']).toBe('NotInForce')
  })

  it('lists modifying normas under legislationChanges', () => {
    const ld = legislationJsonLd(LEY, '2011-01-02', versions, [99, 100]) as Record<string, unknown>
    expect(ld['legislationChanges']).toHaveLength(2)
  })
})

describe('RESERVED_TIPOS', () => {
  it('protects app routes from the tipo namespace', () => {
    for (const r of ['buscar', 'api', 'sitemap', '_next']) {
      expect(RESERVED_TIPOS.has(r)).toBe(true)
    }
    expect(RESERVED_TIPOS.has('ley')).toBe(false)
  })
})
