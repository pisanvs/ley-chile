import { Pool, types } from 'pg'

// DATE (OID 1082) has no timezone; pg's default parser builds a Date in
// the process-local zone, which toISOString() then shifts by a day in any
// positive-UTC-offset zone. Keep DATE as the raw 'YYYY-MM-DD' string.
types.setTypeParser(1082, (v) => v)

// One pool per process. Railway runs a single web replica (see spec §9.2), so
// Next's in-memory `use cache` is coherent and this pool is the only client.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})
