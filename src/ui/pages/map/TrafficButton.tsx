import { theme } from '../../theme'
import { useTrafficStore } from '../../../state/traffic-store'
import { trafficReasonText } from '../../../data/logic/traffic-logic'

/** "TFC" on the map: tap to turn ADS-B traffic on or off. Green when on, amber when it can't get traffic. */
export function TrafficButton() {
  const { active, tracking, reason, groupBy, targets, error, toggle } = useTrafficStore()
  const color = !active ? theme.colors.dim : error ? theme.colors.amber : theme.colors.green
  const title = `ADS-B traffic: ${trafficReasonText({ active, tracking, reason }, groupBy)}${active && error ? ` — unavailable (${error})` : ''}`
  return (
    <button onClick={toggle} title={title} aria-label={title} aria-pressed={active}
      style={{
        position: 'relative', width: '44px', height: '44px', borderRadius: '50%', cursor: 'pointer',
        border: `${active ? 2 : 1}px solid ${active ? color : theme.colors.darkBorder}`,
        background: theme.colors.stripBg, color, fontFamily: theme.font.primary, fontSize: '11px', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
      }}>
      TFC
      {active && !error && targets.length > 0 && (
        <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '18px', height: '18px', borderRadius: '9px', padding: '0 4px',
          background: theme.colors.green, color: theme.colors.dark, fontSize: '11px', lineHeight: '18px', textAlign: 'center' }}>{targets.length}</span>
      )}
    </button>
  )
}
