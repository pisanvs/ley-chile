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

  // Tunnel client-side Sentry events through our own domain (avoids ad
  // blockers stripping the direct ingest.sentry.io request).
  tunnelRoute: '/monitoring',
})
