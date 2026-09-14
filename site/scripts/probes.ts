/**
 * The probe set: what the MCP must never get wrong.
 *
 * Each probe is one call plus the invariants its answer has to satisfy. Every
 * invariant carries a `why`, because a failing assertion whose reason has to be
 * reconstructed from the diff is a test nobody trusts enough to act on.
 *
 * These are written against the CONTRACT, not against current behaviour. A
 * probe that fails is either a live defect or a fix that has not been deployed
 * yet; the runner's baseline tells the two apart. Anchored on ley 20.000
 * (idNorma 235507), whose article 22 was repealed on 2024-09-04, and the Código
 * del Trabajo (DFL 1, idNorma 207436), whose article 22 carries ley 21.561's
 * phase-in.
 */

export type Assertion =
  | { contains: string; why: string }
  | { notContains: string; why: string }
  | { matches: string; why: string }
  | { notMatches: string; why: string }

export interface Probe {
  id: string
  group: string
  tool: string
  args: Record<string, unknown>
  expect: Assertion[]
}

const LEY_20000 = { tipo: 'ley', numero: '20000', idNorma: 235507 }
const COD_TRABAJO = { tipo: 'dfl', numero: '1', idNorma: 207436 }

export const PROBES: Probe[] = [
  // ---------------------------------------------------------------- dates --
  {
    id: 'date/reversed-range',
    group: 'dates',
    tool: 'diff_versions',
    args: { ...LEY_20000, desde: '2024-09-04', hasta: '2023-05-23' },
    expect: [
      {
        notContains: 'MODIFICADO',
        why: 'A reversed range rendered a repeal as an enactment: "[-] Derogado. [+] Será circunstancia atenuante…" asserts the attenuant was created in 2023. It was repealed in 2024.',
      },
      {
        matches: 'desde|anterior|intercambia',
        why: 'The refusal has to name the ordering problem, not just decline.',
      },
    ],
  },
  {
    id: 'date/equal-range',
    group: 'dates',
    tool: 'diff_versions',
    args: { ...LEY_20000, desde: '2024-09-04', hasta: '2024-09-04' },
    expect: [
      {
        matches: 'misma fecha|nada que comparar',
        why: 'Comparing a date with itself is trivially "sin cambios", which invites the caller to believe two versions were compared.',
      },
    ],
  },
  {
    id: 'date/ambiguous-ddmmyyyy',
    group: 'dates',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: '03-09-2024' },
    expect: [
      {
        notContains: 'vigente al 03-09-2024',
        why: 'DD-MM-YYYY was accepted and echoed back. A caller who meant 9 March got 3 September, silently, with a malformed permalink.',
      },
      { matches: 'ISO|YYYY-MM-DD|ambigu', why: 'The refusal must show the correct spelling.' },
    ],
  },
  {
    id: 'date/nonsense',
    group: 'dates',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: 'banana' },
    expect: [{ notContains: 'Artículo 22 ·', why: 'A malformed date must never yield article text.' }],
  },
  {
    id: 'date/impossible-calendar-day',
    group: 'dates',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: '2024-02-30' },
    expect: [
      {
        notContains: 'Artículo 22 ·',
        why: '30 February matches the ISO shape but is not a day; a regex-only check lets it through.',
      },
    ],
  },
  {
    id: 'date/pre-enactment',
    group: 'dates',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: '2000-01-01' },
    expect: [
      {
        notContains: 'No se encontró el artículo',
        why: 'This said the ARTICLE was missing. A model reports that as "ley 20.000 has no Article 22". The norma is what did not exist.',
      },
      { contains: '2005-02-16', why: 'The answer should name the publication date it is measuring against.' },
    ],
  },
  {
    id: 'date/pre-enactment-no-bare-ellipsis',
    group: 'dates',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: '2000-01-01' },
    expect: [
      {
        notMatches: 'Disponibles:\\s*…',
        why: 'An empty article list rendered as "Disponibles: …" — an ellipsis standing in for nothing, which reads as truncation.',
      },
    ],
  },
  {
    id: 'date/future-horizon',
    group: 'dates',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: '2030-01-01' },
    expect: [
      {
        matches: 'FUTURA|extrapolaci|última versión conocida',
        why: 'A date past the corpus horizon was answered as settled law. No legal database can say what the law will be in 2030.',
      },
    ],
  },

  // ----------------------------------------------------------- boundaries --
  {
    id: 'boundary/day-before-repeal',
    group: 'boundaries',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: '2024-09-03' },
    expect: [
      { contains: 'cooperación eficaz', why: 'The last day of a version must still return its text; `hasta` is inclusive.' },
      { notContains: 'Derogado', why: 'Off-by-one on the closing day would repeal the article a day early.' },
    ],
  },
  {
    id: 'boundary/day-of-repeal',
    group: 'boundaries',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'articulo 22', fecha: '2024-09-04' },
    expect: [{ contains: 'Derogado', why: 'The repeal binds from its own first day.' }],
  },

  // --------------------------------------------------------------- labels --
  {
    id: 'label/abbreviated',
    group: 'labels',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'Art. 22', fecha: '2024-09-03' },
    expect: [
      {
        contains: 'cooperación eficaz',
        why: '"Art. 22" is the citation form in every Chilean brief and resolved to nothing while "articulo 22" worked.',
      },
    ],
  },
  {
    id: 'label/ordinal-marker',
    group: 'labels',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'art. 22°', fecha: '2024-09-03' },
    expect: [{ contains: 'cooperación eficaz', why: 'The ordinal marker is decoration, not part of the key.' }],
  },
  {
    id: 'label/url-slug',
    group: 'labels',
    tool: 'get_article',
    args: { ...LEY_20000, articulo: 'art-22', fecha: '2024-09-03' },
    expect: [{ contains: 'cooperación eficaz', why: 'A slug pasted out of one of our own permalinks has to resolve.' }],
  },

  // ------------------------------------------------------------- vigencia --
  {
    id: 'vigencia/phase-in-not-yet-binding',
    group: 'vigencia',
    tool: 'get_article',
    args: { ...COD_TRABAJO, articulo: 'articulo 22', fecha: '2024-01-01' },
    expect: [
      {
        // NOT "cuarenta y cinco": that string sits in the nota at the foot of
        // the article whether or not the answer warns, so asserting on it
        // passes against a server that says nothing. Only the marker
        // distinguishes a warned answer from an unwarned one.
        matches: 'VIGENCIA GRADUAL',
        why: 'Ley 21.561 phases in 45→44→42→40 hours from 2023-04-26. On 2024-01-01 the binding limit was 45; the corpus served the consolidated "cuarenta horas" with no signal.',
      },
    ],
  },
  {
    id: 'vigencia/quiet-once-complete',
    group: 'vigencia',
    tool: 'get_article',
    args: { ...COD_TRABAJO, articulo: 'articulo 22', fecha: '2029-01-01' },
    expect: [
      {
        notContains: 'VIGENCIA GRADUAL',
        why: 'Once the schedule has run the consolidated text is correct. A warning nobody needs teaches readers to skip the next one.',
      },
    ],
  },

  // --------------------------------------------------------------- diffs --
  {
    id: 'diff/no-mid-word-fragments',
    group: 'diffs',
    tool: 'diff_versions',
    // The full history, not a narrow range: the documented fragments live in
    // the 2005→2026 span. A probe pointed at the wrong range passes vacuously,
    // which is exactly how this one passed against a server that has the bug.
    args: { ...LEY_20000, desde: '2005-02-16', hasta: '2026-05-23' },
    expect: [
      {
        notMatches: '\\[[-+]\\] (?:uministre|ministre\\b(?! )|ños |in el\\b|s grados)',
        why: 'Character-level slicing produced unquotable fragments: [-] "su", [-] "ños s", [-] "s grados". The tool promises "palabra por palabra".',
      },
    ],
  },
  {
    id: 'diff/truncation-is-machine-readable',
    group: 'diffs',
    tool: 'diff_versions',
    args: { ...LEY_20000, desde: '2005-02-16', hasta: '2026-05-23' },
    expect: [
      {
        matches: '\\[TRUNCADO\\] offset=\\d+ fin=\\d+ total=\\d+ faltan=\\d+|^(?![\\s\\S]*truncado)',
        why: 'A generator that cannot detect truncation emits gold labels missing their tail. Either the body is complete or the notice is parseable.',
      },
    ],
  },

  // ----------------------------------------------------------- ambiguity --
  {
    id: 'ambiguity/dfl-1-lists-candidates',
    group: 'ambiguity',
    tool: 'get_law',
    args: { tipo: 'dfl', numero: '1' },
    expect: [
      { matches: 'Hay \\d+ normas', why: '(tipo, numero) addresses 91.7% of the corpus ambiguously; the tool must list rather than guess.' },
      { contains: 'idNorma', why: 'Each candidate needs the handle that disambiguates it.' },
    ],
  },
  {
    id: 'ambiguity/unknown-norma',
    group: 'ambiguity',
    tool: 'get_law',
    args: { tipo: 'ley', numero: '99999999' },
    expect: [{ matches: 'No se encontró', why: 'A nonexistent norma errors cleanly rather than resolving to a neighbour.' }],
  },

  // -------------------------------------------------------------- causas --
  {
    id: 'causa/no-placeholder-tipo',
    group: 'causas',
    tool: 'list_versions',
    args: COD_TRABAJO,
    expect: [
      {
        notMatches: 'Otras? N°\\d+',
        why: '"Otras N°21561" is a placeholder tipo frozen into the commit subject; idNorma 1191554 is typed `ley`. C4 scores exact (norma, fecha) tuples, so a wrong tipo corrupts the answer key.',
      },
      {
        notMatches: 'Otra \\[id \\d+\\]',
        why: 'An unresolved causa must say it is unresolved, not present "Otra" as if it were a tipo.',
      },
    ],
  },

  // -------------------------------------------------------------- search --
  {
    id: 'search/known-item-by-official-title',
    group: 'search',
    tool: 'search_laws',
    args: { query: 'SANCIONA EL TRAFICO ILICITO DE ESTUPEFACIENTES Y SUSTANCIAS SICOTROPICAS' },
    expect: [
      {
        contains: '235507',
        why: 'The verbatim official title of ley 20.000 returned twenty agricultural resolutions and not the law. If a title does not retrieve its own norma, the corpus is undiscoverable to anyone who does not already know the number.',
      },
    ],
  },
  {
    id: 'search/known-item-by-number',
    group: 'search',
    tool: 'search_laws',
    args: { query: 'ley 20.000' },
    expect: [{ contains: '235507', why: 'A number query must retrieve the norma with that number.' }],
  },
  {
    id: 'search/known-item-by-common-name',
    group: 'search',
    tool: 'search_laws',
    args: { query: 'reduce la jornada laboral 40 horas' },
    expect: [
      {
        contains: '1191554',
        why: 'This returned twenty MINEDUC decrees about liceo administration. Ley 21.561 is titled "MODIFICA EL CÓDIGO DEL TRABAJO CON EL OBJETO DE REDUCIR LA JORNADA LABORAL".',
      },
    ],
  },
]
