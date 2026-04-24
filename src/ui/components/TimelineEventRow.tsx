import { EVENT_LABELS, EVENT_COLORS, buildEventDetail } from '../../data/logic/stamp-logic'
import { theme } from '../theme'
import type { StampEvent, StampEventType } from '../../data/models'

const EVENT_ICONS: Record<StampEventType, string> = {
  session_start:      '▶',
  session_end:        '■',
  takeoff:            '↑',
  landing:            '↓',
  engine_start:       '⊕',
  engine_shutdown:    '⊗',
  checklist_complete: '✓',
  wing_layout:        '⌒',
  weather:            '☁',
  waypoint:           '⌖',
  preflight:          '◈',
  maneuver:           '↺',
  custom:             '★',
}

function formatTimeHHMM(ts: number): string {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts))
}

export function TimelineEventRow({ event }: { event: StampEvent }) {
  const color = EVENT_COLORS[event.type]
  const label = EVENT_LABELS[event.type]
  const detail = buildEventDetail(event)
  const icon = EVENT_ICONS[event.type]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 16px',
      borderBottom: `1px solid ${theme.colors.darkBorder}`,
      minHeight: '44px',
    }}>
      <span style={{
        fontFamily: theme.font.mono,
        fontSize: theme.size.small,
        color: theme.colors.dim,
        minWidth: '38px',
        textAlign: 'right',
        flexShrink: 0,
        lineHeight: 1,
      }}>
        {formatTimeHHMM(event.ts)}
      </span>

      <div style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '11px',
        color: '#fff',
        fontFamily: theme.font.mono,
        lineHeight: 1,
      }}>
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: theme.size.body, color: theme.colors.cream, fontWeight: 700, lineHeight: 1.2 }}>
          {label}
        </div>
        {detail && (
          <div style={{ fontSize: theme.size.small, color: theme.colors.dim, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}