import { describe, it, expect } from 'vitest'
import { loadOgFonts } from './fonts'

describe('loadOgFonts', () => {
  it('loads all five font buffers with correct metadata', async () => {
    const fonts = await loadOgFonts()
    expect(fonts).toHaveLength(5)
    for (const f of fonts) {
      expect(f.data.length).toBeGreaterThan(1000)
      expect(f.style).toBe('normal')
    }
    expect(fonts.map((f) => f.name)).toEqual([
      'Fraunces', 'Fraunces', 'Inter', 'Inter', 'JetBrains Mono',
    ])
    expect(fonts.map((f) => f.weight)).toEqual([600, 700, 400, 600, 500])
  })

  it('memoizes the promise across calls', () => {
    expect(loadOgFonts()).toBe(loadOgFonts())
  })
})
