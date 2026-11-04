import { useMemo } from 'react'
import { useFlightPlanStore } from '../../state/flight-plan-store'
import { usePlacesStore } from '../../state/places-store'
import { defaultMslLevels, isForecastCurrent, planBaseTs, siteGroundFt, slotTs } from '../../data/logic/forecast-logic'
import { buildSitePlan, planAltitudes, type SitePlan } from '../../data/logic/plan-logic'
import type { LaunchSite } from '../../data/models'

export interface FlightPlanView {
  sites: LaunchSite[]
  baseTs: number
  ts: number
  /** Altitudes in use (ft): AGL above each site, or the shared MSL set. */
  altitudesFt: number[]
  plans: SitePlan[]
  /** Some chosen site has no forecast for this plan (or the wrong model). */
  needsFetch: boolean
  compare: boolean
  /** Cruise altitude index, clamped to the altitude set. */
  cruiseIndex: number
}

/** Chosen sites, the viewed hour, and each site's wind + drift result. */
export function useFlightPlan(): FlightPlanView {
  const allSites = usePlacesStore(s => s.launchSites)
  const zones = usePlacesStore(s => s.zones)
  const { selectedSiteIds, date, hour, slot, mode, aglFt, mslFt, model, driftMinutes, forecasts, compare, cruiseIndex } = useFlightPlanStore()

  return useMemo(() => {
    const sites = selectedSiteIds.map(id => allSites.find(s => s.id === id)).filter((s): s is LaunchSite => !!s)
    const baseTs = planBaseTs(date, hour)
    const ts = slotTs(baseTs, slot)
    const grounds = sites.map(s => siteGroundFt(s, forecasts[s.id])).filter((g): g is number => g !== null)
    const altitudesFt = planAltitudes(mode, aglFt, mslFt ?? defaultMslLevels(grounds))
    const current = sites.filter(s => isForecastCurrent(forecasts[s.id], model, baseTs))
    const plans = current.map(s => buildSitePlan(s, forecasts[s.id], ts, mode, altitudesFt, driftMinutes, zones))
    const cruise = Math.min(Math.max(0, cruiseIndex), altitudesFt.length - 1)
    return { sites, baseTs, ts, altitudesFt, plans, needsFetch: current.length < sites.length, compare, cruiseIndex: cruise }
  }, [allSites, selectedSiteIds, date, hour, slot, mode, aglFt, mslFt, model, driftMinutes, forecasts, compare, cruiseIndex, zones])
}
