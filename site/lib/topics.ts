/** Curated topic hubs.
 *
 *  The research finding that drives this file: Chileans search the colloquial
 *  name, not the number — "ley karin" vastly outweighs "ley 21643", "ley de
 *  arriendo" outweighs "ley 18101". No algorithm in the corpus knows that Ley
 *  21.643 is "la ley Karin"; that mapping is human knowledge, so it is curated
 *  here by hand rather than generated.
 *
 *  Rules for entries:
 *  - Every `refs` entry MUST exist in the corpus at that exact (tipo, numero).
 *    Verified against the live DB on 2026-07-16. Note the `otras` tipo: BCN
 *    files ~700 real leyes there, so Ley Karin is otras/21643, not ley/21643.
 *  - `note` states what the norma IS, from its own title/corpus metadata. It
 *    never characterises legal effect beyond that — an invented claim about
 *    Chilean law is a liability, and this file is not a legal source.
 */

export interface TopicRef {
  tipo: string
  numero: string
  /** Why this norma is on this hub. Grounded in its corpus title. */
  note: string
}

export interface Topic {
  slug: string
  /** The query, basically. Used as the H1 and the <title> stem. */
  title: string
  /** Colloquial names people type. Rendered as prose, not a keyword dump. */
  aka: string[]
  intro: string
  refs: TopicRef[]
}

