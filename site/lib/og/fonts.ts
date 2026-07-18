import { readFile } from 'node:fs/promises'
import path from 'node:path'

export interface OgFont {
  name: string
  data: Buffer
  weight: 400 | 500 | 600 | 700
  style: 'normal'
}

async function loadFont(relPath: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), relPath))
}

let fontsPromise: Promise<OgFont[]> | null = null

/** Loads the OG-card font set once per server process and caches the promise.
 *  satori needs real font bytes (TTF/OTF/WOFF), not CSS font-family names, and
 *  Railway runs this service as a single long-lived replica, so re-reading
 *  these files on every image request would be wasted I/O. */
export function loadOgFonts(): Promise<OgFont[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      loadFont('public/fonts/fraunces-600.woff'),
      loadFont('public/fonts/fraunces-700.woff'),
      loadFont('public/fonts/inter-400.woff'),
      loadFont('public/fonts/inter-600.woff'),
      loadFont('public/fonts/jetbrains-mono-500.woff'),
    ]).then(([fraunces600, fraunces700, inter400, inter600, mono500]) => [
      { name: 'Fraunces', data: fraunces600, weight: 600 as const, style: 'normal' as const },
      { name: 'Fraunces', data: fraunces700, weight: 700 as const, style: 'normal' as const },
      { name: 'Inter', data: inter400, weight: 400 as const, style: 'normal' as const },
      { name: 'Inter', data: inter600, weight: 600 as const, style: 'normal' as const },
      { name: 'JetBrains Mono', data: mono500, weight: 500 as const, style: 'normal' as const },
    ])
  }
  return fontsPromise
}
