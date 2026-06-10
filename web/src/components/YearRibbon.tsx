import { useEffect, useMemo, useRef, useState } from 'react'

interface YearCount { year: number; count: number }

interface Props {
  data: YearCount[]
  yearMin: number
  yearMax: number
  selected: number | null
  onSelect: (y: number | null) => void
}

/**
 * Horizontal heatmap of legislative volume per year. Each cell is a square
 * with density 1–5 (CSS-driven from the `data-density` attribute, see index.css).
 * Empty years still render to preserve scale.
 */
export function YearRibbon({ data, yearMin, yearMax, selected, onSelect }: Props) {
  const [hover, setHover] = useState<YearCount | null>(null)

  const { cells, maxCount } = useMemo(() => {
    const m = new Map<number, number>()
    for (const d of data) m.set(d.year, d.count)
    const max = data.reduce((a, b) => (b.count > a ? b.count : a), 0)
    const list: YearCount[] = []
    for (let y = yearMin; y <= yearMax; y++) {
      list.push({ year: y, count: m.get(y) ?? 0 })
    }
    return { cells: list, maxCount: max }
  }, [data, yearMin, yearMax])

  const density = (c: number): 0 | 1 | 2 | 3 | 4 | 5 => {
    if (maxCount === 0 || c === 0) return 0
    const r = c / maxCount
    if (r <= 0.06) return 1
    if (r <= 0.2) return 2
    if (r <= 0.45) return 3
    if (r <= 0.75) return 4
    return 5
  }

  const W = 14
  const GAP = 2
  const H = 26
  const total = cells.length * (W + GAP) - GAP

  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // React attaches onWheel as a passive listener, so e.preventDefault() inside
  // a JSX-style handler is silently ignored. Attach manually with
  // `{ passive: false }` so we can actually stop the page from scrolling.
  //
  // Smoothing model: we don't write to scrollLeft directly. Instead each wheel
  // tick adds to a *target* scrollLeft, and a rAF loop lerps the real
  // scrollLeft toward that target. This decouples animation cadence from
  // wheel cadence (mouse wheels fire in 100px chunks, trackpads in many tiny
  // ones) so both feel like one continuous glide.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    let target = el.scrollLeft
    let raf = 0
    const ease = 0.18 // higher = snappier; lower = floatier
    const speed = 1.2 // wheel multiplier — bumps mouse-wheel responsiveness

    const tick = () => {
      const maxScroll = el.scrollWidth - el.clientWidth
      target = Math.max(0, Math.min(maxScroll, target))
      const dx = target - el.scrollLeft
      if (Math.abs(dx) < 0.5) {
        el.scrollLeft = target
        raf = 0
        return
      }
      el.scrollLeft += dx * ease
      raf = requestAnimationFrame(tick)
    }

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
      const maxScroll = el.scrollWidth - el.clientWidth
      if (maxScroll <= 0) return
      // Release at edges so the page can keep scrolling past the ribbon.
      const atStart = target <= 0
      const atEnd = target >= maxScroll - 0.5
      if ((e.deltaY > 0 && atEnd) || (e.deltaY < 0 && atStart)) return
      e.preventDefault()
      target = Math.max(0, Math.min(maxScroll, target + e.deltaY * speed))
      if (!raf) raf = requestAnimationFrame(tick)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="overflow-x-auto scrollbar-quiet overscroll-x-contain"
      >
        <svg
          width={total}
          height={H + 28}
          viewBox={`0 0 ${total} ${H + 28}`}
          role="img"
          aria-label="Distribución de publicaciones por año"
        >
          {cells.map((c, i) => {
            const x = i * (W + GAP)
            const active = selected === c.year
            return (
              <g key={c.year}>
                <rect
                  className={`year-cell ${active ? 'active' : ''}`}
                  data-density={density(c.count)}
                  x={x}
                  y={0}
                  width={W}
                  height={H}
                  rx={2}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelect(active ? null : c.year)}
                  style={{ cursor: 'pointer' }}
                />
                {(c.year % 10 === 0 || i === 0 || i === cells.length - 1) && (
                  <text
                    x={x + W / 2}
                    y={H + 16}
                    textAnchor="middle"
                    className="fill-current text-ink-faint"
                    style={{ fontSize: 10, fontFamily: 'var(--font-ui)' }}
                  >
                    {c.year}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="h-6 mt-1 text-xs text-ink-soft min-w-0 truncate">
        {hover ? (
          <span>
            <b className="text-ink">{hover.year}</b>
            {' · '}
            {hover.count.toLocaleString('es-CL')} publicaciones (en el subset cargado)
          </span>
        ) : (
          <span className="text-ink-faint">
            Hover sobre un año para ver el volumen. Click para filtrar.
          </span>
        )}
      </div>
    </div>
  )
}
