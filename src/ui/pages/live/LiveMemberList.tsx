import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useGPSStore } from '../../../state/gps-store'
import { useUnits } from '../../hooks/useUnits'
import { useTick } from '../../hooks/useTick'
import { ageText, displayCallsigns, memberView, roleLabel } from '../../../data/logic/live-logic'
import { altitudeText, distanceText, speedText } from '../../../data/logic/units-logic'
import { compassPoint, formatDeg, msToKnots } from '../../../data/logic/gps-logic'

/** Everyone in the group: role, age, distance/bearing from me, altitude, speed. */
export function LiveMemberList() {
  const { members, offset } = useLiveGroupStore()
  const me = useGPSStore(s => s.position)
  const units = useUnits()
  const now = useTick(1000) + offset
  const names = displayCallsigns(members)
  const sorted = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.callsign.localeCompare(b.callsign))

  if (!members.length) return <div style={{ color: theme.colors.dim, fontSize: theme.size.small }}>No one here yet — share the invite.</div>

  return (
    <div>
      {sorted.map(m => {
        const color = theme.colors.liveRoles[m.role]
        const v = m.fix ? memberView(m.fix, m.isMe ? null : me, now) : null
        const dim = !v || v.freshness === 'stale'
        return (
          <div key={m.pubId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: `1px solid ${theme.colors.darkBorder}`, opacity: v?.freshness === 'fading' ? 0.75 : 1 }}>
            <span style={{ width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, background: dim ? 'transparent' : color, border: `2px solid ${color}` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: theme.colors.cream, fontSize: theme.size.body, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {names.get(m.pubId)}{m.isMe && <span style={{ color: theme.colors.dim, fontWeight: 400 }}> · you</span>}
              </div>
              <div style={{ color: theme.colors.dim, fontSize: theme.size.tiny }}>
                {roleLabel(m.role)}
                {v ? ` · ${ageText(v.ageS)}` : ' · not sharing'}
                {v?.altFt != null && ` · ${altitudeText(v.altFt, units.altitude)}`}
                {m.fix?.speedMs != null && ` · ${speedText(msToKnots(m.fix.speedMs), units.speed)}`}
              </div>
            </div>
            {v?.distNM != null && v.bearingDeg != null && (
              <div style={{ textAlign: 'right', fontFamily: theme.font.mono, fontSize: theme.size.small, color: dim ? theme.colors.dim : theme.colors.cream }}>
                <div>{distanceText(v.distNM, units.distance)}</div>
                <div style={{ color: theme.colors.dim }}>{formatDeg(v.bearingDeg)} {compassPoint(v.bearingDeg)}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
