import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useGPSStore } from '../../../state/gps-store'
import { groundReference } from '../../../data/logic/live-logic'
import { metersToFeet } from '../../../data/logic/gps-logic'
import { chipStyle } from '../plan/plan-styles'

/** How others are drawn: direction lines on/off; altitudes MSL or AGL with the chase crew as 0. */
export function LiveDisplayOptions() {
  const { display, setDisplay, members, profile } = useLiveGroupStore()
  const myAltM = useGPSStore(s => s.position?.altMSL ?? null)
  const ref = groundReference(members, profile ? { role: profile.role, altFt: myAltM == null ? null : metersToFeet(myAltM) } : null)
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={() => setDisplay({ lines: !display.lines })} style={{ ...chipStyle(display.lines), flex: 1.2 }}>
          {display.lines ? '✓ Direction lines' : 'Direction lines'}
        </button>
        <button onClick={() => setDisplay({ altMode: 'msl' })} style={chipStyle(display.altMode === 'msl')}>MSL</button>
        <button onClick={() => setDisplay({ altMode: 'agl' })} style={chipStyle(display.altMode === 'agl')}>AGL</button>
      </div>
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '6px', lineHeight: 1.4 }}>
        {display.altMode === 'agl'
          ? ref ? `AGL = height above ${ref.name === 'you' ? 'you (chase = 0 AGL)' : `${ref.name} (chase = 0 AGL)`}.` : 'AGL needs the chase vehicle’s altitude — showing MSL until it reports.'
          : 'Direction lines show where each member is heading over the look-ahead time in Settings.'}
      </div>
    </div>
  )
}
