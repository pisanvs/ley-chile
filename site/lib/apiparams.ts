import { BadRequest } from './apiroute'

/** Strict positive integer. Anything else is a 400, never a NaN handed to a
 *  SQL parameter. */
export function parseIdNorma(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new BadRequest(`idNorma must be a positive integer, got "${raw}"`)
  }
  return Number(raw)
}

/** YYYY-MM-DD, validated as a real calendar date. A malformed fecha must not
 *  silently become "today" — the answer would be right-looking and wrong. */
export function parseFecha(raw: string | null, fallback: string): string {
  if (raw === null || raw === '') return fallback
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequest(`fecha must be YYYY-MM-DD, got "${raw}"`)
  }
  const d = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw new BadRequest(`fecha is not a real date: "${raw}"`)
  }
  return raw
}
