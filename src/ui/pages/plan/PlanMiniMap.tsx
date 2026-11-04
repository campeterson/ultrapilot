import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../map/pmtiles-protocol'
import { theme } from '../../theme'
import { usePlacesStore } from '../../../state/places-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useUnits } from '../../hooks/useUnits'
import { useUnitsStore } from '../../../state/units-store'
import { useGPSStore } from '../../../state/gps-store'
import type { LaunchSite } from '../../../data/models'
import type { FlightPlanView } from '../../hooks/useFlightPlan'
import { PROTOMAPS_STYLE_LIGHT } from '../map/map-style'
import { ensurePlanLayers, fetchKey, fitPlan, setPlanData } from '../map/plan-layers'
import { ensurePlaceLayers, setPlaceData } from '../map/place-layers'
import { useSatelliteLayer } from '../map/useSatelliteLayer'
import { BasemapToggle } from '../map/BasemapToggle'

const PAD = { top: 30, bottom: 30, left: 30, right: 50 }
const toggleSite = (id: string) => useFlightPlanStore.getState().toggleSite(id)

/** Frame the chosen sites, or every saved site when none is chosen yet. */
const frameSites = (view: FlightPlanView): LaunchSite[] =>
  view.sites.length ? view.sites : usePlacesStore.getState().launchSites

/** Before any site exists: start where the pilot is. */
function startCenter(): [number, number] {
  const p = useGPSStore.getState().position
  return p ? [p.lon, p.lat] : [-94.6, 38.9]
}

/** The planning map: saved launch sites (tap to choose, tap empty map to add)
 *  and every chosen site's drift tracks, inside the Flight Plan panel. */
export function PlanMiniMap({ view }: { view: FlightPlanView }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const viewRef = useRef(view)
  viewRef.current = view
  const sites = usePlacesStore(s => s.launchSites)
  const { selectedSiteIds, forecasts, driftMinutes } = useFlightPlanStore()
  const units = useUnits()
  const places = usePlacesStore(s => s.places)
  const loadPlaces = usePlacesStore(s => s.load)
  useEffect(() => { loadPlaces() }, [loadPlaces])

  useEffect(() => {
    const map = mapRef.current
    if (map && loadedRef.current) setPlaceData(map, places, { hideLaunchPoints: true })
  }, [places])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current, style: PROTOMAPS_STYLE_LIGHT, center: startCenter(), zoom: 9,
      attributionControl: false, pitchWithRotate: false, dragRotate: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    // Tap empty map to add a launch site there (site taps are handled first)
    map.on('click', (e) => {
      if ((e as maplibregl.MapMouseEvent & { defaultPrevented?: boolean }).defaultPrevented) return
      usePlacesStore.getState().setPending({ lat: e.lngLat.lat, lon: e.lngLat.lng, category: 'launch' })
    })
    map.on('load', () => {
      loadedRef.current = true
      ensurePlanLayers(map, toggleSite)
      ensurePlaceLayers(map, 'plan-drift-casing')
      setPlaceData(map, usePlacesStore.getState().places, { hideLaunchPoints: true })
      const v = viewRef.current
      setPlanData(map, usePlacesStore.getState().launchSites, v.sites.map(s => s.id), v, useUnitsStore.getState().altitude)
      fitPlan(map, v, frameSites(v), PAD, false)
    })
    mapRef.current = map
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); loadedRef.current = false; map.remove(); mapRef.current = null }
  }, [])

  // Redraw on any change (including the scrubbed hour)
  useEffect(() => {
    const map = mapRef.current
    if (map && loadedRef.current) setPlanData(map, sites, selectedSiteIds, view, units.altitude)
  }, [sites, selectedSiteIds, view, units.altitude])

  // Re-frame when the sites, forecast, or drawn tracks change — not while scrubbing hours
  const frameKey = `${sites.length}|${selectedSiteIds.join()}|${fetchKey(forecasts)}|${view.compare}|${view.cruiseIndex}|${driftMinutes}|${view.altitudesFt.join()}`
  useEffect(() => {
    const map = mapRef.current
    if (map && loadedRef.current) fitPlan(map, viewRef.current, frameSites(viewRef.current), PAD)
  }, [frameKey])

  // After the map-creating effect, so the map exists when this runs
  useSatelliteLayer(mapRef, 'plan', () => loadedRef.current, ['places-fill', 'plan-drift-casing'])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '320px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.colors.darkBorder}` }} />
      <BasemapToggle view="plan" style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 5 }} />
    </div>
  )
}
