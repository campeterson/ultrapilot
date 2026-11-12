import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useLiveDriftStore } from '../../../state/live-drift-store'
import { useDirectToStore } from '../../../state/direct-to-store'
import { useGPSStore } from '../../../state/gps-store'
import { useUnits } from '../../hooks/useUnits'
import { useTick } from '../../hooks/useTick'
import { ageText, displayAltitude, displayCallsigns, groundReference, memberView, roleDisplay, roleLabel } from '../../../data/logic/live-logic'
import { altitudeText, distanceText, speedText } from '../../../data/logic/units-logic'
import { compassPoint, formatDeg, metersToFeet } from '../../../data/logic/gps-logic'
import type { MemberTap } from './useLiveLayers'

const menuBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 16px',
  background: 'none', border: 'none', borderBottom: `1px solid ${theme.colors.darkBorder}`,
  cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget, textAlign: 'left',
}

/** Popup for a tapped Live Group member: who / where, Direct To (follows them), drift forecast. */
export function LiveMemberPopup({ tap, containerWidth, onClose }: { tap: MemberTap; containerWidth: number; onClose: () => void }) {
  const { members, offset, display, profile, directToMember } = useLiveGroupStore()
  const drift = useLiveDriftStore()
  const target = useDirectToStore(s => s.target)
  const clearTarget = useDirectToStore(s => s.clearTarget)
  const me = useGPSStore(s => s.position)
  const units = useUnits()
  const now = useTick(1000) + offset
  const m = members.find(x => x.pubId === tap.pubId)
  if (!m) return null

  const name = displayCallsigns(members).get(m.pubId) ?? m.callsign
  const color = theme.colors.liveRoles[m.role]
  const v = m.fix ? memberView(m.fix, me, now) : null
  const ref = groundReference(members, profile ? { role: profile.role, altFt: me ? metersToFeet(me.altMSL) : null } : null)
  const shows = roleDisplay(m.role)
  const alt = v && shows.altitudeOnLabel ? displayAltitude(v.altFt, display.altMode, ref) : null
  // Ground members: their elevation (MSL) is the useful number — they are the AGL reference
  const groundElev = v && !shows.altitudeOnLabel && v.altFt != null ? `ground ${altitudeText(v.altFt, units.altitude)} MSL` : null
  const following = target?.memberId === m.pubId
  const airborne = shows.driftForecast
  const watching = drift.memberId === m.pubId

  return (
    <div onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: Math.max(8, Math.min(tap.x + 8, containerWidth - 248)), top: Math.max(tap.y - 170, 8),
        width: '240px', background: theme.colors.darkCard, border: `1px solid ${color}88`, borderRadius: '10px',
        overflow: 'hidden', zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.6)', fontFamily: theme.font.primary,
      }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color }}>● {name}</div>
        <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '3px', lineHeight: 1.4 }}>
          {[roleLabel(m.role), v ? ageText(v.ageS) : 'not sharing', alt && `${altitudeText(alt.ft, units.altitude)} ${alt.datum}`, groundElev,
            v?.speedKt != null && `${speedText(v.speedKt, units.speed)}${v.trackDeg != null ? ` ${formatDeg(v.trackDeg)}` : ''}`].filter(Boolean).join(' · ')}
        </div>
        {v?.distNM != null && v.bearingDeg != null && (
          <div style={{ fontSize: theme.size.small, color: theme.colors.cream, fontFamily: theme.font.mono, marginTop: '4px' }}>
            {distanceText(v.distNM, units.distance)} · {formatDeg(v.bearingDeg)} {compassPoint(v.bearingDeg)}
          </div>
        )}
      </div>
      {following ? (
        <button onClick={() => { clearTarget(); onClose() }} style={{ ...menuBtn, color: theme.colors.magenta }}>
          <span>✓</span> Following — cancel Direct To
        </button>
      ) : (
        <button onClick={() => { directToMember(m.pubId); onClose() }} disabled={!m.fix}
          style={{ ...menuBtn, color: m.fix ? theme.colors.magenta : theme.colors.dim, fontWeight: 700 }}>
          <span>◇</span> Direct To {name}
        </button>
      )}
      {airborne && (
        <button onClick={() => { if (watching) drift.stop(); else drift.watch(m.pubId); onClose() }} disabled={!m.fix && !watching}
          style={{ ...menuBtn, color: theme.colors.light }}>
          <span>⋯</span> {watching ? 'Hide drift forecast' : 'Drift forecast'}
        </button>
      )}
      <button onClick={onClose} style={{ ...menuBtn, color: theme.colors.dim, borderBottom: 'none', justifyContent: 'center', fontSize: theme.size.small }}>Dismiss</button>
    </div>
  )
}
