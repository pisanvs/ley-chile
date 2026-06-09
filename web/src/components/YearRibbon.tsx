import { useMemo, useState } from 'react'

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

  return (
    <div className="relative">
      <div className="overflow-x-auto scrollbar-quiet">
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
