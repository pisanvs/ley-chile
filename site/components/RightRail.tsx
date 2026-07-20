'use client'

import { useState, type ReactNode } from 'react'
import { VersionDetails } from '@/components/VersionDetails'
import { ChronologyPanel } from '@/components/ChronologyPanel'
import { AnnotationsList } from '@/components/AnnotationsList'
import { ModificationsPanel } from '@/components/ModificationsPanel'
import { ModifiedByPanel } from '@/components/ModifiedByPanel'
import { EfectosPanel } from '@/components/EfectosPanel'
import type { Commit, CommitsIndex } from '@/lib/commits'

interface Props {
  idx: CommitsIndex
  active: Commit | undefined
  activeSlug?: string | null
}

type Tab = 'version' | 'efectos' | 'modifies' | 'modified_by' | 'chronology' | 'notes'

export function RightRail({ idx, active, activeSlug }: Props) {
  const [tab, setTab] = useState<Tab>('version')

  return (
    <div className="space-y-4 text-sm">
      <nav className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-ui flex-wrap">
        <TabBtn active={tab === 'version'} onClick={() => setTab('version')}>Versión</TabBtn>
        <TabBtn active={tab === 'efectos'} onClick={() => setTab('efectos')}>Efectos</TabBtn>
        <TabBtn active={tab === 'modifies'} onClick={() => setTab('modifies')}>Modifica</TabBtn>
        <TabBtn active={tab === 'modified_by'} onClick={() => setTab('modified_by')}>Modificadores</TabBtn>
        <TabBtn active={tab === 'chronology'} onClick={() => setTab('chronology')}>Cronología</TabBtn>
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')}>Notas</TabBtn>
      </nav>
      <div className="pt-2 border-t border-rule">
        {tab === 'version' && <VersionDetails idx={idx} active={active} />}
        {tab === 'efectos' && <EfectosPanel modifierId={idx.norma.idNorma} />}
        {tab === 'modifies' && <ModificationsPanel causaId={idx.norma.idNorma} />}
        {tab === 'modified_by' && <ModifiedByPanel targetId={idx.norma.idNorma} />}
        {tab === 'chronology' && <ChronologyPanel idx={idx} activeSlug={activeSlug} />}
        {tab === 'notes' && <AnnotationsList idx={idx} />}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded transition ${
        active ? 'text-ink bg-paper-sunk' : 'text-ink-faint hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
