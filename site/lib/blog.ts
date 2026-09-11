import type { ComponentType } from 'react'
import KarinReajuste from '@/content/posts/ley-karin-reajuste'
import LeerEnFecha from '@/content/posts/leer-la-ley-en-una-fecha'
import Datos21719 from '@/content/posts/ley-21719-datos-personales'
import CitarLeyChilena from '@/content/posts/citar-ley-chilena'
import CitarLeyApa from '@/content/posts/citar-ley-apa'
import CitarVersionHistorica from '@/content/posts/citar-version-historica'

export interface PostMeta {
  slug: string
  title: string
  /** The <meta name=description> and the index blurb. One sentence, no hype. */
  description: string
  published: string
  modified?: string
  /** Shown under the title. Answers "why should I read this". */
  standfirst: string
  tags: string[]
}

export interface Post extends PostMeta {
  Body: ComponentType
}

/** Posts are TSX modules, statically imported — no filesystem walk at runtime.
 *  Railway builds the standalone output; an fs-based loader would need the
 *  content directory traced into the bundle, which is a footgun for no gain at
 *  this volume. Adding a post = a file plus a line here. */
export const POSTS: Post[] = [
  {
    slug: 'citar-ley-chilena',
    title: 'Cómo citar una ley chilena: guía con ejemplos',
    description:
      'El formato legal chileno, APA 7, MLA 9 y Chicago, con ejemplos reales. Incluye cómo citar un artículo, por qué «DFL 1» no identifica una norma, y qué hacer cuando el texto cambió.',
    standfirst:
      'El número no identifica la norma, el texto cambia con los años, y ni APA ni MLA dicen qué hacer con legislación chilena. Los cuatro casos que aparecen de verdad.',
    published: '2026-09-10',
    tags: ['citación', 'APA', 'guía'],
    Body: CitarLeyChilena,
  },
  {
    slug: 'citar-ley-apa',
    title: 'Cómo citar una ley chilena en APA 7',
    description:
      'APA dedica un capítulo a materiales legales y casi todo describe el sistema estadounidense. Esto es lo más cercano a una regla para normas chilenas, con referencia y cita en el texto.',
    standfirst:
      'APA remite a «la convención local» para legislación extranjera. Eso deja al estudiante chileno sin regla explícita.',
    published: '2026-09-10',
    tags: ['citación', 'APA', 'guía'],
    Body: CitarLeyApa,
  },
  {
    slug: 'citar-version-historica',
    title: 'Cómo citar la versión de una ley que ya no rige',
    description:
      'El Código Penal tiene 122 redacciones distintas desde 1874. Si tu trabajo analiza un hecho de 2019 y tu cita enlaza al texto de hoy, la cita no prueba lo que dice probar.',
    standfirst:
      'Una cita apunta a un texto. El texto de una ley no es uno: es una serie. Citar sin la fecha es citar una versión sin decir cuál.',
    published: '2026-09-10',
    tags: ['citación', 'versiones', 'corpus'],
    Body: CitarVersionHistorica,
  },
  {
    slug: 'ley-karin-reajuste',
    title: 'La ley que modificó la Ley Karin era una ley de reajuste de sueldos',
    description:
      'La Ley Karin cambió el 3 de enero de 2025. La norma que la cambió no habla de acoso laboral: otorga el reajuste del sector público. Cómo se ve eso en un corpus con control de versiones.',
    standfirst:
      'Un artículo nuevo apareció en la Ley Karin casi un año después de su publicación. Lo trajo una ley de reajuste de remuneraciones. Es un patrón, y se repite.',
    published: '2026-07-16',
    tags: ['ley karin', 'diffs', 'corpus'],
    Body: KarinReajuste,
  },
  {
    slug: 'leer-la-ley-en-una-fecha',
    title: 'Cómo leer la ley que realmente regía en una fecha exacta',
    description:
      'El texto vigente de una ley no sirve para juzgar un hecho de 2015. La ley del consumidor tiene 9 versiones. Así se lee la que corresponde.',
    standfirst:
      'Todo sitio legal te muestra el texto de hoy. Para un contrato de 2013 o un despido de 2019, ese texto es el equivocado.',
    published: '2026-07-16',
    tags: ['uso', 'versiones', 'ley del consumidor'],
    Body: LeerEnFecha,
  },
  {
    slug: 'ley-21719-datos-personales',
    title: 'Ley 21.719: dos normas ya la modificaron antes de entrar en vigencia',
    description:
      'La ley de datos personales se publicó en diciembre de 2024 y su régimen pleno parte en diciembre de 2026. El corpus ya registra dos normas modificándola.',
    standfirst:
      'Una ley puede cambiar antes de aplicarse. El corpus lo registra; el texto único que publica cualquier buscador, no.',
    published: '2026-07-16',
    tags: ['datos personales', 'vigencia', 'corpus'],
    Body: Datos21719,
  },
]

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug)
}

/** Newest first. */
export function listPosts(): Post[] {
  return [...POSTS].sort((a, b) => b.published.localeCompare(a.published))
}
