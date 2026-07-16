import { normaHref } from '@/lib/href'
import { Callout, Facts, Figure, H2, NormaLink, P } from '@/components/seo/Editorial'

/** Product use-case post. The version list quoted here comes from a corpus query
 *  on 2026-07-16; the screenshots are of the live site. */
export default function Post() {
  return (
    <>
      <P>
        Supongamos que revisas un contrato de consumo firmado en marzo de 2013 y quieres saber qué
        decía la ley del consumidor en ese momento. Buscas «ley 19496», entras al primer resultado
        y lees el texto. El texto que lees es el de hoy. No sirve.
      </P>

      <P>
        La <NormaLink href={normaHref('ley', '19496')}>Ley 19.496</NormaLink>, que establece normas
        sobre protección de los derechos de los consumidores, se publicó el 7 de marzo de 1997 y ha
        cambiado nueve veces. Estas son las nueve, con la norma que causó cada una:
      </P>

      <Facts
        rows={[
          { k: '1997-03-07', v: 'Texto original — Ley 19.496 publicada' },
          { k: '2010-02-03', v: 'Ley 20.416' },
          { k: '2011-10-21', v: 'Ley 20.543' },
          { k: '2013-12-13', v: 'Ley 20.715' },
          { k: '2014-06-09', v: 'Ley 20.756' },
          { k: '2016-08-30', v: 'Ley 20.945' },
          { k: '2018-01-08', v: 'Ley 21.062' },
          { k: '2020-09-08', v: 'Ley 21.236' },
          { k: '2021-04-20', v: 'Ley 21.320 — texto vigente' },
        ]}
      />

      <P>
        Un contrato de marzo de 2013 se rige por el texto que empezó el 21 de octubre de 2011 y
        terminó el 12 de diciembre de 2013. Ese texto no está publicado en ninguna parte como
        documento; hay que reconstruirlo. Eso es exactamente lo que hace este sitio.
      </P>

      <H2>La URL es la fecha</H2>

      <P>
        Cada versión de cada norma tiene su propia dirección. El patrón es{' '}
        <code className="font-mono text-[13px] bg-paper-sunk px-1.5 py-0.5 rounded">
          /{'{tipo}'}/{'{numero}'}/{'{AAAA-MM-DD}'}
        </code>
        . Para la ley del consumidor en la versión que regía en marzo de 2013:
      </P>

      <P>
        <NormaLink href={normaHref('ley', '19496', '2011-10-21')}>
          leyes.pisanvs.cl/ley/19496/2011-10-21
        </NormaLink>
      </P>

      <P>
        Sin fecha, la URL te da la versión vigente. Con fecha, te da el texto que regía desde ese
        día. No hay un selector escondido ni un PDF que descargar: la fecha es parte de la
        dirección, así que la puedes guardar, citar y compartir.
      </P>

      <Figure
        src="/blog/consumidor-fecha.png"
        alt="Panel lateral del lector en /ley/19496/2011-10-21: la versión 2011-10-21 aparece rotulada «Versión histórica», atribuida a «Ley N°20543 publicada (2011-10-21)», junto a la cronología completa de la Ley 19.496 con sus nueve versiones desde 1997-03-07 hasta 2021-04-20, con la v3 marcada como la que estás leyendo."
        caption="La ley del consumidor tiene nueve versiones. La URL con fecha te deja en la tercera: la que regía en marzo de 2013."
        width={720}
        height={1282}
        priority
      />

      <H2>Ver el cambio, no sólo el resultado</H2>

      <P>
        Saber qué decía la ley en 2011 es útil. Saber <em>qué se cambió</em> en 2013 suele ser más
        útil todavía, porque ahí está el argumento. El lector compara dos versiones palabra por
        palabra: lo eliminado en rojo tachado, lo agregado en verde.
      </P>

      <Callout>
        La regla práctica: para juzgar un hecho, usa el texto que regía cuando ocurrió el hecho, no
        el de hoy. Para argumentar sobre el sentido de una norma, mira el diff que la dejó como
        está.
      </Callout>

      <H2>Tres formas de llegar al mismo dato</H2>

      <P>
        <strong className="text-ink">En el navegador.</strong> Escribe la URL con la fecha, o abre
        la norma y usa la línea de tiempo de versiones. Cada guía —por ejemplo{' '}
        <NormaLink href="/guia/ley/19496">qué dice la Ley 19.496</NormaLink>— lista todas sus
        versiones con la causa de cada una.
      </P>

      <P>
        <strong className="text-ink">Desde un agente.</strong> El sitio expone un servidor MCP de
        sólo lectura en{' '}
        <code className="font-mono text-[13px] bg-paper-sunk px-1.5 py-0.5 rounded">
          /api/mcp
        </code>
        , con herramientas como <code className="font-mono text-[13px]">list_versions</code>,{' '}
        <code className="font-mono text-[13px]">get_article</code> y{' '}
        <code className="font-mono text-[13px]">diff_versions</code>. Un modelo puede preguntar
        «qué decía el artículo 3 de la ley del consumidor en 2013» y recibir el texto correcto, no
        el de hoy.
      </P>

      <P>
        <strong className="text-ink">Con git.</strong> La fuente de verdad es un repositorio: una
        publicación legislativa, un commit. Si quieres el corpus completo, se clona.
      </P>

      <P>
        El punto de fondo es simple. La ley no es un documento, es un historial. Tratarla como un
        documento es lo que hace que la pregunta «¿qué decía en 2013?» sea difícil, cuando debería
        ser una URL.
      </P>
    </>
  )
}
