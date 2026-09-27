import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // Without this, vitest's default excludes don't cover `.next/` (only
    // `.git`/`.cache`/`.output`/`.temp`), so after a `pnpm build` it picks up
    // the standalone output's copies of every *.test.ts under lib/ and runs
    // those too — against a pruned node_modules that's missing dev-only
    // subpaths like react-dom's server.node.js, so they fail every time.
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
})
