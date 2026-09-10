'use client'

import { createContext, useContext } from 'react'

import type { CiteSource } from '@/lib/cite'

/**
 * Norma identity for the citation button, provided once per reader.
 *
 * `ArticleSegment` receives only `idNorma`, `slug`, `heading`, `status` and
 * `causaId` — nothing a citation needs. `RedlineReader` renders it in three
 * places, so threading tipo/numero/titulo/fecha as props would mean touching
 * every one of them and every caller above.
 *
 * A context is the smaller change and the more honest boundary: the norma's
 * identity is ambient to the whole reader, not a property of one segment.
 *
 * Null when absent, so a segment rendered outside a reader (a test, a future
 * embed) simply omits the button rather than crashing.
 */
export type CiteContextValue = Omit<CiteSource, 'url' | 'articulo'> | null

const Ctx = createContext<CiteContextValue>(null)

export function CiteProvider({
  value,
  children,
}: {
  value: CiteContextValue
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCiteSource(): CiteContextValue {
  return useContext(Ctx)
}
