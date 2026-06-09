import type { Commit } from '@/lib/commits'

interface Props {
  commits: Commit[]
  activeSha: string | null
  onPick: (c: Commit) => void
}

export function VersionScrubber({ commits, activeSha, onPick }: Props) {
  if (commits.length === 0) {
    return <div className="text-sm opacity-60">Sin versiones registradas.</div>
  }
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2" role="group" aria-label="Versiones de la ley">
      {commits.map(c => {
        const active = c.sha === activeSha
        return (
          <button
            key={c.sha}
            onClick={() => onPick(c)}
            aria-current={active ? 'true' : undefined}
            aria-label={`versión ${c.date}`}
            title={`${c.date} · causa: ${c.causaId || '—'}`}
            className={[
              'h-6 w-1.5 rounded-full transition-all',
              active ? 'bg-indigo h-8' : 'bg-ink/30 hover:bg-ink/60',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}
