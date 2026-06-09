import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { VersionScrubber } from './VersionScrubber'
import type { Commit } from '@/lib/commits'

const commits: Commit[] = [
  { sha: 'a', date: '2009-03-15', causaId: 20330, subject: 's', magnitude: 0 },
  { sha: 'b', date: '2015-06-01', causaId: 20808, subject: 's', magnitude: 5 },
  { sha: 'c', date: '2020-11-10', causaId: 21100, subject: 's', magnitude: 12 },
]

describe('VersionScrubber', () => {
  it('renders one tick per commit', () => {
    render(<VersionScrubber commits={commits} activeSha="b" onPick={vi.fn()} />)
    const ticks = screen.getAllByRole('button', { name: /versión/i })
    expect(ticks).toHaveLength(3)
  })

  it('marks the active tick', () => {
    render(<VersionScrubber commits={commits} activeSha="b" onPick={vi.fn()} />)
    const active = screen.getByRole('button', { name: /2015-06-01/ })
    expect(active).toHaveAttribute('aria-current', 'true')
  })

  it('calls onPick with the commit when a tick is clicked', async () => {
    const onPick = vi.fn()
    render(<VersionScrubber commits={commits} activeSha="b" onPick={onPick} />)
    const tick = screen.getByRole('button', { name: /2020-11-10/ })
    tick.click()
    expect(onPick).toHaveBeenCalledWith(commits[2])
  })
})
