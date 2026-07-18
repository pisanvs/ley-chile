import type { Norma } from '../norma'
import { fechaLarga, prettyNumero, tipoLabel } from '../seo'

export interface LawCardProps {
  tipoLabel: string
  numeroLabel: string
  titulo: string
  organismo: string
  fechaPublicacion: string
  derogado: boolean
  versions: number
  articles?: number
  versionDates: string[]
}

export interface LawCardSource {
  norma: Norma
  versions: number
  versionDates: string[]
  articles?: number
}

const MAX_VERSION_PILLS = 5

export function buildLawCardProps(src: LawCardSource): LawCardProps {
  return {
    tipoLabel: tipoLabel(src.norma.tipo),
    numeroLabel: prettyNumero(src.norma.numero),
    titulo: src.norma.titulo,
    organismo: src.norma.organismo || '',
    fechaPublicacion: fechaLarga(src.norma.fechaPublicacion),
    derogado: src.norma.derogado,
    versions: src.versions,
    articles: src.articles,
    versionDates: src.versionDates.slice(-MAX_VERSION_PILLS),
  }
}
