import { CITE_FORMATS, renderCite, type CiteSource } from '../cite'

/**
 * The Open Graph card for `/citar`.
 *
 * Unlike the law card this takes no props — `/citar` is one page, not 333k of
 * them — so it renders once at build time via the `opengraph-image` file
 * convention rather than through the cached `/api/og` endpoint.
 *
 * The specimen is produced by `renderCite` rather than typed out as a string
 * literal, and the chips come from `CITE_FORMATS`. A share card showing a
 * citation the tool no longer produces, or advertising a format it dropped,
 * is worse than no card: it is a promise the page then breaks. Deriving both
 * means the image cannot drift from the tool without the build noticing.
 */

/** A real norma, so the specimen is a citation someone could actually check. */
const SPECIMEN_SOURCE: CiteSource = {
  tipo: 'ley',
  numero: '21719',
  titulo: 'Protección de datos personales',
  fechaPublicacion: '2024-08-26',
  articulo: 'Artículo 12',
  url: 'https://leyes.pisanvs.cl/ley/21719',
}

/** Frozen so the card is byte-stable across builds: `renderCite` stamps an
 *  access date into BibTeX and RIS from `new Date()`, and while APA doesn't
 *  use it today, a card that silently changed every midnight would defeat the
 *  immutable caching the CDN applies to it. */
const SPECIMEN_DATE = new Date('2026-09-10T00:00:00Z')

/** Two formats, not one. The card's job is to show that the tool renders the
 *  same norma several ways — which is the question someone searching "cómo
 *  citar una ley chilena" actually has — and the Chilean legal form is the one
 *  a Chilean reader recognises, so it leads. */
export const SPECIMENS = [
  { label: 'Cita legal', hint: 'uso chileno', text: renderCite('chile', SPECIMEN_SOURCE, SPECIMEN_DATE) },
  { label: 'APA 7', hint: '', text: renderCite('apa', SPECIMEN_SOURCE, SPECIMEN_DATE) },
]

const PAPER = '#fbf8f1'
const PAPER_SUNK = '#f3eee0'
const PAPER_RAISED = '#ffffff'
const INK = '#171513'
const INK_SOFT = '#4a443e'
const INK_FAINT = '#8a8278'
const RULE = '#e6dfd0'
const RUBY = '#c5283d'

export function renderCitarCard() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: PAPER,
        padding: '54px 72px',
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontFamily: 'Inter',
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: 3.4,
            textTransform: 'uppercase',
            color: RUBY,
          }}
        >
          Herramienta
        </span>
        <span style={{ fontSize: 13, color: RULE }}>·</span>
        <span
          style={{
            fontFamily: 'Inter',
            fontSize: 13,
            letterSpacing: 3.4,
            textTransform: 'uppercase',
            color: INK_FAINT,
          }}
        >
          Gratis, sin registro
        </span>
      </div>

      {/* Two lines rather than one wrapped line with a coloured span: satori
          lays each text node out independently, so a mid-sentence colour
          change is a second node whose baseline it may not align. */}
      <span
        style={{
          display: 'flex',
          marginTop: 18,
          fontFamily: 'Fraunces',
          fontWeight: 700,
          fontSize: 60,
          lineHeight: 1.05,
          letterSpacing: -1.4,
          color: INK,
        }}
      >
        Cómo citar una
      </span>
      <span
        style={{
          display: 'flex',
          fontFamily: 'Fraunces',
          fontWeight: 700,
          fontSize: 60,
          lineHeight: 1.05,
          letterSpacing: -1.4,
          color: RUBY,
        }}
      >
        ley chilena.
      </span>

      <span
        style={{
          display: 'flex',
          marginTop: 16,
          fontFamily: 'Inter',
          fontSize: 19,
          lineHeight: 1.45,
          color: INK_SOFT,
        }}
      >
        Busca la norma, elige el formato, copia la cita — incluida la versión que regía
        en una fecha pasada.
      </span>

      <div style={{ display: 'flex', flex: 1 }} />

      {/* The specimens: the card's whole argument is that the tool produces
          something finished, so it shows the output rather than describing it. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SPECIMENS.map((s) => (
          <Specimen key={s.label} label={s.label} hint={s.hint} text={s.text} />
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
        {CITE_FORMATS.map((f) => (
          <span
            key={f.id}
            style={{
              display: 'flex',
              fontFamily: 'JetBrains Mono',
              fontSize: 12.5,
              color: INK_SOFT,
              backgroundColor: PAPER_SUNK,
              border: `1px solid ${RULE}`,
              padding: '4px 9px',
              borderRadius: 5,
            }}
          >
            {f.label}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${RULE}`,
          marginTop: 20,
          paddingTop: 18,
        }}
      >
        <span style={{ fontFamily: 'Inter', fontSize: 14, color: INK_FAINT }}>
          leyes.pisanvs.cl/citar
        </span>
        <span style={{ fontFamily: 'Fraunces', fontWeight: 600, fontSize: 17, color: INK }}>
          ley·chile
        </span>
      </div>
    </div>
  )
}

/** One format's output, styled as the copyable block the page renders. */
function Specimen({ label, hint, text }: { label: string; hint: string; text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: PAPER_RAISED,
        border: `1px solid ${RULE}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: PAPER_SUNK,
          borderBottom: `1px solid ${RULE}`,
          padding: '8px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 12,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: INK_FAINT,
            }}
          >
            {label}
          </span>
          {hint && (
            <span style={{ fontFamily: 'Inter', fontSize: 12, color: INK_FAINT }}>· {hint}</span>
          )}
        </div>
        <span
          style={{
            fontFamily: 'Inter',
            fontSize: 11,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: INK_FAINT,
          }}
        >
          copiar
        </span>
      </div>
      <span
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          padding: '13px 18px',
          fontFamily: 'Inter',
          fontSize: 17,
          lineHeight: 1.5,
          color: INK,
        }}
      >
        {text}
      </span>
    </div>
  )
}
