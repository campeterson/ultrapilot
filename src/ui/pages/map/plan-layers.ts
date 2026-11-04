// Flight-plan map drawing for the plan panel's map (the main map is for flying):
// launch sites (chosen ones numbered in their site color) and drift tracks
// with 15-minute dots and an altitude label at the end.
import maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import { formatAltitude } from '../../../data/logic/units-logic'
import { drawnLevels, planExtent } from '../../../data/logic/plan-logic'
import { driftColor, siteColor } from '../plan/plan-styles'
import type { FlightPlanView } from '../../hooks/useFlightPlan'
import type { AltitudeUnit, LaunchSite, SiteForecast } from '../../../data/models'

/** Changes whenever a new forecast is fetched. */
export function fetchKey(forecasts: Record<string, SiteForecast>): string {
  return Object.values(forecasts).map(f => f.fetchedAt).join(',')
}

const SITES = 'plan-sites'
const DRIFT = 'plan-drift'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Add sources + layers once. `onSiteTap` gets the tapped site's id. */
export function ensurePlanLayers(map: maplibregl.Map, onSiteTap: (id: string) => void) {
  if (map.getSource(SITES)) return
  map.addSource(DRIFT, { type: 'geojson', data: EMPTY })
  map.addSource(SITES, { type: 'geojson', data: EMPTY })
  map.addLayer({ id: 'plan-drift-casing', type: 'line', source: DRIFT, filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': 5.5, 'line-opacity': 0.45 } })
  map.addLayer({ id: 'plan-drift-line', type: 'line', source: DRIFT, filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3 } })
  map.addLayer({ id: 'plan-drift-ticks', type: 'circle', source: DRIFT, filter: ['==', ['get', 'kind'], 'tick'],
    paint: { 'circle-radius': 3.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } })
  map.addLayer({ id: 'plan-drift-end', type: 'circle', source: DRIFT, filter: ['==', ['get', 'kind'], 'end'],
    paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5 } })
  map.addLayer({ id: 'plan-drift-labels', type: 'symbol', source: DRIFT, filter: ['==', ['get', 'kind'], 'end'],
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11,
      'text-anchor': 'left', 'text-offset': [0.7, 0], 'text-allow-overlap': true },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
  map.addLayer({ id: 'plan-sites-tap', type: 'circle', source: SITES,
    paint: { 'circle-radius': 22, 'circle-color': 'transparent', 'circle-opacity': 0 } })
  map.addLayer({ id: 'plan-sites-circle', type: 'circle', source: SITES,
    paint: { 'circle-radius': ['case', ['get', 'chosen'], 10, 7], 'circle-color': ['case', ['get', 'chosen'], ['get', 'color'], '#fff'],
      'circle-stroke-color': ['case', ['get', 'chosen'], '#000', theme.colors.launchSite], 'circle-stroke-width': 2.5 } })
  map.addLayer({ id: 'plan-sites-number', type: 'symbol', source: SITES, filter: ['get', 'chosen'],
    layout: { 'text-field': ['get', 'number'], 'text-font': ['Open Sans Regular'], 'text-size': 11, 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' } })
  map.addLayer({ id: 'plan-sites-labels', type: 'symbol', source: SITES,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Regular'], 'text-size': 11,
      'text-anchor': 'top', 'text-offset': [0, 1.2] },
    paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1.2 } })

  map.on('click', 'plan-sites-tap', (e) => {
    e.preventDefault()
    const id = e.features?.[0]?.properties?.id as string | undefined
    if (id) onSiteTap(id)
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
        properties: { id: s.id, name: s.name, chosen: idx >= 0, number: idx >= 0 ? String(idx + 1) : '', color: idx >= 0 ? siteColor(idx) : '#fff' },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      }
    }),
  }
}

/** Color by altitude when comparing altitudes, by site when showing one. */
function driftFeatures(view: FlightPlanView, unit: AltitudeUnit): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const plan of view.plans) {
    const siteIdx = view.sites.indexOf(plan.site)
    for (const l of drawnLevels(plan, view.compare, view.cruiseIndex)) {
      if (!l.track || l.track.coords.length < 2) continue
      const color = view.compare ? driftColor(l.index) : siteColor(siteIdx)
      features.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: l.track.coords } })
      for (const t of l.track.ticks) {
        features.push({ type: 'Feature', properties: { color, kind: 'tick' }, geometry: { type: 'Point', coordinates: [t.lon, t.lat] } })
      }
      const label = view.compare ? Number(formatAltitude(view.altitudesFt[l.index], unit)).toLocaleString() : `${siteIdx + 1}`
      features.push({ type: 'Feature', properties: { color, kind: 'end', label },
        geometry: { type: 'Point', coordinates: l.track.coords[l.track.coords.length - 1] } })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function setPlanData(map: maplibregl.Map, sites: LaunchSite[], selected: string[], view: FlightPlanView | null, unit: AltitudeUnit) {
  ;(map.getSource(SITES) as maplibregl.GeoJSONSource | undefined)?.setData(siteFeatures(sites, selected))
  ;(map.getSource(DRIFT) as maplibregl.GeoJSONSource | undefined)?.setData(view ? driftFeatures(view, unit) : EMPTY)
}

/** Frame every chosen site and its drawn tracks. */
export function fitPlan(map: maplibregl.Map, view: FlightPlanView, sites: LaunchSite[], padding: maplibregl.PaddingOptions, animate = true) {
  let ext = planExtent(view.plans, view.compare, view.cruiseIndex)
  for (const s of sites) {
    ext = ext ? [Math.min(ext[0], s.lon), Math.min(ext[1], s.lat), Math.max(ext[2], s.lon), Math.max(ext[3], s.lat)] : [s.lon, s.lat, s.lon, s.lat]
  }
  if (!ext) return
  map.fitBounds([[ext[0], ext[1]], [ext[2], ext[3]]], { padding, maxZoom: 12, duration: animate ? 600 : 0 })
}
