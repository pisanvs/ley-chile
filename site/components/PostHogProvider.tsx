'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from '@posthog/react'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (typeof window !== 'undefined' && KEY) {
  posthog.init(KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    // App Router navigations don't trigger a full page load — track them
    // manually via PageviewTracker below instead of posthog-js's default.
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'identified_only',
  })
}

function PageviewTracker() {
  const posthog = usePostHog()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname || !posthog) return
    const search = searchParams.toString()
    posthog.capture('$pageview', {
      $current_url: search ? `${pathname}?${search}` : pathname,
    })
  }, [pathname, searchParams, posthog])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // No key configured (e.g. local dev) — render children unwrapped, no-op.
  if (!KEY) return children

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  )
}
