import { useEffect, useState } from 'react'
import { theme } from '../../theme'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useUnits } from '../../hooks/useUnits'
import type { FlightPlanView } from '../../hooks/useFlightPlan'
import { FORECAST_MODELS, localDateString } from '../../../data/logic/forecast-logic'
import { DRIFT_MINUTES_OPTIONS } from '../../../data/logic/drift-logic'
import { parseAltitudeList } from '../../../data/logic/plan-logic'
import { altitudeToFeet, convertAltitude, ALTITUDE_LABELS } from '../../../data/logic/units-logic'
import { chipStyle, inputStyle, labelStyle, sectionStyle, sectionTitle } from './plan-styles'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`

/** When, which model, which altitudes, how long to drift. */
export function PlanControls({ view }: { view: FlightPlanView }) {
  const { date, hour, model, mode, mslFt, driftMinutes, showOnMap, setSetting } = useFlightPlanStore()
  const units = useUnits()
  const unit = ALTITUDE_LABELS[units.altitude]
  const shown = view.altitudesFt.map(ft => Math.round(convertAltitude(ft, units.altitude))).join(', ')
  const [altText, setAltText] = useState(shown)
  useEffect(() => setAltText(shown), [shown])

  function commitAltitudes() {
    const vals = parseAltitudeList(altText).map(v => Math.round(altitudeToFeet(v, units.altitude)))
    if (vals.length === 0) { setAltText(shown); return }
    setSetting(mode === 'agl' ? 'aglFt' : 'mslFt', vals)
  }

  const modelNote = FORECAST_MODELS.find(m => m.id === model)?.note

  return (
    <div style={sectionStyle}>
      <div style={sectionTitle}>When &amp; how</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1.3 }}>
          <label style={labelStyle}>Date</label>
          <input type="date" style={inputStyle} value={date} min={localDateString(new Date())}
            onChange={e => e.target.value && setSetting('date', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Launch time</label>
          <select style={inputStyle} value={hour} onChange={e => setSetting('hour', Number(e.target.value))}>
            {HOURS.map(h => <option key={h} value={h}>{hour12(h)}</option>)}
          </select>
        </div>
      </div>

      <label style={{ ...labelStyle, marginTop: '10px' }}>Forecast model</label>
      <select style={inputStyle} value={model} onChange={e => setSetting('model', e.target.value)}>
        {FORECAST_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {modelNote && <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '4px' }}>{modelNote}</div>}

      <label style={{ ...labelStyle, marginTop: '10px' }}>Altitudes</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button style={chipStyle(mode === 'agl')} onClick={() => setSetting('mode', 'agl')}>AGL each site</button>
        <button style={chipStyle(mode === 'msl')} onClick={() => setSetting('mode', 'msl')}>Common MSL</button>
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
        <input style={{ ...inputStyle, flex: 1 }} value={altText} inputMode="numeric"
          onChange={e => setAltText(e.target.value)} onBlur={commitAltitudes}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        <span style={{ color: theme.colors.dim, fontSize: theme.size.small }}>{unit} {mode.toUpperCase()}</span>
        {mode === 'msl' && mslFt && (
          <button style={{ ...chipStyle(false), flex: 'none' }} onClick={() => setSetting('mslFt', null)}>Auto</button>
        )}
      </div>
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '4px' }}>
        {mode === 'agl' ? 'Up to four heights above each site’s ground.' : 'One altitude set flown from every site — compare sites at the same level.'}
      </div>

      <label style={{ ...labelStyle, marginTop: '10px' }}>Drift duration</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        {DRIFT_MINUTES_OPTIONS.map(m => (
          <button key={m} style={chipStyle(driftMinutes === m)} onClick={() => setSetting('driftMinutes', m)}>{m} min</button>
        ))}
      </div>

      <button onClick={() => setSetting('showOnMap', !showOnMap)}
        style={{ ...chipStyle(showOnMap), width: '100%', marginTop: '10px', flex: 'none' }}>
        {showOnMap ? '✓ Drift tracks shown on map' : 'Show drift tracks on map'}
      </button>
    </div>
  )
}
