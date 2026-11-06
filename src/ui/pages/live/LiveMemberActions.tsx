import { theme } from '../../theme'
import { useLiveGroupStore, type LiveMember } from '../../../state/live-group-store'
import { useLiveDriftStore } from '../../../state/live-drift-store'
import { useDirectToStore } from '../../../state/direct-to-store'
import { useSessionStore } from '../../../state/session-store'
import { useUnits } from '../../hooks/useUnits'
import { LIVE_ROLES } from '../../../data/logic/live-logic'
import { LIVE_DRIFT_MINUTES, memberDrift } from '../../../data/logic/live-drift-logic'
import { distanceText } from '../../../data/logic/units-logic'
import { compassPoint, formatDeg } from '../../../data/logic/gps-logic'
import { buttonStyle, chipStyle } from '../plan/plan-styles'

/** Actions under a member row: Direct-To (follows them) and forecast drift (airborne members). */
export function LiveMemberActions({ member }: { member: LiveMember }) {
  const directToMember = useLiveGroupStore(s => s.directToMember)
  const target = useDirectToStore(s => s.target)
  const clearTarget = useDirectToStore(s => s.clearTarget)
  const session = useSessionStore(s => s.session)
  const drift = useLiveDriftStore()
  const units = useUnits()
  const following = target?.memberId === member.pubId
  const airborne = LIVE_ROLES.find(r => r.id === member.role)?.airborne
  const watching = drift.memberId === member.pubId
  const track = watching && drift.forecast && member.fix ? memberDrift(drift.forecast, member.fix, drift.minutes) : null
  const small: React.CSSProperties = { fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '6px', lineHeight: 1.4 }

  return (
    <div style={{ padding: '4px 0 10px 24px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        {!member.isMe && (
          <button onClick={() => (following ? clearTarget() : directToMember(member.pubId))} disabled={!member.fix && !following}
            style={{ ...buttonStyle(false, !member.fix && !following), flex: 1, color: theme.colors.magenta, borderColor: following ? theme.colors.magenta : theme.colors.darkBorder }}>
            {following ? '✓ Direct-To — cancel' : '◇ Direct-To'}
          </button>
        )}
        {airborne && (
          <button onClick={() => (watching ? drift.stop() : drift.watch(member.pubId))} disabled={!member.fix && !watching}
            style={{ ...buttonStyle(false, !member.fix && !watching), flex: 1, borderColor: watching ? theme.colors.liveRoles[member.role] : theme.colors.darkBorder }}>
            {watching ? '✓ Drift forecast — hide' : 'Drift forecast'}
          </button>
        )}
      </div>
      {following && !session && <div style={small}>Start a session to see distance and bearing to {member.callsign} in the instruments (DTE / DTK).</div>}
      {watching && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {LIVE_DRIFT_MINUTES.map(m => <button key={m} onClick={() => drift.setMinutes(m)} style={chipStyle(drift.minutes === m)}>{m} min</button>)}
          </div>
          <div style={small}>
            {drift.fetching ? 'Getting winds…'
              : drift.error ? drift.error
              : !member.fix?.altM && member.fix?.altM !== 0 ? 'No altitude from this member yet.'
              : track ? `If it holds altitude: ${distanceText(track.distNM, units.distance)} toward ${formatDeg(track.bearingDeg)} ${compassPoint(track.bearingDeg)} in ${track.minutes} min (dashed line on the map).`
              : 'No forecast wind at this altitude.'}
          </div>
        </>
      )}
    </div>
  )
}
