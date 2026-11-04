// Flight plan on the live map: saved launch sites and the chosen sites' drift tracks.
import { useEffect, useRef, type MutableRefObject } from 'react'
import maplibregl from 'maplibre-gl'
import { useLaunchSiteStore } from '../../../state/launch-site-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useFlightPlan } from '../../hooks/useFlightPlan'
import { useUnits } from '../../hooks/useUnits'
import { ensurePlanLayers, fitPlan, setPlanData } from './plan-layers'
import type { SiteForecast } from '../../../data/models'

export function fetchKey(forecasts: Record<string, SiteForecast>): string {
  return Object.values(forecasts).map(f => f.fetchedAt).join(',')
}

const toggleSite = (id: string) => useFlightPlanStore.getState().toggleSite(id)

export function usePlanMapLayers(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const sites = useLaunchSiteStore(s => s.sites)
  const loadSites = useLaunchSiteStore(s => s.load)
  const { selectedSiteIds, showOnMap, forecasts } = useFlightPlanStore()
  const view = useFlightPlan()
  const units = useUnits()
  // Forecasts already stored at app start don't move the map — only new fetches
  const fittedRef = useRef(fetchKey(useFlightPlanStore.getState().forecasts))

  useEffect(() => { loadSites() }, [loadSites])

  // After a fetch, frame all chosen sites and their tracks once
  useEffect(() => {
    const map = mapRef.current
    if (!map || !showOnMap || view.plans.length === 0) return
    const key = fetchKey(forecasts)
    if (fittedRef.current === key) return
    fittedRef.current = key
    fitPlan(map, view, view.sites, { top: 150, bottom: 90, left: 60, right: 60 })
  }, [mapRef, forecasts, view, showOnMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ensurePlanLayers(map, toggleSite)
      setPlanData(map, sites, selectedSiteIds, showOnMap ? view : null, units.altitude)
    }
    if (map.loaded() || map.getSource('track-source')) apply()
    else map.once('load', apply)
    return () => { map.off('load', apply) }
  }, [mapRef, sites, selectedSiteIds, showOnMap, view, units.altitude])
}
