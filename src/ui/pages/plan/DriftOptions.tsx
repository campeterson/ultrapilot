import { theme } from '../../theme'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useUnits } from '../../hooks/useUnits'
import type { FlightPlanView } from '../../hooks/useFlightPlan'
import { DRIFT_MINUTES_OPTIONS, type DriftMinutes } from '../../../data/logic/drift-logic'
import { formatAltitude, ALTITUDE_LABELS } from '../../../data/logic/units-logic'
import { chipStyle, inputStyle, labelStyle } from './plan-styles'

/** Cruise altitude, drift duration, and whether to compare every altitude. */
export function DriftOptions({ view }: { view: FlightPlanView }) {
  const { mode, driftMinutes, setSetting } = useFlightPlanStore()
  const units = useUnits()
  const altLabel = (ft: number) => `${Number(formatAltitude(ft, units.altitude)).toLocaleString()} ${ALTITUDE_LABELS[units.altitude]} ${mode.toUpperCase()}`
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1.4 }}>
          <label style={labelStyle}>Cruise alt</label>
          <select style={inputStyle} value={view.cruiseIndex} onChange={e => setSetting('cruiseIndex', Number(e.target.value))}>
            {view.altitudesFt.map((ft, i) => <option key={i} value={i}>{altLabel(ft)}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Duration</label>
          <select style={inputStyle} value={driftMinutes} onChange={e => setSetting('driftMinutes', Number(e.target.value) as DriftMinutes)}>
            {DRIFT_MINUTES_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      </div>
      <button onClick={() => setSetting('compare', !view.compare)}
        style={{ ...chipStyle(view.compare), width: '100%', marginTop: '8px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <span style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${view.compare ? theme.colors.red : theme.colors.dim}`, background: view.compare ? theme.colors.red : 'none', color: '#fff', fontSize: '12px', lineHeight: '14px' }}>
          {view.compare ? '✓' : ''}
        </span>
        Compare altitudes
      </button>
    </div>
  )
}
