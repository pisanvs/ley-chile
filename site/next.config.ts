import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const config: NextConfig = {
  output: 'standalone',        // Railway runs the built server directly
}

export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // No SENTRY_AUTH_TOKEN yet — skip source map upload instead of failing
  // the build or warning on every CI run.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },

  silent: !process.env.CI,
  widenClientFileUpload: true,

  // tunnelRoute (proxying client events through our own domain, to dodge ad
  // blockers) doesn't produce a working route under Turbopack as of
  // @sentry/nextjs 10.66 / Next 16.2 — 404s even in a standalone prod build
  // with a valid DSN. Skipping it; server-side capture is unaffected.
})
