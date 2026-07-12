import { describe, it, expect, afterAll } from 'vitest'
import { pool } from './db'
import { getNorma, getVersions } from './norma'

// Proves the DATE type-parser fix in db.ts: without it, pg's default DATE
// parser builds a Date in the process-local timezone, and any positive-UTC
// offset zone (e.g. TZ=Asia/Tokyo) reads it back a day early via
// toISOString(). Run this file under TZ=Asia/Tokyo to see the regression
// this guards against.
describe.skipIf(!process.env.DATABASE_URL)('DATE columns are timezone-independent', () => {
  const ID_NORMA = 990001
  const TIPO = 'ley'
  const NUMERO = 'test-990001'
  const FECHA_PUBLICACION = '2009-02-25'
  const DESDE = '2009-02-25'

  afterAll(async () => {
    await pool.query('DELETE FROM version WHERE id_norma = $1', [ID_NORMA])
    await pool.query('DELETE FROM norma WHERE id_norma = $1', [ID_NORMA])
    await pool.end()
  })

  it('round-trips fecha_publicacion and desde exactly, regardless of TZ', async () => {
    await pool.query(
      `INSERT INTO norma (id_norma, tipo, numero, titulo, organismo, derogado, fecha_publicacion, law_dir)
       VALUES ($1, $2, $3, 'Test Norma', 'Test Org', false, $4, 'leyes/test-990001')
       ON CONFLICT (id_norma) DO NOTHING`,
      [ID_NORMA, TIPO, NUMERO, FECHA_PUBLICACION],
    )
    await pool.query(
      `INSERT INTO version (id_norma, desde, hasta, commit_sha, causa_id, subject, texto_sha256, canonical_sha256)
       VALUES ($1, $2, NULL, 'deadbeef', NULL, 'test version', 'sha1', 'sha2')
       ON CONFLICT (id_norma, desde) DO NOTHING`,
      [ID_NORMA, DESDE],
    )

    const norma = await getNorma(TIPO, NUMERO)
    expect(norma).not.toBeNull()
    expect(norma!.fechaPublicacion).toBe(FECHA_PUBLICACION)

    const versions = await getVersions(ID_NORMA)
    expect(versions).toHaveLength(1)
    expect(versions[0].desde).toBe(DESDE)
    expect(versions[0].hasta).toBeNull()
  })
})
