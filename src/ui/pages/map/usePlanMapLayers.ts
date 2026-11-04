// Flight-plan rendering on the live map: saved launch sites, and each chosen
// site's drift track per altitude with 15-minute dots.
import { useEffect, useRef, type MutableRefObject } from 'react'
import maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import { useLaunchSiteStore } from '../../../state/launch-site-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useFlightPlan, type FlightPlanView } from '../../hooks/useFlightPlan'
import { useUnits } from '../../hooks/useUnits'
import { formatAltitude } from '../../../data/logic/units-logic'
import { driftColor } from '../plan/plan-styles'
import type { AltitudeUnit, LaunchSite } from '../../../data/models'

const SITES = 'plan-sites'
const DRIFT = 'plan-drift'

function ensureLayers(map: maplibregl.Map) {
  if (map.getSource(SITES)) return
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  map.addSource(DRIFT, { type: 'geojson', data: empty })
  map.addSource(SITES, { type: 'geojson', data: empty })
  map.addLayer({ id: 'plan-drift-casing', type: 'line', source: DRIFT, filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': 5.5, 'line-opacity': 0.45 } })
  map.addLayer({ id: 'plan-drift-line', type: 'line', source: DRIFT, filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3 } })
  map.addLayer({ id: 'plan-drift-ticks', type: 'circle', source: DRIFT, filter: ['==', ['get', 'kind'], 'tick'],
    paint: { 'circle-radius': 3.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } })
  map.addLayer({ id: 'plan-drift-labels', type: 'symbol', source: DRIFT, filter: ['==', ['get', 'kind'], 'end'],
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11,
      'text-anchor': 'left', 'text-offset': [0.6, 0], 'text-allow-overlap': true },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
  map.addLayer({ id: 'plan-sites-tap', type: 'circle', source: SITES,
    paint: { 'circle-radius': 22, 'circle-color': 'transparent', 'circle-opacity': 0 } })
  map.addLayer({ id: 'plan-sites-circle', type: 'circle', source: SITES,
    paint: { 'circle-radius': 8, 'circle-color': ['case', ['get', 'chosen'], theme.colors.launchSite, '#fff'],
      'circle-stroke-color': theme.colors.launchSite, 'circle-stroke-width': 2.5 } })
  map.addLayer({ id: 'plan-sites-number', type: 'symbol', source: SITES, filter: ['get', 'chosen'],
    layout: { 'text-field': ['get', 'number'], 'text-font': ['Open Sans Regular'], 'text-size': 10, 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' } })
  map.addLayer({ id: 'plan-sites-labels', type: 'symbol', source: SITES,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Regular'], 'text-size': 11,
      'text-anchor': 'top', 'text-offset': [0, 1.1] },
    paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1.2 } })

  // Tapping a site adds it to / removes it from the plan
  map.on('click', 'plan-sites-tap', (e) => {
    e.preventDefault()
    const id = e.features?.[0]?.properties?.id as string | undefined
    if (id) useFlightPlanStore.getState().toggleSite(id)
  })
  map.on('mouseenter', 'plan-sites-tap', () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', 'plan-sites-tap', () => { map.getCanvas().style.cursor = '' })
}

function siteFeatures(sites: LaunchSite[], selected: string[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sites.map(s => {
      const idx = selected.indexOf(s.id)
      return {
        type: 'Feature',
        properties: { id: s.id, name: s.name, chosen: idx >= 0, number: idx >= 0 ? String(idx + 1) : '' },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      }
    }),
  }
}

function driftFeatures(view: FlightPlanView, unit: AltitudeUnit): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const plan of view.plans) {
    for (const l of plan.levels) {
      if (!l.track || l.track.coords.length < 2) continue
      const color = driftColor(l.index)
      features.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: l.track.coords } })
      for (const t of l.track.ticks) {
        features.push({ type: 'Feature', properties: { color, kind: 'tick' }, geometry: { type: 'Point', coordinates: [t.lon, t.lat] } })
      }
      const end = l.track.coords[l.track.coords.length - 1]
      const alt = view.altitudesFt[l.index]
      features.push({ type: 'Feature', properties: { color, kind: 'end', label: Number(formatAltitude(alt, unit)).toLocaleString() },
        geometry: { type: 'Point', coordinates: end } })
    }
  }
  return { type: 'FeatureCollection', features }
}

function fetchKey(forecasts: Record<string, { fetchedAt: number }>): string {
  return Object.values(forecasts).map(f => f.fetchedAt).join(',')
}

export function usePlanMapLayers(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const sites = useLaunchSiteStore(s => s.sites)
  const loadSites = useLaunchSiteStore(s => s.load)
  const { selectedSiteIds, showOnMap } = useFlightPlanStore()
  const view = useFlightPlan()
  const units = useUnits()

  const forecasts = useFlightPlanStore(s => s.forecasts)
  // Forecasts already stored at app start don't move the map — only new fetches
  const fittedRef = useRef(fetchKey(useFlightPlanStore.getState().forecasts))

  useEffect(() => { loadSites() }, [loadSites])

  // After a fetch, frame every site and drift track once
  useEffect(() => {
    const map = mapRef.current
    if (!map || !showOnMap || view.plans.length === 0) return
    const key = fetchKey(forecasts)
    if (fittedRef.current === key) return
    fittedRef.current = key
    const bounds = new maplibregl.LngLatBounds()
    for (const p of view.plans) {
      bounds.extend([p.site.lon, p.site.lat])
      for (const l of p.levels) l.track?.coords.forEach(c => bounds.extend(c))
    }
    map.fitBounds(bounds, { padding: { top: 140, bottom: 90, left: 60, right: 60 }, maxZoom: 13, duration: 600 })
  }, [mapRef, forecasts, view, showOnMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ensureLayers(map)
      ;(map.getSource(SITES) as maplibregl.GeoJSONSource).setData(siteFeatures(sites, selectedSiteIds))
      ;(map.getSource(DRIFT) as maplibregl.GeoJSONSource).setData(
        showOnMap ? driftFeatures(view, units.altitude) : { type: 'FeatureCollection', features: [] })
    }
    if (map.loaded() || map.getSource('track-source')) apply()
    else map.once('load', apply)
    return () => { map.off('load', apply) }
  }, [mapRef, sites, selectedSiteIds, showOnMap, view, units.altitude])
}
