'use client'

import { useEffect, useState } from 'react'

/** Site-wide ephemeral banner, driven entirely by environment variables.
 *
 *    SITE_ALERT        the message. Empty or unset renders nothing.
 *    SITE_ALERT_LEVEL  info | warn | error   (default: warn)
 *
 *  Deliberately not a database row or a CMS entry: the moment you need one of
 *  these is the moment something is broken, and that is the worst possible time
 *  to require a code change, a migration, or a working read model to announce
 *  that the read model is not working.
 *
 *  Fetched client-side from /api/alert rather than read in layout.tsx, because
 *  the layout is statically prerendered — `process.env` there is captured at
 *  BUILD time, so a variable set afterwards never appears. That mistake shipped
 *  once: the banner rendered nothing during an outage while the variable was
 *  set correctly the whole time. This way every page stays static and
 *  cacheable, and setting the variable takes effect on the next page view with
 *  no rebuild.
 *
 *  It appears a moment after hydration. For an operational notice aimed at
 *  humans that is the right trade; crawlers neither see nor need it.
 */

const STYLES: Record<string, string> = {
  info: 'bg-indigo/10 text-ink border-indigo/30',
  warn: 'bg-[#fbbf24]/15 text-ink border-[#fbbf24]/40',
  error: 'bg-ruby/10 text-ink border-ruby/40',
}

const ICONS: Record<string, string> = { info: 'ⓘ', warn: '⚠', error: '⚠' }

export function SiteAlert() {
  const [alert, setAlert] = useState<{ message: string; level: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/alert', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.message) setAlert(d)
      })
      .catch(() => {
        // A missing banner must never be able to break the page it sits above.
      })
    return () => { cancelled = true }
  }, [])

  if (!alert?.message) return null

  const style = STYLES[alert.level] ?? STYLES.warn
  const icon = ICONS[alert.level] ?? ICONS.warn

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full border-b px-4 py-2.5 text-center text-[13px] leading-snug ${style}`}
    >
      <span aria-hidden="true" className="mr-1.5 opacity-70">{icon}</span>
      {alert.message}
    </div>
  )
}
