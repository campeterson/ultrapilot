import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../map/pmtiles-protocol'
import { theme } from '../../theme'
import { useZoneStore } from '../../../state/zone-store'
import { useGPSStore } from '../../../state/gps-store'
import { useLaunchSiteStore } from '../../../state/launch-site-store'
import { zonesExtent } from '../../../data/logic/zone-logic'
import type { ZoneRating } from '../../../data/models'
import { PROTOMAPS_STYLE_LIGHT } from '../map/map-style'
import { ensureZoneLayers, setZoneData, ZONE_COLORS } from '../map/zone-layers'
import { useSatelliteLayer } from '../map/useSatelliteLayer'
import { BasemapToggle } from '../map/BasemapToggle'

export type LonLat = [number, number]
const DRAFT = 'zone-draft'
/** Tapping within this many px of the first corner closes the shape. */
const CLOSE_PX = 22

interface Props {
  /** Corners tapped so far, or null when not drawing. */
  draft: LonLat[] | null
  draftRating: ZoneRating
  onAddPoint: (p: LonLat) => void
  onClose: () => void
}

function draftData(points: LonLat[], color: string): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = []
  if (points.length >= 3) f.push({ type: 'Feature', properties: { color }, geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] } })
  if (points.length >= 2) f.push({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: points } })
  points.forEach((p, i) => f.push({ type: 'Feature', properties: { color, first: i === 0 }, geometry: { type: 'Point', coordinates: p } }))
  return { type: 'FeatureCollection', features: f }
}

function startCenter(): LonLat {
  const p = useGPSStore.getState().position
  const site = useLaunchSiteStore.getState().sites[0]
  return p ? [p.lon, p.lat] : site ? [site.lon, site.lat] : [-94.6, 38.9]
}

/** Zones map: shows every zone; in draw mode, taps add corners. */
export function ZonesMap({ draft, draftRating, onAddPoint, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loadedRef = useRef(false)
  const zones = useZoneStore(s => s.zones)
  // Handlers are bound once; read the latest props through a ref
  const live = useRef({ draft, onAddPoint, onClose })
  live.current = { draft, onAddPoint, onClose }

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current, style: PROTOMAPS_STYLE_LIGHT, center: startCenter(), zoom: 13,
      attributionControl: false, pitchWithRotate: false, dragRotate: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.on('load', () => {
      loadedRef.current = true
      ensureZoneLayers(map)
      map.addSource(DRAFT, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'draft-fill', type: 'fill', source: DRAFT, filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 } })
      map.addLayer({ id: 'draft-line', type: 'line', source: DRAFT, filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } })
      map.addLayer({ id: 'draft-points', type: 'circle', source: DRAFT, filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': ['case', ['get', 'first'], 8, 5], 'circle-color': '#fff',
          'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 } })
      const zs = useZoneStore.getState().zones
      setZoneData(map, zs)
      const ext = zonesExtent(zs)
      if (ext) map.fitBounds([[ext[0], ext[1]], [ext[2], ext[3]]], { padding: 30, maxZoom: 15, duration: 0 })
    })
    map.on('click', (e) => {
      const { draft: d } = live.current
      if (!d) return
      if (d.length >= 3) {
        const first = map.project(d[0] as maplibregl.LngLatLike)
        if (Math.hypot(first.x - e.point.x, first.y - e.point.y) <= CLOSE_PX) { live.current.onClose(); return }
      }
      live.current.onAddPoint([e.lngLat.lng, e.lngLat.lat])
    })
    mapRef.current = map
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); loadedRef.current = false; map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map && loadedRef.current) setZoneData(map, zones)
  }, [zones])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource(DRAFT) as maplibregl.GeoJSONSource | undefined)?.setData(draftData(draft ?? [], ZONE_COLORS[draftRating]))
    // Quick taps add corners while drawing — don't zoom on them
    if (draft) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable()
    map.getCanvas().style.cursor = draft ? 'crosshair' : ''
  }, [draft, draftRating])

  // After the map-creating effect, so the map exists when this runs
  useSatelliteLayer(mapRef, 'zones', () => loadedRef.current, ['zones-fill', 'draft-fill'])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '300px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${draft ? ZONE_COLORS[draftRating] : theme.colors.darkBorder}` }} />
      <BasemapToggle view="zones" style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 5 }} />
    </div>
  )
}
