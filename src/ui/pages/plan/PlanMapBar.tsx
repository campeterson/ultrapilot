import { theme } from '../../theme'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useFlightPlan } from '../../hooks/useFlightPlan'
import { HourScrubber } from './HourScrubber'

/** Hour scrubber floating over the map while drift tracks are shown. */
export function PlanMapBar() {
  const { showOnMap, setSetting } = useFlightPlanStore()
  const view = useFlightPlan()
  if (!showOnMap || view.plans.length === 0) return null
  return (
    <div style={{
      position: 'absolute', top: '12px', left: '68px', right: '68px', maxWidth: '360px', margin: '0 auto',
      background: theme.colors.stripBg, border: `1px solid ${theme.colors.darkBorder}`, borderRadius: '10px',
      padding: '6px', zIndex: 60, fontFamily: theme.font.primary, boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.06em', flex: 1, paddingLeft: '4px' }}>
          DRIFT PLAN · {new Date(view.ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <button onClick={() => setSetting('showOnMap', false)} aria-label="Hide drift tracks"
          style={{ minWidth: theme.tapTarget, minHeight: theme.tapTarget, margin: '-8px 0', background: 'none', border: 'none', color: theme.colors.dim, cursor: 'pointer', fontSize: theme.size.body }}>✕</button>
      </div>
      <HourScrubber view={view} compact />
    </div>
  )
}
