import { createHash } from 'node:crypto'
import { pool } from './db'

export interface ApiKeyRecord {
  id: number
  label: string
}

/** Verify a bearer token against `api_key`.
 *
 *  Only the SHA-256 digest is ever sent to the database, so the plaintext
 *  cannot leak through a query log or an error trace. The digest is the unique
 *  key, making this one indexed probe with no scan — and no string-comparison
 *  timing channel, since an attacker cannot produce the digest without already
 *  holding the token.
 *
 *  Revocation is filtered in SQL: a caller that forgets to check a flag is a
 *  security bug, so there is no flag to forget. */
export async function verifyApiKey(token: string): Promise<ApiKeyRecord | null> {
  if (!token) return null
  const hash = createHash('sha256').update(token).digest('hex')
  const { rows } = await pool.query(
    `SELECT id, label FROM api_key WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hash],
  )
  return rows.length ? { id: rows[0].id as number, label: rows[0].label as string } : null
}
