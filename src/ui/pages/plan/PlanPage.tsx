import { useEffect } from 'react'
import { theme } from '../../theme'
import { useLaunchSiteStore } from '../../../state/launch-site-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useFlightPlan } from '../../hooks/useFlightPlan'
import { modelLabel } from '../../../data/logic/forecast-logic'
import { LaunchSiteList } from './LaunchSiteList'
import { PlanControls } from './PlanControls'
import { HourScrubber } from './HourScrubber'
import { SiteResultCard } from './SiteResultCard'
import { buttonStyle, sectionStyle } from './plan-styles'

/** What-if flight planning: pick sites and a time, compare winds and drift. */
export function PlanPage() {
  const loadSites = useLaunchSiteStore(s => s.load)
  const { fetching, error, fetchForecasts, model, forecasts } = useFlightPlanStore()
  const view = useFlightPlan()

  useEffect(() => { loadSites() }, [loadSites])

  const canFetch = view.sites.length > 0 && !fetching
  const fetchedAt = view.plans.length ? Math.min(...view.plans.map(p => forecasts[p.site.id]?.fetchedAt ?? Date.now())) : null

  return (
    <div style={{ padding: '12px', fontFamily: theme.font.primary, color: theme.colors.light }}>
      <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '10px' }}>Flight Plan</div>

      <LaunchSiteList />
      <PlanControls view={view} />

      <button onClick={() => fetchForecasts(view.sites)} disabled={!canFetch}
        style={{ ...buttonStyle(true, !canFetch), width: '100%', marginBottom: '8px' }}>
        {fetching ? 'Fetching…' : view.needsFetch ? `Get ${modelLabel(model)} forecast` : 'Refresh forecast'}
      </button>
      {error && <div style={{ color: theme.colors.red, fontSize: theme.size.small, marginBottom: '8px' }}>{error}</div>}
      {view.needsFetch && view.plans.length > 0 && (
        <div style={{ color: theme.colors.amber, fontSize: theme.size.small, marginBottom: '8px' }}>
          Some sites need a forecast for this time/model — tap Get forecast.
        </div>
      )}
      {fetchedAt && (
        <div style={{ color: theme.colors.dim, fontSize: theme.size.tiny, marginBottom: '8px' }}>
          {modelLabel(model)} · fetched {new Date(fetchedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      {view.plans.length > 0 && (
        <>
          <div style={sectionStyle}>
            <HourScrubber baseTs={view.baseTs} altitudesFt={view.altitudesFt} />
          </div>
          {view.plans.map(p => (
            <SiteResultCard key={p.site.id} plan={p} number={view.sites.indexOf(p.site) + 1} />
          ))}
          <div style={{ color: theme.colors.dim, fontSize: theme.size.tiny, lineHeight: 1.4 }}>
            Drift = holding that altitude with no airspeed of your own, for the chosen duration. Dots every 15 min.
            Model forecast only — check actual conditions before flight.
          </div>
        </>
      )}
    </div>
  )
}
