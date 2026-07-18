import type { LawCardProps } from './card'

const PLURAL_VERSION = (n: number) => (n === 1 ? 'versión' : 'versiones')

/** 1. Editorial ledger — warm paper background, big serif headline, thin
 *  rule line, quiet wordmark. Closest to the site's own reading-room look. */
export function renderLawCardEditorial(p: LawCardProps) {
  const estadoColor = p.derogado ? '#c5283d' : '#3f6634'
  const estadoLabel = p.derogado ? 'Derogada' : 'Vigente'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      backgroundColor: '#fbf8f1', padding: '64px 72px', fontFamily: 'Inter',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontFamily: 'Inter', fontWeight: 600, fontSize: 15, letterSpacing: 4,
          textTransform: 'uppercase', color: '#8a8278',
        }}>{p.kicker}</span>
        <span style={{ display: 'flex', width: 4, height: 4, borderRadius: 2, backgroundColor: '#e6dfd0' }} />
        <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 15, color: '#4a443e' }}>
          {p.tipoLabel} · Nº {p.numeroLabel}
        </span>
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: 28, marginBottom: 28 }}>
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          fontFamily: 'Fraunces', fontWeight: 600, fontSize: 54, lineHeight: 1.12, color: '#171513',
        }}>{p.titulo}</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid #e6dfd0', paddingTop: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', width: 9, height: 9, borderRadius: 5, backgroundColor: estadoColor }} />
            <span style={{ fontFamily: 'Inter', fontSize: 16, color: '#4a443e' }}>{estadoLabel}</span>
          </div>
          {p.fechaPublicacion && (
            <span style={{ fontFamily: 'Inter', fontSize: 16, color: '#8a8278' }}>{p.fechaPublicacion}</span>
          )}
          <span style={{ fontFamily: 'Inter', fontSize: 16, color: '#8a8278' }}>
            {p.versions} {PLURAL_VERSION(p.versions)}
          </span>
        </div>
        <span style={{ fontFamily: 'Fraunces', fontWeight: 600, fontSize: 18, color: '#171513' }}>ley·chile</span>
      </div>
    </div>
  )
}

/** 2. Ink stamp — dark background, gold-bordered seal, centered composition,
 *  monospace stat row. */
export function renderLawCardStamp(p: LawCardProps) {
  const estadoColor = p.derogado ? '#e85f72' : '#8aaf7e'
  const estadoLabel = p.derogado ? 'DEROGADA' : 'VIGENTE'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      backgroundColor: '#15140f', padding: 48, fontFamily: 'Inter',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center',
        justifyContent: 'center', border: '2px solid #2a2820', borderRadius: 16,
        padding: '56px 72px',
      }}>
        <span style={{
          fontFamily: 'Inter', fontWeight: 600, fontSize: 15, letterSpacing: 5,
          textTransform: 'uppercase', color: '#d9b948',
        }}>{p.kicker} · {p.tipoLabel} Nº {p.numeroLabel}</span>
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          marginTop: 22, fontFamily: 'Fraunces', fontWeight: 600, fontSize: 46, lineHeight: 1.16,
          color: '#f0ece2', maxWidth: 880, textAlign: 'center',
        }}>{p.titulo}</span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 28, marginTop: 32,
          fontFamily: 'JetBrains Mono', fontSize: 15, color: '#b8b1a3',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', width: 8, height: 8, borderRadius: 4, backgroundColor: estadoColor }} />
            {estadoLabel}
          </span>
          {p.fechaPublicacion && <span style={{ display: 'flex' }}>{p.fechaPublicacion}</span>}
          <span style={{ display: 'flex' }}>{p.versions} {PLURAL_VERSION(p.versions)}</span>
          {p.articles !== undefined && <span style={{ display: 'flex' }}>{p.articles} artículos</span>}
        </div>
      </div>
    </div>
  )
}

/** 3. Split card — solid indigo block with the tipo/número stacked large,
 *  paper block with título + meta. Closer to a GitHub repo card at a glance. */
export function renderLawCardSplit(p: LawCardProps) {
  const estadoColor = p.derogado ? '#c5283d' : '#3f6634'
  const estadoLabel = p.derogado ? 'Derogada' : 'Vigente'
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', fontFamily: 'Inter' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: 380, height: '100%',
        backgroundColor: '#1d3557', padding: '56px 44px', justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'Inter', fontWeight: 600, fontSize: 14, letterSpacing: 3,
          textTransform: 'uppercase', color: '#d2dbe7',
        }}>{p.kicker}</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 20, color: '#d2dbe7' }}>
            {p.tipoLabel}
          </span>
          <span style={{
            display: 'flex', fontFamily: 'Fraunces', fontWeight: 700, fontSize: 72,
            lineHeight: 1, color: '#ffffff', marginTop: 6,
          }}>Nº {p.numeroLabel}</span>
        </div>
        <span style={{ fontFamily: 'Fraunces', fontWeight: 600, fontSize: 16, color: '#d2dbe7' }}>
          ley·chile
        </span>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', flex: 1, height: '100%',
        backgroundColor: '#fbf8f1', padding: '56px 48px', justifyContent: 'center',
      }}>
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          fontFamily: 'Fraunces', fontWeight: 600, fontSize: 40, lineHeight: 1.18, color: '#171513',
        }}>{p.titulo}</span>
        {p.organismo && (
          <span style={{ display: 'flex', marginTop: 16, fontFamily: 'Inter', fontSize: 16, color: '#8a8278' }}>
            {p.organismo}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', width: 8, height: 8, borderRadius: 4, backgroundColor: estadoColor }} />
            <span style={{ fontFamily: 'Inter', fontSize: 15, color: '#4a443e' }}>{estadoLabel}</span>
          </div>
          {p.fechaPublicacion && (
            <span style={{ fontFamily: 'Inter', fontSize: 15, color: '#8a8278' }}>{p.fechaPublicacion}</span>
          )}
          <span style={{ fontFamily: 'Inter', fontSize: 15, color: '#8a8278' }}>
            {p.versions} {PLURAL_VERSION(p.versions)}
          </span>
        </div>
      </div>
    </div>
  )
}
