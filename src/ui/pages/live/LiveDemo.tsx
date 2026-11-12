import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useGPSStore } from '../../../state/gps-store'
import { demoBlurb } from '../../../data/logic/live-demo-logic'
import { defaultRole, roleLabel } from '../../../data/logic/live-logic'
import { useFlightModeStore } from '../../../state/flight-mode-store'
import { buttonStyle, sectionStyle, sectionTitle } from '../plan/plan-styles'
import { LiveMemberList } from './LiveMemberList'
import { LiveDisplayOptions } from './LiveDisplayOptions'

/** "Simulate group members": pretend members around me, to show how Live Group works. */
export function LiveDemo() {
  const { demo, setDemo, group, profile } = useLiveGroupStore()
  const hasGPS = useGPSStore(s => s.position !== null)
  const mode = useFlightModeStore(s => s.mode)
  const role = profile?.role ?? defaultRole(mode)
  const small: React.CSSProperties = { fontSize: theme.size.tiny, color: theme.colors.dim, lineHeight: 1.4, marginTop: '6px' }

  return (
    <div style={{ ...sectionStyle, ...(demo ? { borderColor: theme.colors.amber } : {}) }}>
      <div style={sectionTitle}>Demo</div>
      <button onClick={() => setDemo(!demo)} aria-pressed={demo}
        style={{ ...buttonStyle(), width: '100%', ...(demo ? { borderColor: theme.colors.amber, color: theme.colors.amber } : {}) }}>
        {demo ? '● Simulating group members — tap to stop' : 'Simulate group members'}
      </button>
      <div style={small}>
        As {roleLabel(role)}, you get {demoBlurb(role)} — on the map and in the list. Tap them for Direct-To and drift forecast, like real members.
        They’re marked “(demo)”, only on this device, and never sent to anyone.
      </div>
      {demo && !hasGPS && <div style={{ ...small, color: theme.colors.amber }}>Waiting for GPS — they appear around your position.</div>}
      {/* In a group they show in the Group list below; without one, here */}
      {demo && !group && (
        <div style={{ marginTop: '10px' }}>
          <LiveMemberList />
          <LiveDisplayOptions />
        </div>
      )}
    </div>
  )
}
