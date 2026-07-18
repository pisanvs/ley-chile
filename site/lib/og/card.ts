import type { Norma } from '../norma'
import { fechaLarga, prettyNumero, tipoLabel } from '../seo'

export interface LawCardProps {
  kicker: string
  tipoLabel: string
  numeroLabel: string
  titulo: string
  organismo: string
  fechaPublicacion: string
  derogado: boolean
  versions: number
  articles?: number
}

export interface LawCardSource {
  norma: Norma
  versions: number
  articles?: number
  kicker: string
}

export function buildLawCardProps(src: LawCardSource): LawCardProps {
  return {
    kicker: src.kicker,
    tipoLabel: tipoLabel(src.norma.tipo),
    numeroLabel: prettyNumero(src.norma.numero),
    titulo: src.norma.titulo,
    organismo: src.norma.organismo || '',
    fechaPublicacion: fechaLarga(src.norma.fechaPublicacion),
    derogado: src.norma.derogado,
    versions: src.versions,
    articles: src.articles,
  }
}
