import { normaHref } from '@/lib/href'
import { Callout, Ext, Facts, Figure, H2, NormaLink, P } from '@/components/seo/Editorial'

/** Corpus facts verified 2026-07-16. External facts (the 1-dic-2026 full-force
 *  date) are attributed to their source rather than asserted by us — the corpus
 *  does not carry that date, and inventing it would be exactly the failure mode
 *  this site exists to avoid. */
export default function Post() {
  return (
    <>
      <P>
        La <NormaLink href={normaHref('otras', '21719')}>Ley 21.719</NormaLink> regula la
        protección y el tratamiento de los datos personales y crea la Agencia de Protección de
        Datos Personales. La publicó el Ministerio Secretaría General de la Presidencia el 13 de
        diciembre de 2024. Según la{' '}
        <Ext href="https://www.bcn.cl/leychile/navegar?idNorma=1209272">
          Biblioteca del Congreso Nacional
        </Ext>
        , su régimen pleno comienza el 1 de diciembre de 2026, tras un período de transición.
      </P>

      <P>
        Hay un detalle que se pierde en toda la cobertura: la ley ya fue modificada dos veces antes
        de aplicarse del todo.
      </P>

      <H2>Lo que registra el corpus</H2>

      <P>
        El grafo de modificaciones tiene dos aristas apuntando a la Ley 21.719:
      </P>

      <Facts
        rows={[
          {
            k: 'Ley 21.755',
            v: (
              <>
                <NormaLink href={normaHref('ley', '21755')}>
                  Modifica cuerpos legales que indica en materia de simplificación
                </NormaLink>{' '}
                — 11 de julio de 2025
              </>
            ),
          },
          {
            k: 'Ley 21.806',
            v: (
              <>
                <NormaLink href={normaHref('ley', '21806')}>
                  Otorga reajuste general de remuneraciones a las y los trabajadores del sector
                  público
                </NormaLink>{' '}
                — 5 de febrero de 2026
              </>
            ),
          },
        ]}
      />

      <P>
        La segunda merece una relectura: la ley anual de reajuste de sueldos del sector público
        figura modificando la ley de protección de datos personales. No es un error del corpus, es
        cómo se legisla — las leyes de reajuste tienen tramitación anual asegurada y terminan
        arrastrando cambios a normas sin relación con remuneraciones. Le pasó lo mismo a la{' '}
        <NormaLink href="/blog/ley-karin-reajuste">Ley Karin, con la ley de reajuste anterior</NormaLink>.
      </P>

      <H2>Una ley, una versión, dos modificaciones</H2>

      <P>
        Acá aparece algo honesto que vale la pena decir: el corpus guarda{' '}
        <strong className="text-ink">una sola versión</strong> del texto de la Ley 21.719, la del
        13 de diciembre de 2024, y al mismo tiempo registra esas dos normas modificándola. No es
        una contradicción: una modificación puede estar publicada y todavía no haber producido un
        texto vigente distinto, típicamente porque opera sobre disposiciones cuya vigencia aún no
        llega.
      </P>

      <Callout>
        Qué significa para ti: el texto de la Ley 21.719 que leas hoy —acá o en cualquier otro
        lado— es el publicado en diciembre de 2024. Si tu decisión depende de la letra exacta que
        regirá desde diciembre de 2026, el texto de hoy no es suficiente, y ninguna fuente que
        publique «el texto vigente» te va a avisar de la diferencia.
      </Callout>

      <Figure
        src="/blog/datos-21719.png"
        alt="El lector mostrando la Ley 21.719 con el encabezado «OTRAS · Nº 21719 · 2024-12-13»: regula la protección y el tratamiento de los datos personales y crea la Agencia de Protección de Datos Personales, del Ministerio Secretaría General de la Presidencia. El selector de vista no ofrece redline, porque no hay una segunda versión con la cual comparar."
        caption="Una sola versión, la del 13 de diciembre de 2024: el lector no ofrece redline porque no hay nada con qué comparar todavía."
        width={1568}
        height={1800}
      />

      <H2>El régimen anterior sigue ahí</H2>

      <P>
        La Ley 21.719 no aparece en el vacío: sustituye el esquema de la{' '}
        <NormaLink href={normaHref('ley', '19628')}>Ley 19.628</NormaLink>, sobre protección de la
        vida privada, de 1999. Esa ley tiene 117 artículos y 6 versiones en el corpus, y para
        cualquier hecho anterior a la entrada en vigencia del nuevo régimen sigue siendo la norma
        que hay que leer — en la versión que regía en la fecha del hecho, no en la última.
      </P>

      <Facts
        rows={[
          { k: 'Ley 21.719', v: 'otras/21719 · id_norma 1209272 · publicada el 13 de diciembre de 2024 · 91 artículos · 1 versión · 2 normas modificadoras' },
          { k: 'Ley 19.628', v: 'ley/19628 · publicada en 1999 · 117 artículos · 6 versiones · 5 normas modificadoras' },
          { k: 'Verificado', v: 'Consultas al corpus el 16 de julio de 2026 (333.020 normas)' },
          { k: 'Fecha de vigencia plena', v: 'No la afirma el corpus. Atribuida a la BCN (enlace arriba).' },
        ]}
      />

      <P>
        Nota sobre la URL: la Ley 21.719 vive en{' '}
        <code className="font-mono text-[13px] bg-paper-sunk px-1.5 py-0.5 rounded">/otras/21719</code>
        , no en <code className="font-mono text-[13px] bg-paper-sunk px-1.5 py-0.5 rounded">/ley/21719</code>.
        La BCN clasifica unas 700 leyes reales bajo el tipo <em>otras</em>, y nosotros preservamos
        su clasificación en vez de inventar una propia. Si llegas por el camino equivocado, el sitio
        te redirige.
      </P>

      <P>
        Para el detalle completo: <NormaLink href="/guia/otras/21719">qué dice la Ley 21.719</NormaLink>{' '}
        o el <NormaLink href="/temas/datos-personales">tema de protección de datos personales</NormaLink>.
      </P>
    </>
  )
}