export const TOPICS: Topic[] = [
  {
    slug: 'ley-karin',
    title: 'Ley Karin: acoso laboral, acoso sexual y violencia en el trabajo',
    aka: ['ley karin', 'ley 21643', 'ley de acoso laboral'],
    intro:
      'La Ley Karin es la Ley 21.643, publicada el 15 de enero de 2024. Su título oficial es «Modifica el Código del Trabajo y otros cuerpos legales, en materia de prevención, investigación y sanción del acoso laboral, sexual o de violencia en el trabajo». En el corpus está archivada como otras/21643, no como ley/21643.',
    refs: [
      { tipo: 'otras', numero: '21643', note: 'La ley misma. Dos versiones: la original y la vigente desde el 3 de enero de 2025.' },
      { tipo: 'dfl', numero: '1', note: 'El Código del Trabajo, uno de los cinco cuerpos legales que la Ley Karin modifica con fecha 1 de agosto de 2024.' },
    ],
  },
  {
    slug: 'datos-personales',
    title: 'Ley 21.719: protección y tratamiento de datos personales',
    aka: ['ley 21719', 'ley de datos personales', 'nueva ley de datos chile'],
    intro:
      'La Ley 21.719 regula la protección y el tratamiento de los datos personales y crea la Agencia de Protección de Datos Personales. Fue publicada el 13 de diciembre de 2024 por el Ministerio Secretaría General de la Presidencia. El corpus la archiva como otras/21719.',
    refs: [
      { tipo: 'otras', numero: '21719', note: 'La ley nueva. El corpus registra dos normas que ya la modificaron: la Ley 21.755 (2025) y la Ley 21.806 (2026).' },
      { tipo: 'ley', numero: '19628', note: 'La ley sobre protección de la vida privada, de 1999 — el régimen anterior, con 6 versiones en el corpus.' },
    ],
  },
  {
    slug: 'arriendo',
    title: 'Ley de arriendo: arrendamiento de predios urbanos',
    aka: ['ley de arriendo', 'ley 18101', 'ley de arrendamiento'],
    intro:
      '«La ley de arriendo» es, en rigor, la Ley 18.101, que fija normas especiales sobre arrendamiento de predios urbanos. Se publicó el 29 de enero de 1982 y el corpus guarda dos versiones. La reforma que la prensa llamó «Devuélveme mi casa» es la Ley 21.461, una norma distinta.',
    refs: [
      { tipo: 'ley', numero: '18101', note: 'La ley base sobre arrendamiento de predios urbanos, con 51 artículos.' },
      { tipo: 'otras', numero: '21461', note: 'Incorpora la medida precautoria de restitución anticipada de inmuebles. Publicada el 30 de junio de 2022.' },
    ],
  },
  {
    slug: 'consumidor',
    title: 'Ley del consumidor: derechos de los consumidores',
    aka: ['ley del consumidor', 'ley 19496', 'sernac ley'],
    intro:
      'La Ley 19.496 establece normas sobre protección de los derechos de los consumidores. Publicada el 7 de marzo de 1997, es una de las leyes más reformadas del corpus: 9 versiones y 13 normas modificadoras registradas.',
    refs: [
      { tipo: 'ley', numero: '19496', note: 'La ley del consumidor. 225 artículos y 9 versiones históricas navegables.' },
    ],
  },
  {
    slug: 'jornada-laboral',
    title: 'Ley 40 horas: reducción de la jornada laboral',
    aka: ['ley 40 horas', 'ley 21561', 'reduccion jornada laboral'],
    intro:
      'La «ley de 40 horas» es la Ley 21.561, publicada el 26 de abril de 2023, cuyo título oficial es «Modifica el Código del Trabajo con el objeto de reducir la jornada laboral». Como toda ley modificatoria, su efecto real se lee en el Código del Trabajo, no en ella misma.',
    refs: [
      { tipo: 'otras', numero: '21561', note: 'La ley modificatoria, con 17 artículos.' },
      { tipo: 'dfl', numero: '1', note: 'El Código del Trabajo — donde el cambio efectivamente aterriza.' },
    ],
  },
  {
    slug: 'pension-de-alimentos',
    title: 'Pensión de alimentos: registro de deudores y tribunales de familia',
    aka: ['ley de pension de alimentos', 'ley 21389', 'registro de deudores'],
    intro:
      'Las consultas sobre pensión de alimentos cruzan varias normas. La Ley 21.389 creó el Registro Nacional de Deudores de Pensiones de Alimentos; la Ley 14.908 es el texto refundido histórico sobre abandono de familia y pago de pensiones alimenticias; y la Ley 19.968 crea los tribunales de familia que conocen estas causas.',
    refs: [
      { tipo: 'otras', numero: '21389', note: 'Crea el Registro Nacional de Deudores de Pensiones de Alimentos. Publicada el 18 de noviembre de 2021.' },
      { tipo: 'ley', numero: '14908', note: 'Texto definitivo y refundido de la Ley 5.750, sobre abandono de familia y pago de pensiones alimenticias (1962).' },
      { tipo: 'ley', numero: '19968', note: 'Crea los tribunales de familia. 10 versiones en el corpus.' },
    ],
  },
  {
    slug: 'violencia-intrafamiliar',
    title: 'Ley de violencia intrafamiliar',
    aka: ['ley de violencia intrafamiliar', 'ley 20066', 'vif'],
    intro:
      'La Ley 20.066 establece la Ley de Violencia Intrafamiliar. Se publicó el 7 de octubre de 2005 y el corpus registra 7 versiones y 6 normas modificadoras — un buen ejemplo de una ley cuyo texto vigente hoy no es el que se promulgó.',
    refs: [
      { tipo: 'ley', numero: '20066', note: 'La ley de violencia intrafamiliar, con 59 artículos.' },
      { tipo: 'ley', numero: '19968', note: 'Crea los tribunales de familia, competentes en estas materias.' },
    ],
  },
  {
    slug: 'derechos-del-paciente',
    title: 'Ley de derechos y deberes del paciente',
    aka: ['ley 20584', 'derechos del paciente', 'ley de derechos y deberes'],
    intro:
      'La Ley 20.584 regula los derechos y deberes que tienen las personas en relación con acciones vinculadas a su atención en salud. Publicada el 24 de abril de 2012, acumula 12 versiones — de las más reformadas del corpus.',
    refs: [
      { tipo: 'otras', numero: '20584', note: 'La ley de derechos y deberes del paciente. 83 artículos, 12 versiones.' },
    ],
  },
]

export function getTopic(slug: string): Topic | undefined {
  return TOPICS.find((t) => t.slug === slug)
}
