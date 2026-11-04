import { useEffect } from 'react'
import { theme } from '../../theme'
import { useLaunchSiteStore } from '../../../state/launch-site-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useFlightPlan } from '../../hooks/useFlightPlan'
import { modelLabel, modelReaches } from '../../../data/logic/forecast-logic'
import { LaunchSiteList } from './LaunchSiteList'
import { PlanControls } from './PlanControls'
import { HourScrubber } from './HourScrubber'
import { DriftOptions } from './DriftOptions'
import { PlanMiniMap } from './PlanMiniMap'
import { SiteResultCard } from './SiteResultCard'
import { buttonStyle, sectionStyle, sectionTitle } from './plan-styles'

/** What-if flight planning: pick sites and a time, compare winds and drift. */
export function PlanPage() {
  const loadSites = useLaunchSiteStore(s => s.load)
  const { fetching, error, fetchForecasts, model, forecasts } = useFlightPlanStore()
  const view = useFlightPlan()

  useEffect(() => { loadSites() }, [loadSites])

  const canFetch = view.sites.length > 0 && !fetching
  const reaches = modelReaches(model, view.baseTs, Date.now())
  const fetchedAt = view.plans.length ? Math.min(...view.plans.map(p => forecasts[p.site.id]?.fetchedAt ?? Date.now())) : null
  const note: React.CSSProperties = { fontSize: theme.size.small, marginBottom: '8px' }

  return (
    <div style={{ padding: '12px', fontFamily: theme.font.primary, color: theme.colors.light }}>
      <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '10px' }}>Flight Plan</div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>
          {view.plans.length > 0
            ? `Drift track · ${new Date(view.ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`
            : 'Plan map · tap a site to choose it, tap the map to add one'}
        </div>
        <PlanMiniMap view={view} />
        {view.plans.length > 0 && (
          <>
            <div style={{ marginTop: '10px' }}><HourScrubber view={view} /></div>
            <div style={{ marginTop: '10px' }}><DriftOptions view={view} /></div>
          </>
        )}
      </div>

      <LaunchSiteList />
      <PlanControls view={view} />

      {!reaches && <div style={{ ...note, color: theme.colors.amber }}>{modelLabel(model)} doesn’t forecast that far ahead — expect no data. Try GFS or Best match.</div>}
      <button onClick={() => fetchForecasts(view.sites)} disabled={!canFetch}
        style={{ ...buttonStyle(true, !canFetch), width: '100%', marginBottom: '8px' }}>
        {fetching ? 'Fetching…' : view.needsFetch ? `Get ${modelLabel(model)} forecast` : 'Refresh forecast'}
      </button>
      {error && <div style={{ ...note, color: theme.colors.red }}>{error}</div>}
      {view.needsFetch && view.plans.length > 0 && (
        <div style={{ ...note, color: theme.colors.amber }}>Some sites need a forecast for this time/model — tap Get forecast.</div>
      )}
      {fetchedAt && (
        <div style={{ color: theme.colors.dim, fontSize: theme.size.tiny, marginBottom: '8px' }}>
          {modelLabel(model)} · fetched {new Date(fetchedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      {view.plans.length > 0 && (
        <>
          {view.plans.map(p => (
            <SiteResultCard key={p.site.id} plan={p} number={view.sites.indexOf(p.site) + 1}
              cruiseIndex={view.cruiseIndex} compare={view.compare} model={model} />
          ))}
          <div style={{ color: theme.colors.dim, fontSize: theme.size.tiny, lineHeight: 1.4 }}>
            Predicted ground track holding one altitude with no airspeed of your own, stepped every minute through the
            forecast hours. Dots every 15 min. Real flights climb and descend — this is a single-altitude estimate.
            With Compare altitudes on, tracks that overlap mean the column is uniform; a fan means changing altitude changes drift direction.
          </div>
        </>
      )}
    </div>
  )
}
