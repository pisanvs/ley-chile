import * as Sentry from '@sentry/nextjs'

// No-op if NEXT_PUBLIC_SENTRY_DSN is unset (e.g. local dev) — Sentry.init
// with an empty dsn just disables the SDK instead of throwing.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Single Railway replica serving real traffic — keep tracing light.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
})

// Wires Sentry into App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
