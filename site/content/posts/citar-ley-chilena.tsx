import Link from 'next/link'

import { normaHref } from '@/lib/href'
import { Callout, Facts, H2, NormaLink, P } from '@/components/seo/Editorial'

/** Hub of the citation cluster. Targets "cómo citar una ley chilena" and its
 *  variants; the APA-specific and version-specific posts link back here.
 *
 *  Every example is a real norma, and the numbers (227 DFL 1, 525 DTO 1, 122
 *  versions of the Código Penal, 3,703 undated normas) come from corpus queries
 *  on 2026-09-10. */
export default function Post() {
  return (
    <>
      <P>
        Citar una ley chilena parece trivial hasta que hay que hacerlo bien. El número no
        identifica la norma, el texto cambia con los años, y ni APA ni MLA dicen con claridad qué
        hacer con legislación chilena. Esta guía resuelve los cuatro casos que aparecen de verdad.
      </P>

      <H2>La cita legal chilena</H2>

      <P>
        El uso chileno cita la norma, el artículo cuando corresponde, el Diario Oficial y la fecha
        de publicación. Para la{' '}
        <NormaLink href={normaHref('ley', '21719')}>Ley 21.719</NormaLink>, sobre protección de
        datos personales:
      </P>

      <Facts
        rows={[
          { k: 'Norma completa', v: 'Ley N° 21.719, Diario Oficial, 26 de agosto de 2024.' },
          { k: 'Un artículo', v: 'Ley N° 21.719, art. 12, Diario Oficial, 26 de agosto de 2024.' },
        ]}
      />

      <P>
        Es la forma que no está en disputa. Si tu facultad no exige un estándar internacional,
        usa esta.
      </P>

      <H2>APA, MLA y Chicago</H2>

      <P>
        Los tres estándares fueron escritos pensando en legislación estadounidense y remiten a la
        convención local para el resto. No existe una versión oficial para normas chilenas, así que
        lo que sigue es una lectura razonable de cada uno, no una regla:
      </P>

      <Facts
        rows={[
          {
            k: 'APA 7',
            v: 'Ley N° 21.719, art. 12. (2024, 26 de agosto). Diario Oficial de la República de Chile. https://…',
          },
          {
            k: 'MLA 9',
            v: '"Ley N° 21.719, art. 12." Diario Oficial de la República de Chile, 26 ago. 2024, leyes.pisanvs.cl/…',
          },
          {
            k: 'Chicago',
            v: 'Ley N° 21.719, art. 12, Diario Oficial, 26 de agosto de 2024, https://…',
          },
        ]}
      />

      <Callout>
        Antes de entregar un trabajo, revisa la guía de tu facultad. Varias escuelas de derecho
        chilenas tienen reglas propias que priman sobre APA o MLA, y ninguna de las tres normas
        internacionales zanja el caso chileno.
      </Callout>

      <H2>El número no identifica la norma</H2>

      <P>
        Este es el error que más se repite, y no es evidente. En el corpus chileno hay{' '}
        <strong>227 normas llamadas «DFL 1»</strong> y <strong>525 llamadas «DTO 1»</strong>, de
        distintos ministerios y distintos años. «DFL 1» no es una cita: es una familia de normas.
      </P>

      <P>
        Una cita de un decreto o un DFL tiene que incluir el organismo y el año, o bien el
        identificador único de la norma. Sin eso, quien lea tu trabajo no puede llegar al texto que
        leíste.
      </P>

      <H2>El texto cambia, y la cita apunta a un texto</H2>

      <P>
        El <NormaLink href="/norma/1984">Código Penal</NormaLink> tiene 122 versiones
        desde 1874. La <NormaLink href={normaHref('ley', '19496')}>ley del consumidor</NormaLink>,
        nueve. Si tu trabajo analiza un hecho de 2015 y tu cita enlaza al texto vigente hoy, la
        cita contradice lo que estás comentando.
      </P>

      <P>
        Una cita completa indica la versión. Es el caso que casi ninguna guía cubre, y el que más
        importa en trabajos que analizan hechos pasados. Lo desarrollamos en{' '}
        <Link href="/blog/citar-version-historica">
          cómo citar la versión de una ley que ya no rige
        </Link>
        .
      </P>

      <H2>Normas sin fecha</H2>

      <P>
        3.703 normas del corpus no tienen fecha de publicación registrada. Cuando falta, APA y MLA
        usan «s. f.» (sin fecha). Inventar una fecha aproximada es peor que declarar que no se
        conoce.
      </P>

      <H2>Hazlo automáticamente</H2>

      <P>
        En <Link href="/citar">la herramienta de citación</Link> puedes buscar cualquier norma,
        elegir la versión, y copiar la cita en los nueve formatos. Dentro del lector, cada artículo
        tiene un botón «citar» que hace lo mismo para ese artículo en particular.
      </P>
    </>
  )
}
