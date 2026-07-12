import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',        // Railway runs the built server directly
  cacheComponents: true,       // enables `use cache`, cacheLife, cacheTag
  typescript: {
    // TypeScript 7's Go-based rewrite no longer ships lib/typescript.js, the
    // entry point Next 16.2.10's bundled type-checker requires. Without this,
    // `next build` crashes with "The 'id' argument must be of type string.
    // Received undefined" (it resolves the missing file to `undefined` and
    // then does `require(undefined)`). Skip Next's in-build type check here;
    // rely on `tsc --noEmit` / CI / editor tooling for type errors instead.
    ignoreBuildErrors: true,
  },
}

export default config
