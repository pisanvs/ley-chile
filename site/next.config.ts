import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',        // Railway runs the built server directly
  cacheComponents: true,       // enables `use cache`, cacheLife, cacheTag
}

export default config
