import { theme } from '../../theme'
import { useWindreaderStore } from '../../../state/windreader-store'
import { convertSpeed, ageMinutes, WINDREADER_UNIT_LABELS } from '../../../data/logic/windreader-logic'
import type { WindBand, WindBandRelation } from '../../../data/models'

export const RELATION_COLORS: Record<WindBandRelation, string> = {
  above: theme.colors.blue,
  current: theme.colors.cream,
  below: theme.colors.amber,
}

function DriftArrow({ deg, color, size }: { deg: number; color: string; size: number }) {
  return (
    <svg viewBox="-8 -10 16 20" width={size} height={size} style={{ transform: `rotate(${deg}deg)`, flexShrink: 0 }}>
      <polygon points="0,-9 5,6 0,3 -5,6" fill={color} />
    </svg>
  )
}

interface Props {
  bands: WindBand[]
  /** Compact = map overlay: tighter rows, only the bands nearest your altitude. */
  compact?: boolean
  maxRows?: number
}

/** Show at most `max` bands, centered on the current one. */
function windowAroundCurrent(bands: WindBand[], max: number): WindBand[] {
  if (bands.length <= max) return bands
  const idx = Math.max(0, bands.findIndex(b => b.relation === 'current'))
  const start = Math.min(Math.max(0, idx - Math.floor(max / 2)), bands.length - max)
  return bands.slice(start, start + max)
}

export function WindreaderTable({ bands, compact = false, maxRows }: Props) {
  const units = useWindreaderStore(s => s.units)
  const now = Date.now()
  const rows = maxRows ? windowAroundCurrent(bands, maxRows) : bands
  const pad = compact ? '4px 8px' : '10px 16px'
  const font = compact ? theme.size.small : theme.size.body

  const cell: React.CSSProperties = { fontFamily: theme.font.mono, fontSize: font, textAlign: 'right' }

  return (
    <div style={{ fontFamily: theme.font.primary }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 1fr 0.8fr', gap: '6px',
        padding: pad, fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.06em',
        borderBottom: `1px solid ${theme.colors.darkBorder}`,
      }}>
        <span style={{ textAlign: 'right' }}>ALT ft</span>
        <span style={{ textAlign: 'right' }}>TRK °</span>
        <span style={{ textAlign: 'right' }}>{WINDREADER_UNIT_LABELS[units]}</span>
        <span style={{ textAlign: 'right' }}>min</span>
      </div>
      {rows.map(b => {
        const color = RELATION_COLORS[b.relation]
        const isCurrent = b.relation === 'current'
        const calm = b.speedKts === 0
        return (
          <div
            key={b.altMSLft}
            style={{
              display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 1fr 0.8fr', gap: '6px', alignItems: 'center',
              padding: pad,
              background: isCurrent ? 'rgba(253, 246, 227, 0.14)' : 'transparent',
              borderBottom: `1px solid ${theme.colors.darkBorder}`,
              color,
              fontWeight: isCurrent ? 700 : 400,
            }}
          >
            <span style={cell}>{b.altMSLft.toLocaleString()}</span>
            <span style={{ ...cell, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
              {!calm && <DriftArrow deg={b.trackDeg} color={color} size={compact ? 14 : 18} />}
              {calm ? 'CALM' : Math.round(b.trackDeg).toString().padStart(3, '0')}
            </span>
            <span style={cell}>{Math.round(convertSpeed(b.speedKts, units))}</span>
            <span style={{ ...cell, color: theme.colors.dim }}>{ageMinutes(b.lastTs, now)}</span>
          </div>
        )
      })}
    </div>
  )
}
