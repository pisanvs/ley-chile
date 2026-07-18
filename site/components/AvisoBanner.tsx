import type { Avisos, RefundidoLink } from '@/lib/norma'
import { canonicalHref } from '@/lib/href'
import { sortAvisos } from '@/lib/avisos'

/** Warnings that change how the text below should be read.
 *
 *  The refundido notice is the important one. When a law's text has been
 *  recast, the consolidated version RENUMBERS its articles — so reading article
 *  numbers off the base law and assuming they carry over produces citations
 *  that look right and are wrong. LeyChile publishes the relation and its own
 *  numbering observations; the corpus used to discard both.
 *
 *  Renders nothing when there is nothing to say, which is the overwhelming
 *  majority of normas. */
export function AvisoBanner({
  avisos, refundido,
}: {
  avisos: Avisos
  refundido: { refunde: RefundidoLink[]; refundidaEn: RefundidoLink[] }
}) {
  // Two tiers: only numbering notes are warnings. 55% of normas carry an
  // observación, but 99.7% of those are document-type noise ("EXTRACTO") — a
  // caution box on half the corpus would bury the notes that actually matter.
  const { numbering, notes } = sortAvisos(avisos.observaciones)
  const hasNumberingWarning = avisos.dobleArticulado || numbering.length > 0
  const nothing =
    !hasNumberingWarning &&
    notes.length === 0 &&
    refundido.refundidaEn.length === 0 &&
    refundido.refunde.length === 0 &&
    !avisos.refundidoPor
  if (nothing) return null

  return (
    <div className="mt-4 space-y-2">
      {refundido.refundidaEn.map((r) => (
        <div
          key={r.idNorma}
          className="rounded-md border border-ruby/40 bg-ruby/[0.04] px-3.5 py-3"
        >
          <p className="text-[12px] leading-relaxed text-ink-soft">
            <strong className="text-ruby">Texto refundido.</strong> El texto vigente de esta
            norma está refundido en{' '}
            <a href={canonicalHref(r)} className="text-indigo hover:underline font-medium">
              {r.tipo.toUpperCase()} {r.numero}
              {r.fechaPublicacion && ` de ${r.fechaPublicacion.slice(0, 4)}`}
            </a>
            {r.organismo && <span className="text-ink-faint"> ({r.organismo})</span>}. Un
            refundido <em>renumera</em> los artículos: cita los números desde allá, no desde
            aquí.
          </p>
        </div>
      ))}

      {refundido.refunde.length > 0 && (
        <div className="rounded-md border border-rule bg-paper-sunk px-3.5 py-3">
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Refunde{' '}
            {refundido.refunde.map((r, i) => (
              <span key={r.idNorma}>
                {i > 0 && ', '}
                <a href={canonicalHref(r)} className="text-indigo hover:underline">
                  {r.tipo.toUpperCase()} {r.numero}
                </a>
              </span>
            ))}
            .
          </p>
        </div>
      )}

      {hasNumberingWarning && (
        <div className="rounded-md border border-ruby/40 bg-ruby/[0.04] px-3.5 py-3">
          {avisos.dobleArticulado && (
            <p className="text-[12px] leading-relaxed text-ink-soft">
              <strong className="text-ruby">Doble articulado.</strong> Esta norma tiene dos
              series de artículos; una etiqueta como «Artículo 1» puede ser ambigua.
            </p>
          )}
          {numbering.map((o) => (
            <p key={o} className="text-[12px] leading-relaxed text-ink-soft first:mt-0 mt-1.5">
              <strong className="text-ruby">Numeración.</strong> {o}
            </p>
          ))}
        </div>
      )}

      {/* Quiet tier: real information, not a hazard. "EXTRACTO" means the
          published text is only an extract, which is worth stating plainly. */}
      {notes.length > 0 && (
        <p className="text-[11px] leading-relaxed text-ink-faint px-0.5">
          <span className="uppercase tracking-wider">LeyChile · </span>
          {notes.join(' · ')}
        </p>
      )}

      {/* Only when the resolvable edge is absent: this is tipo-numero text
          ("DFL-2; DFL-2-95") that cannot be linked — "DFL 2" names 138 normas. */}
      {avisos.refundidoPor && refundido.refundidaEn.length === 0 && (
        <div className="rounded-md border border-rule bg-paper-sunk px-3.5 py-3">
          <p className="text-[12px] leading-relaxed text-ink-soft">
            <strong className="text-ink">Refundido por</strong>{' '}
            <span className="font-mono text-[11px]">{avisos.refundidoPor}</span>{' '}
            <span className="text-ink-faint">
              (referencia de LeyChile sin idNorma; no es resoluble a una norma única).
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
