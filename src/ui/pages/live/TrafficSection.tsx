import { theme } from '../../theme'
import { useTrafficStore } from '../../../state/traffic-store'
import { trafficReasonText } from '../../../data/logic/traffic-logic'
import { buttonStyle, sectionStyle, sectionTitle } from '../plan/plan-styles'

/** The Traffic switch: why it's on or off, what it shows, and its limits. */
export function TrafficSection() {
  const { active, tracking, reason, groupBy, targets, error, toggle } = useTrafficStore()
  const small: React.CSSProperties = { fontSize: theme.size.tiny, color: theme.colors.dim, lineHeight: 1.4, marginTop: '6px' }
  const text = trafficReasonText({ active, tracking, reason }, groupBy)

  return (
    <div style={sectionStyle}>
      <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between' }}>
        <span>ADS-B traffic</span>
        {active && <span style={{ color: error ? theme.colors.amber : theme.colors.green }}>● {error ? 'Unavailable' : `${targets.length} nearby`}</span>}
      </div>
      <button onClick={toggle} aria-pressed={active}
        style={{ ...buttonStyle(!active), width: '100%', ...(active ? { borderColor: theme.colors.green, color: theme.colors.green } : {}) }}>
        {active ? '● Traffic on — tap to turn off' : 'Turn traffic on'}
      </button>
      <div style={{ ...small, color: theme.colors.light }}>{text}</div>
      {active && error && <div style={{ ...small, color: theme.colors.amber }}>Traffic unavailable — {error}. Retrying.</div>}
      <div style={small}>
        <strong style={{ color: theme.colors.amber }}>Situational awareness only — not for collision avoidance.</strong>{' '}
        Aircraft without ADS-B Out (most ultralights, PPCs and balloons) won’t appear, and positions can be several seconds old.
        Comes on by itself while a session runs, and for your whole Live Group while anyone in it is flying.
      </div>
    </div>
  )
}
