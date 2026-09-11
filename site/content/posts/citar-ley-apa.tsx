import Link from 'next/link'

import { normaHref } from '@/lib/href'
import { Callout, Facts, H2, NormaLink, P } from '@/components/seo/Editorial'

/** Targets "cómo citar una ley en APA" and "citar ley APA 7", the highest-volume
 *  variants. Deliberately honest that APA does not settle the Chilean case —
 *  a guide that pretends otherwise gets students marked down. */
export default function Post() {
  return (
    <>
      <P>
        APA 7 dedica un capítulo entero a materiales legales, y casi todo él describe el sistema
        estadounidense. Para legislación de otros países la norma dice, en resumen, que se siga la
        convención local adaptada al formato APA. Eso deja al estudiante chileno sin una regla
        explícita. Esto es lo más cercano a una.
      </P>

      <H2>La estructura</H2>

      <P>
        APA ordena una referencia en cuatro bloques: quién, cuándo, qué y dónde. Aplicado a una
        norma chilena, el «quién» y el «qué» se funden en el nombre de la norma, el «cuándo» es la
        publicación en el Diario Oficial, y el «dónde» es la URL.
      </P>

      <Facts
        rows={[
          { k: 'Autor / título', v: 'Ley N° 21.719' },
          { k: 'Fecha', v: '(2024, 26 de agosto)' },
          { k: 'Fuente', v: 'Diario Oficial de la República de Chile' },
          { k: 'URL', v: 'https://leyes.pisanvs.cl/…' },
        ]}
      />

      <P>Queda así, para la referencia de la{' '}
        <NormaLink href={normaHref('ley', '21719')}>Ley 21.719</NormaLink>:
      </P>

      <Facts
        rows={[
          {
            k: 'Referencia',
            v: 'Ley N° 21.719. (2024, 26 de agosto). Diario Oficial de la República de Chile. https://leyes.pisanvs.cl/…',
          },
          { k: 'Cita en el texto', v: '(Ley N° 21.719, 2024)' },
        ]}
      />

      <H2>Citar un artículo</H2>

      <P>
        El artículo va junto al nombre de la norma, no como número de página:
      </P>

      <Facts
        rows={[
          {
            k: 'Referencia',
            v: 'Ley N° 21.719, art. 12. (2024, 26 de agosto). Diario Oficial de la República de Chile. https://…',
          },
          { k: 'Cita en el texto', v: '(Ley N° 21.719, art. 12, 2024)' },
        ]}
      />

      <H2>Los puntos en el número</H2>

      <P>
        En Chile los números de ley se escriben con separador de miles: «Ley N° 21.719», no «Ley N°
        21719». Es la forma que usa el propio Diario Oficial, y la que espera cualquier lector
        chileno.
      </P>

      <H2>Lo que APA no resuelve</H2>

      <Callout>
        Nada de lo anterior es una regla oficial de APA para normas chilenas, porque esa regla no
        existe. Es una lectura defendible del estándar. Si tu facultad publica una guía propia, esa
        guía manda.
      </Callout>

      <P>
        Hay además un problema que APA no contempla en absoluto: el texto de una ley cambia. APA
        asume que una fuente publicada es estable, y una ley no lo es. Si tu trabajo analiza un
        hecho anterior a una reforma, la referencia debería indicar qué versión leíste — algo que
        ningún estándar internacional pide todavía, pero que cualquier lector agradece. Lo tratamos
        en{' '}
        <Link href="/blog/citar-version-historica">
          cómo citar la versión de una ley que ya no rige
        </Link>
        .
      </P>

      <H2>Generarla automáticamente</H2>

      <P>
        <Link href="/citar">La herramienta de citación</Link> entrega la referencia APA de
        cualquier norma chilena, y también BibTeX y RIS si trabajas con Zotero o Mendeley. La guía
        completa, con los otros formatos, está en{' '}
        <Link href="/blog/citar-ley-chilena">cómo citar una ley chilena</Link>.
      </P>
    </>
  )
}
