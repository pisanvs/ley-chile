import type { LawCardProps } from './card'

export function renderLawCard(p: LawCardProps) {
  const estadoColor = p.derogado ? '#c5283d' : '#3f6634'
  const estadoLabel = p.derogado ? 'Derogada' : 'Vigente'
  const older = p.versionDates.slice(0, -1).slice(-4)
  const current = p.versionDates[p.versionDates.length - 1]
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      backgroundColor: '#fbf8f1', padding: '60px 72px', fontFamily: 'Inter',
    }}>
      <span style={{
        display: 'flex',
        fontFamily: 'Fraunces', fontWeight: 600, fontSize: 16, color: '#c5283d',
      }}>{p.tipoLabel} · Nº {p.numeroLabel}</span>
      <span style={{
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        marginTop: 14, fontFamily: 'Fraunces', fontWeight: 600, fontSize: 46,
        lineHeight: 1.1, letterSpacing: -0.5, color: '#171513',
      }}>{p.titulo}</span>
      {p.organismo && (
        <span style={{
          display: 'flex', marginTop: 14, fontFamily: 'Inter',
          fontSize: 17, color: '#8a8278',
        }}>{p.organismo}</span>
      )}
      <div style={{ display: 'flex', flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 48, marginBottom: 28 }}>
        <Stat label="Publicada" value={p.fechaPublicacion || '—'} />
        {!!p.articles && <Stat label="Artículos" value={String(p.articles)} />}
        <Stat label="Versiones" value={String(p.versions)} />
        <Stat label="Estado" value={estadoLabel} color={estadoColor} />
      </div>
      {p.versionDates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          {older.map((d) => (
            <span key={d} style={{
              display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 13,
              color: '#4a443e', backgroundColor: '#f3d6dc',
              textDecoration: 'line-through', textDecorationColor: '#c5283d', textDecorationThickness: '1.5px',
              padding: '4px 8px', borderRadius: 4,
            }}>{d}</span>
          ))}
          {current && (
            <span style={{
              display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 600,
              color: '#171513', backgroundColor: '#d6e2cd', borderBottom: '2px solid #3f6634',
              padding: '4px 8px', borderRadius: 4,
            }}>{current}</span>
          )}
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid #e6dfd0', paddingTop: 20,
      }}>
        <span style={{ fontFamily: 'Inter', fontSize: 14, color: '#8a8278' }}>leyes.pisanvs.cl</span>
        <span style={{ fontFamily: 'Fraunces', fontWeight: 600, fontSize: 17, color: '#171513' }}>ley·chile</span>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'Inter', fontWeight: 600, fontSize: 11, letterSpacing: 2,
        textTransform: 'uppercase', color: '#8a8278',
      }}>{label}</span>
      <span style={{
        fontFamily: 'Fraunces', fontWeight: 600, fontSize: 22, color: color ?? '#171513',
      }}>{value}</span>
    </div>
  )
}
