import { useState } from 'react'
import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useGPSStore } from '../../../state/gps-store'
import { useUnits } from '../../hooks/useUnits'
import { useTick } from '../../hooks/useTick'
import { ageText, displayAltitude, displayCallsigns, groundReference, memberView, roleLabel } from '../../../data/logic/live-logic'
import { altitudeText, distanceText, speedText } from '../../../data/logic/units-logic'
import { compassPoint, formatDeg, metersToFeet } from '../../../data/logic/gps-logic'
import { LiveMemberActions } from './LiveMemberActions'

/** Everyone in the group: role, age, altitude, speed and track, distance/bearing from me. Tap for actions. */
export function LiveMemberList() {
  const { members, offset, display, profile } = useLiveGroupStore()
  const me = useGPSStore(s => s.position)
  const units = useUnits()
  const now = useTick(1000) + offset
  const [open, setOpen] = useState<string | null>(null)
  const names = displayCallsigns(members)
  const ref = groundReference(members, profile ? { role: profile.role, altFt: me ? metersToFeet(me.altMSL) : null } : null)
  const sorted = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.callsign.localeCompare(b.callsign))

  if (!members.length) return <div style={{ color: theme.colors.dim, fontSize: theme.size.small }}>No one here yet — share the invite.</div>

  return (
    <div>
      {sorted.map(m => {
        const color = theme.colors.liveRoles[m.role]
        const v = m.fix ? memberView(m.fix, m.isMe ? null : me, now) : null
        const dim = !v || v.freshness === 'stale'
        const alt = v ? displayAltitude(v.altFt, display.altMode, ref) : null
        const details = [
          roleLabel(m.role),
          v ? ageText(v.ageS) : 'not sharing',
          alt && `${altitudeText(alt.ft, units.altitude)} ${alt.datum}`,
          v?.speedKt != null && `${speedText(v.speedKt, units.speed)}${v.trackDeg != null ? ` ${formatDeg(v.trackDeg)}` : ''}`,
        ].filter(Boolean).join(' · ')
        return (
          <div key={m.pubId} style={{ borderTop: `1px solid ${theme.colors.darkBorder}`, opacity: v?.freshness === 'fading' ? 0.75 : 1 }}>
            <button onClick={() => setOpen(open === m.pubId ? null : m.pubId)} aria-expanded={open === m.pubId}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: theme.tapTarget, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: theme.font.primary }}>
              <span style={{ width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, background: dim ? 'transparent' : color, border: `2px solid ${color}` }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: theme.colors.cream, fontSize: theme.size.body, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {names.get(m.pubId)}{m.isMe && <span style={{ color: theme.colors.dim, fontWeight: 400 }}> · you</span>}
                </span>
                <span style={{ display: 'block', color: theme.colors.dim, fontSize: theme.size.tiny }}>{details}</span>
              </span>
              {v?.distNM != null && v.bearingDeg != null && (
                <span style={{ textAlign: 'right', fontFamily: theme.font.mono, fontSize: theme.size.small, color: dim ? theme.colors.dim : theme.colors.cream }}>
                  <span style={{ display: 'block' }}>{distanceText(v.distNM, units.distance)}</span>
                  <span style={{ display: 'block', color: theme.colors.dim }}>{formatDeg(v.bearingDeg)} {compassPoint(v.bearingDeg)}</span>
                </span>
              )}
              <span style={{ color: theme.colors.dim, fontSize: theme.size.small }}>{open === m.pubId ? '▴' : '▾'}</span>
            </button>
            {open === m.pubId && <LiveMemberActions member={m} />}
          </div>
        )
      })}
    </div>
  )
}
