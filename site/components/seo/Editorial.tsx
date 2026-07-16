import Image from 'next/image'
import Link from 'next/link'

/** Shared building blocks for editorial posts. Server components — posts are
 *  static prose and must render into the HTML a crawler receives. Styling reuses
 *  the existing tokens only; no new visual language. */

/** A screenshot of the product, used as evidence for a claim in the prose.
 *
 *  Captures are real: taken from the live site against real corpus data, not
 *  mocked. `alt` carries the claim for anyone who can't see the image — a
 *  crawler included — so it must describe what the shot proves, not just what
 *  it depicts. Width/height are the capture's intrinsic pixels (deviceScaleFactor
 *  2), so Next reserves the right box and never lays out twice. */
export function Figure({
  src, alt, caption, width, height, priority = false,
}: {
  src: string
  alt: string
  caption: string
  width: number
  height: number
  priority?: boolean
}) {
  return (
    <figure className="mt-8">
      <div className="rounded-lg border border-rule overflow-hidden bg-paper-sunk">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes="(max-width: 768px) 100vw, 720px"
          className="w-full h-auto block"
        />
      </div>
      <figcaption className="mt-2 text-[12px] text-ink-faint">{caption}</figcaption>
    </figure>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 text-[15.5px] leading-relaxed text-ink-soft">{children}</p>
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 font-display text-2xl leading-snug text-ink text-balance">{children}</h2>
}

/** A quote from actual legal text. Never paraphrase inside this — it is
 *  presented as verbatim corpus content. */
export function Quote({ children, cite }: { children: React.ReactNode; cite?: string }) {
  return (
    <figure className="mt-6 border-l-4 border-rule pl-5">
      <blockquote className="prose-reader text-[15px] leading-relaxed text-ink-soft italic">
        {children}
      </blockquote>
      {cite && <figcaption className="mt-2 text-[12px] text-ink-faint not-italic">{cite}</figcaption>}
    </figure>
  )
}

/** Highlighted takeaway. */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <aside className="mt-8 rounded-lg border border-rule bg-paper-raised p-5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-indigo)_30%,transparent)]">
      <div className="text-[14.5px] leading-relaxed text-ink-soft">{children}</div>
    </aside>
  )
}

/** Inline link to a norma. Takes a prebuilt href so callers use normaHref(). */
export function NormaLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-indigo underline underline-offset-2 hover:text-ruby transition">
      {children}
    </Link>
  )
}

export function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-indigo underline underline-offset-2 hover:text-ruby transition"
    >
      {children}
    </a>
  )
}

/** A verified-facts table. Every row must trace to a corpus query or a cited
 *  source — this component exists to make that discipline visible. */
export function Facts({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <dl className="mt-8 divide-y divide-rule border-y border-rule">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-6 py-3">
          <dt className="text-[11px] uppercase tracking-[0.18em] text-ink-faint md:w-44 shrink-0">{r.k}</dt>
          <dd className="text-[14.5px] text-ink-soft">{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}
