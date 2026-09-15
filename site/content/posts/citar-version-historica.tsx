import Link from 'next/link'

import { CITE_FORMATS } from '@/lib/cite'
import { normaHref } from '@/lib/href'
import { Callout, Facts, H2, NormaLink, P } from '@/components/seo/Editorial'

/** The post only this corpus can write. Targets "citar una ley derogada",
 *  "citar versión anterior de una ley" and the long tail around them — low
 *  volume individually, but no competition and perfect intent. */
export default function Post() {
  return (
    <>
      <P>
        Una cita apunta a un texto. El problema es que el texto de una ley no es uno: es una serie.
        El <NormaLink href="/norma/1984">Código Penal</NormaLink> ha tenido 122 redacciones
        distintas desde 1874. Citar «el Código Penal» sin más es citar una de ellas sin decir cuál.
      </P>

      <P>
        Para la mayoría de los trabajos eso da igual, porque se comenta la ley vigente. Deja de dar
        igual en cuanto el trabajo analiza un hecho del pasado — que es casi todo el derecho.
      </P>

      <H2>El error, concretamente</H2>

      <P>
        Supón que analizas un despido de 2019 y citas el artículo 161 del{' '}
        <NormaLink href="/norma/207436">Código del Trabajo</NormaLink>. Tu lector
        sigue el enlace, llega al texto de hoy, y lee una redacción que en 2019 no existía. Tu
        argumento se apoya en un texto; tu cita entrega otro. Nadie mintió, pero la cita no prueba
        lo que dice probar.
      </P>

      <Callout>
        Esto no es hipotético. Casi todos los sitios legales — incluido el oficial — muestran
        únicamente el texto vigente. Un enlace a una ley es, en la práctica, un enlace a su versión
        de hoy, sea cual sea la fecha del hecho que comentas.
      </Callout>

      <H2>Qué debería incluir la cita</H2>

      <P>
        Ningún estándar internacional lo exige todavía, pero la información necesaria es simple: la
        norma, el artículo, y la fecha de la versión que leíste.
      </P>

      <Facts
        rows={[
          {
            k: 'Incompleta',
            v: 'Ley N° 19.496, art. 3, Diario Oficial, 7 de marzo de 1997.',
          },
          {
            k: 'Completa',
            v: 'Ley N° 19.496, art. 3, texto vigente al 13 de diciembre de 2013, Diario Oficial, 7 de marzo de 1997.',
          },
        ]}
      />

      <P>
        La primera indica cuándo se publicó la ley. La segunda indica qué texto leíste — que es lo
        que a tu lector le hace falta para verificarte.
      </P>

      <H2>Cómo saber qué versión corresponde</H2>

      <P>
        La <NormaLink href={normaHref('ley', '19496')}>ley del consumidor</NormaLink> tiene nueve
        versiones. Para un contrato firmado en marzo de 2013, la que regía es la que empezó el 21 de
        octubre de 2011 y terminó el 12 de diciembre de 2013:
      </P>

      <Facts
        rows={[
          { k: '2011-10-21 → 2013-12-12', v: 'La versión que regía en marzo de 2013' },
          { k: '2013-12-13 → 2014-06-08', v: 'Ley 20.715 ya la había modificado' },
        ]}
      />

      <P>
        En el lector, cada versión tiene su propia URL con la fecha, así que el enlace que copias
        apunta al texto correcto y sigue apuntando ahí cuando la ley vuelva a cambiar.
      </P>

      <H2>Leyes derogadas</H2>

      <P>
        Una ley derogada no desaparece: sigue siendo la norma aplicable a los hechos ocurridos
        mientras regía. Se cita igual, indicando la versión, y conviene señalar la derogación
        cuando es relevante para el argumento.
      </P>

      <H2>Hacerlo sin pensarlo</H2>

      <P>
        En <Link href="/citar">la herramienta de citación</Link> puedes elegir la versión y copiar
        la cita ya fechada, en cualquiera de los {CITE_FORMATS.length} formatos. La guía general está en{' '}
        <Link href="/blog/citar-ley-chilena">cómo citar una ley chilena</Link>, y el detalle de APA
        en <Link href="/blog/citar-ley-apa">cómo citar una ley en APA 7</Link>.
      </P>
    </>
  )
}
