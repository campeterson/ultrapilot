import { theme } from '../../theme'
import { useFlightPlanStore, type SlotOffset } from '../../../state/flight-plan-store'
import { useUnits } from '../../hooks/useUnits'
import type { FlightPlanView } from '../../hooks/useFlightPlan'
import { hourLabel, SLOT_OFFSETS, slotTs } from '../../../data/logic/forecast-logic'
import { formatAltitude, ALTITUDE_LABELS } from '../../../data/logic/units-logic'
import { chipStyle, driftColor, siteColor } from './plan-styles'

/** Hour slots around the plan time (−1 … +2) and the track color key. */
export function HourScrubber({ view, compact = false }: { view: FlightPlanView; compact?: boolean }) {
  const { slot, setSlot, mode } = useFlightPlanStore()
  const units = useUnits()
  const alt = (ft: number) => `${Number(formatAltitude(ft, units.altitude)).toLocaleString()} ${ALTITUDE_LABELS[units.altitude]} ${mode.toUpperCase()}`
  const legend = view.compare
    ? view.altitudesFt.map((ft, i) => ({ color: driftColor(i), label: alt(ft) }))
    : view.sites.map((s, i) => ({ color: siteColor(i), label: `${i + 1} ${s.name}` }))
  return (
    <div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {SLOT_OFFSETS.map(o => (
          <button key={o} onClick={() => setSlot(o as SlotOffset)} style={{ ...chipStyle(slot === o), padding: '4px' }}>
            <div style={{ fontSize: theme.size.small, fontWeight: 700 }}>{hourLabel(slotTs(view.baseTs, o))}</div>
            {!compact && <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim }}>{o === 0 ? 'plan' : o > 0 ? `+${o}h` : `${o}h`}</div>}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '8px', fontSize: theme.size.tiny, color: theme.colors.light }}>
        {!view.compare && <span style={{ color: theme.colors.dim }}>{alt(view.altitudesFt[view.cruiseIndex])}:</span>}
        {legend.map((l, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '14px', height: '4px', borderRadius: '2px', background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}
