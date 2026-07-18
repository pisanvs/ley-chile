import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadOgFonts } from '../lib/og/fonts'
import { renderLawCardEditorial, renderLawCardStamp, renderLawCardSplit } from '../lib/og/variants'
import type { LawCardProps } from '../lib/og/card'

// Representative sample data (Ley 21.719, protección de datos personales) —
// hand-written, not fetched from the DB: this script only compares visual
// templates, it isn't a data-correctness check.
const SAMPLE: LawCardProps = {
  kicker: 'LEY',
  tipoLabel: 'Ley',
  numeroLabel: '21.719',
  titulo: 'Sobre protección y tratamiento de los datos personales',
  organismo: 'Ministerio Secretaría General de la Presidencia',
  fechaPublicacion: '13 de diciembre de 2024',
  derogado: false,
  versions: 1,
  articles: 44,
}

const VARIANTS = [
  ['editorial', renderLawCardEditorial],
  ['stamp', renderLawCardStamp],
  ['split', renderLawCardSplit],
] as const

async function main() {
  const outDir = process.argv[2]
  if (!outDir) {
    console.error('usage: tsx scripts/render-og-samples.ts <output-dir>')
    process.exit(1)
  }
  const fonts = await loadOgFonts()
  for (const [name, render] of VARIANTS) {
    const svg = await satori(render(SAMPLE), { width: 1200, height: 630, fonts })
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
    const outPath = path.join(outDir, `og-sample-${name}.png`)
    await writeFile(outPath, png)
    console.log(`wrote ${outPath} (${png.length} bytes)`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
