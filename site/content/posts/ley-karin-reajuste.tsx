import { normaHref } from '@/lib/href'
import { Callout, Ext, Facts, Figure, H2, NormaLink, P, Quote } from '@/components/seo/Editorial'

/** Every factual claim here traces to one of:
 *  - a corpus query run against the live DB on 2026-07-16, or
 *  - a cited public source (linked inline).
 *  Nothing about the legal effect of these norms is asserted beyond what their
 *  own text says. */
export default function Post() {
  return (
    <>
      <P>
        La Ley Karin —la Ley 21.643, que modificó el Código del Trabajo en materia de acoso
        laboral, sexual y violencia en el trabajo— se publicó el 15 de enero de 2024. Casi todo
        el mundo sabe eso. Lo que casi nadie sabe es que su texto cambió el 3 de enero de 2025,
        y que la norma que lo cambió no menciona el acoso laboral en su título.
      </P>

      <P>
        En nuestro corpus la Ley Karin tiene dos versiones. La segunda empieza el 3 de enero de
        2025 y el commit que la produce dice, literalmente:{' '}
        <code className="font-mono text-[13px] bg-paper-sunk px-1.5 py-0.5 rounded">
          Ley N°21724 publicada (2025-01-03)
        </code>
        .
      </P>

      <P>
        ¿Y qué es la Ley 21.724? Su título completo, tal como está en el corpus:
      </P>

      <Quote cite="Ley 21.724, Ministerio de Hacienda, publicada el 3 de enero de 2025.">
        Otorga reajuste general de remuneraciones a las y los trabajadores del sector público,
        concede aguinaldos que señala, concede otros beneficios que indica, y modifica diversos
        cuerpos legales.
      </Quote>

      <P>
        Una ley de reajuste de sueldos. El cambio a la Ley Karin viaja escondido en ese{' '}
        <em>«y modifica diversos cuerpos legales»</em> del final.
      </P>

      <Figure
        src="/blog/karin-rail.png"
        alt="Panel lateral del lector mostrando la versión 2025-01-03 de la Ley 21.643 como versión vigente, con «Ley N°21724 publicada (2025-01-03)» bajo el rótulo CAMBIOS y una cronología de dos versiones: 2024-01-15 (v1) y 2025-01-03 (v2)."
        caption="El lector atribuye cada versión a la norma que la causó. La versión vigente de la Ley Karin viene de la Ley 21.724."
        width={720}
        height={930}
        priority
      />

      <H2>Qué agregó exactamente</H2>

      <P>
        Comparando ambas versiones artículo por artículo, el cambio de contenido es uno solo: un
        artículo 6 nuevo, que no existía en el texto publicado en enero de 2024. Dice, en su
        primer inciso:
      </P>

      <Quote cite="Ley 21.643, artículo 6, texto vigente desde el 3 de enero de 2025.">
        En el marco de las actividades de vigilancia destinadas a la prevención de riesgos
        laborales, los organismos administradores del seguro de la ley N° 16.744 deberán remitir
        semestralmente a la Superintendencia de Seguridad Social, la cantidad de denuncias que han
        sido presentadas en los lugares de trabajo en materia de acoso laboral, sexual o de
        violencia en el trabajo, además del tipo de acciones y/o medidas adoptadas en cada una de
        ellas.
      </Quote>

      <P>
        El mismo artículo agrega que los empleadores quedan obligados a entregar la información que
        los organismos administradores les requieran para cumplir con lo anterior, y que la
        Superintendencia de Seguridad Social debe remitir un informe estadístico consolidado al
        Ministerio del Trabajo y Previsión Social y al Consejo Superior Laboral en enero y julio de
        cada año.
      </P>

      <Figure
        src="/blog/karin-art6.png"
        alt="Vista redline del lector: el artículo 6 de la Ley 21.643 aparece completo sobre fondo verde, la marca de texto añadido, con el inciso que obliga a remitir semestralmente a la Superintendencia de Seguridad Social la cantidad de denuncias por acoso laboral, sexual o violencia en el trabajo."
        caption="El artículo 6, en verde: texto que no existía en la versión de enero de 2024. La vista redline marca lo añadido al comparar ambas versiones."
        width={1376}
        height={1040}
      />

      <Callout>
        Una obligación semestral de reporte, para todos los empleadores del país, incorporada a la
        Ley Karin por una ley de reajuste del sector público. Si buscas «ley karin» hoy, vas a
        encontrar el texto vigente. Lo que no vas a encontrar es <em>cuándo</em> apareció ese
        artículo ni <em>qué</em> lo trajo.
      </Callout>

      <H2>No es un caso aislado</H2>

      <P>
        La Ley 21.806 —publicada el 5 de febrero de 2026, y cuyo título empieza otra vez con{' '}
        <em>«Otorga reajuste general de remuneraciones a las y los trabajadores del sector
        público»</em>— figura en el corpus modificando la{' '}
        <NormaLink href={normaHref('otras', '21719')}>Ley 21.719</NormaLink>, la de protección de
        datos personales.
      </P>

      <P>
        Dos leyes de reajuste, dos años seguidos, tocando cuerpos legales que no tienen nada que ver
        con remuneraciones del sector público. Las leyes de reajuste funcionan como vehículo: son
        de tramitación anual garantizada, así que arrastran modificaciones a otras normas.
      </P>

      <H2>Por qué esto es invisible en cualquier otro lado</H2>

      <P>
        Porque la unidad de publicación estándar es «el texto vigente». Un texto vigente es una
        foto: no tiene historia, no tiene autor y no tiene fecha de origen por artículo. Si sólo
        tienes la foto de hoy, la pregunta «¿desde cuándo dice esto?» no tiene respuesta.
      </P>

      <P>
        Este corpus reconstruye la ley chilena como un repositorio git: una publicación
        legislativa es un commit, y cada artículo tiene una ventana de vigencia. Eso convierte
        «¿qué cambió y quién lo cambió?» en una consulta, no en una investigación.
      </P>

      <Facts
        rows={[
          { k: 'Ley Karin', v: <NormaLink href={normaHref('otras', '21643')}>otras/21643 — publicada el 15 de enero de 2024</NormaLink> },
          { k: 'Versiones', v: '2 — la original y la vigente desde el 3 de enero de 2025' },
          { k: 'Causa del cambio', v: <NormaLink href={normaHref('ley', '21724')}>Ley 21.724 (Ministerio de Hacienda), publicada el 3 de enero de 2025</NormaLink> },
          { k: 'Cambio de contenido', v: 'Un artículo 6 nuevo: reporte semestral de denuncias a la Superintendencia de Seguridad Social' },
          { k: 'Cuerpos legales que modifica la Ley Karin', v: '5, con fecha 1 de agosto de 2024 — entre ellos el Código del Trabajo (DFL 1)' },
          { k: 'Verificado', v: 'Consultas al corpus el 16 de julio de 2026 (333.020 normas)' },
        ]}
      />

      <H2>Un detalle que cuadra</H2>

      <P>
        El artículo primero transitorio de la propia Ley Karin dice que la ley{' '}
        <em>«entrará en vigencia el primer día del sexto mes subsiguiente a su publicación en el
        Diario Oficial»</em>. Publicada el 15 de enero de 2024, eso da el 1 de agosto de 2024 — y
        es exactamente la fecha con la que el corpus registra sus modificaciones al Código del
        Trabajo y a los otros cuatro cuerpos legales. La fecha que informan el{' '}
        <Ext href="https://www.isl.gob.cl/ley-karin/">Instituto de Seguridad Laboral</Ext> y{' '}
        <Ext href="https://www.chileatiende.gob.cl/preguntas-frecuentes/ley-karin">ChileAtiende</Ext>{' '}
        es la misma. El texto de la ley predice su propia fecha de vigencia, y los datos lo
        confirman.
      </P>

      <P>
        Puedes ver las dos versiones de la Ley Karin, con el diff palabra por palabra, en{' '}
        <NormaLink href="/cambios/otras/21643">qué cambió la Ley 21.643</NormaLink>.
      </P>
    </>
  )
}
