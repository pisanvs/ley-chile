import { Pool } from 'pg'

// One pool per process. Railway runs a single web replica (see spec §9.2), so
// Next's in-memory `use cache` is coherent and this pool is the only client.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})
