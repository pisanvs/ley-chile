/** Classifying LeyChile's `observaciones`.
 *
 *  Measured over the corpus: 14,106 observaciones across 12,223 normas — 55% of
 *  them — but only 36 (0.26%) actually concern article numbering. The rest are
 *  document-type notes, overwhelmingly "EXTRACTO" (8,533), "PF" (400) and
 *  variations of "NORMA SIN PROMULGACIÓN".
 *
 *  So they cannot all be rendered as warnings. A caution box on half the corpus
 *  reading "EXTRACTO" is noise that trains people to ignore the box, and it
 *  would bury the 36 notes that genuinely change how article numbers should be
 *  read — which is the entire reason this field was recovered.
 *
 *  Two tiers: numbering notes warn, everything else is a quiet fact.
 */

/** Numbering-specific vocabulary only.
 *
 *  Deliberately does NOT match a bare "artículo": plenty of observaciones
 *  mention one without saying anything about numbering ("LO DISPUESTO EN EL
 *  ARTICULO UNICO TIENE VIGENCIA ESPECIAL DE TRES AÑOS"), and matching those
 *  would re-introduce the noise this exists to remove. */
const NUMBERING_RE = /numeraci|repite|correlativ|duplicad/i

/** True when an observación changes how article numbers should be read —
 *  e.g. "LA NUMERACION DE LOS ARTICULOS DEL TEXTO PUBLICADO REPITE EL Nº 2" or
 *  "La numeración ... no es correlativa, falta el N° 43". */
export function isNumberingAviso(observacion: string): boolean {
  return NUMBERING_RE.test(observacion)
}

export interface SortedAvisos {
  /** Render prominently: these affect the correctness of a citation. */
  numbering: string[]
  /** Render quietly: "EXTRACTO" and friends — useful context, not a warning.
   *  "EXTRACTO" in particular means the published text is only an extract, so
   *  it is worth stating plainly; it just is not a numbering hazard. */
  notes: string[]
}

export function sortAvisos(observaciones: string[]): SortedAvisos {
  const numbering: string[] = []
  const notes: string[] = []
  for (const o of observaciones) {
    const trimmed = o.trim()
    if (!trimmed) continue
    ;(isNumberingAviso(trimmed) ? numbering : notes).push(trimmed)
  }
  return { numbering, notes }
}
