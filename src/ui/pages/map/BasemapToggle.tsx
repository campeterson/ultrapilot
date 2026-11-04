import { theme } from '../../theme'
import { useBasemapStore } from '../../../state/basemap-store'
import { satelliteSource, type MapView } from '../../../data/logic/basemap-logic'

/** Map ⇄ Satellite button for one map. Dimmed when the chosen provider has no key. */
export function BasemapToggle({ view, style }: { view: MapView; style?: React.CSSProperties }) {
  const on = useBasemapStore(s => s.satellite[view])
  const { provider, keys, toggleSatellite } = useBasemapStore()
  const missingKey = satelliteSource(provider, provider === 'usgs' ? '' : keys[provider]) === null
  return (
    <button
      onClick={() => toggleSatellite(view)}
      title={missingKey ? 'Add your satellite API key in Settings' : on ? 'Satellite — tap for map' : 'Map — tap for satellite'}
      aria-label={on ? 'Switch to street map' : 'Switch to satellite'}
      style={{
        width: theme.tapTarget, height: theme.tapTarget, borderRadius: '50%',
        background: on ? theme.colors.red : 'rgba(14,14,20,0.88)',
        border: `1px solid ${theme.colors.darkBorder}`, color: theme.colors.cream,
        fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: on && missingKey ? 0.5 : 1, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', ...style,
      }}
    >
      {on ? '🗺' : '🛰'}
    </button>
  )
}
