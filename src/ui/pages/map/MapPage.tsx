import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './pmtiles-protocol'
import { useGPSStore } from '../../../state/gps-store'
import { useSessionStore } from '../../../state/session-store'
import { useWaypointStore } from '../../../state/waypoint-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { useDirectToStore } from '../../../state/direct-to-store'
import { useRouteStore } from '../../../state/route-store'
import { useAirportStore } from '../../../state/airport-store'
import { useWeatherStore } from '../../../state/weather-store'
import { getTrackPoints, getEvents } from '../../../data/db'
import { destinationPoint } from '../../../data/logic/gps-logic'
import { theme } from '../../theme'
import { MapControls } from './MapControls'
import { PROTOMAPS_STYLE_LIGHT } from './map-style'
import { EVENT_COLORS, EVENT_LABELS } from '../../../data/logic/stamp-logic'
import type { Airport, Waypoint } from '../../../data/models'

const MAP_STORAGE_KEY = 'ultrapilot_mapState'
const DIR_LINE_NM = 1.5
const RING_RADII_M = [926, 1852, 3704] // 0.5, 1, 2 nm
const AIRPORT_MIN_ZOOM = 8

// Aviation color constants per docs/04-MAP_CONVENTIONS.md
const COLOR_TRACK = theme.colors.trackGreen  // green — breadcrumb trail
const COLOR_MAGENTA = theme.colors.magenta   // magenta — active navigation

const DEFAULT_MAP_STATE = { center: [-94.6, 38.9] as [number, number], zoom: 11 }

function loadMapState(): { center: [number, number]; zoom: number } {
  try {
    const raw = localStorage.getItem(MAP_STORAGE_KEY)
    if (!raw) return DEFAULT_MAP_STATE
    const parsed = JSON.parse(raw) as { center: [number, number]; zoom: number }
    const [a, b] = parsed.center
    const zoom = typeof parsed.zoom === 'number' ? parsed.zoom : 11
    // MapLibre expects [lng, lat]. Valid: |lng| ≤ 180, |lat| ≤ 90.
    if (Math.abs(a) <= 180 && Math.abs(b) <= 90) {
      return { center: [a, b], zoom }
    }
    // Legacy Leaflet format was [lat, lng] — swap it.
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return { center: [b, a], zoom }
    }
  } catch {}
  return DEFAULT_MAP_STATE
}

function saveMapState(map: maplibregl.Map) {
  const c = map.getCenter()
  localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() }))
}

function newWpId() {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

/** Approximate geographic circle as a GeoJSON Polygon */
function circlePolygon(lat: number, lon: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const dx = (radiusM * Math.cos(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))
    const dy = (radiusM * Math.sin(angle)) / 110540
    coords.push([lon + dx, lat + dy])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}

function makeArrowEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:24px;height:32px;`
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -16 24 32" width="24" height="32">
    <polygon points="0,-14 8,10 0,5 -8,10" fill="${theme.colors.red}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`
  return el
}

function makeOriginEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `display:flex;flex-direction:column;align-items:center;pointer-events:none;`
  el.innerHTML = `
    <div style="background:rgba(20,20,24,0.85);color:${theme.colors.cream};font-family:${theme.font.primary};font-size:10px;padding:2px 6px;border-radius:3px;border:1px solid rgba(255,255,255,0.25);margin-bottom:3px;white-space:nowrap;">ORIGIN</div>
    <div style="width:12px;height:12px;border-radius:50%;border:2px solid ${theme.colors.cream};background:transparent;"></div>`
  return el
}

type MapSelection =
  | { kind: 'tap';           lat: number; lon: number; x: number; y: number }
  | { kind: 'waypoint';      waypoint: Waypoint;       x: number; y: number }
  | { kind: 'airport';       airport: Airport;          x: number; y: number }
  | { kind: 'routeWaypoint'; routeId: string; legIndex: number; waypoint: Waypoint; x: number; y: number }

export function MapPage({ showControls = true }: { showControls?: boolean }) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)
  const posMarkerRef = useRef<maplibregl.Marker | null>(null)
  const originMarkerRef = useRef<maplibregl.Marker | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)
  // Store current track heading for orientation-toggle use
  const currentTrackRef = useRef(0)

  const { position, smoothedTrack } = useGPSStore()
  const { session, historySessionId, trackBuffer, resetOrigin } = useSessionStore()
  const { waypoints, load: loadWaypoints, save: saveWaypoint, shareWaypoint } = useWaypointStore()
  const { showDirectionLine, showDistanceRings, mapOrientation } = useMapSettingsStore()
  const { target: directTo, setTarget: setDirectTo } = useDirectToStore()
  const { waypointsForRoute, active: activeRoute, previewRouteId, jumpToLeg } = useRouteStore()
  const routeWaypoints = useWaypointStore(s => s.waypoints)
  const { loadDatabase: loadAirports, allAirports, loaded: airportsLoaded } = useAirportStore()

  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [wpForm, setWpForm] = useState<{ lat: number; lon: number } | null>(null)
  const [wpName, setWpName] = useState('')

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const saved = loadMapState()
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: PROTOMAPS_STYLE_LIGHT,
      center: saved.center,
      zoom: saved.zoom,
      bearing: 0,
      attributionControl: false,
      pitchWithRotate: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      mapLoadedRef.current = true

      // ── GeoJSON sources ───────────────────────────────────────────────────
      const sources: [string, GeoJSON.FeatureCollection | GeoJSON.Feature][] = [
        ['history-source',      emptyFC()],
        ['history-events',      emptyFC()],
        ['route-source',        emptyFC()],
        ['route-waypoints',     emptyFC()],
        ['direct-to-source',    emptyFC()],
        ['direction-source',    emptyFC()],
        ['rings-source',        emptyFC()],
        ['track-source',        emptyFC()],
        ['waypoints-source',    emptyFC()],
        ['airports-source',     emptyFC()],
      ]
      for (const [id, data] of sources) {
        map.addSource(id, { type: 'geojson', data })
      }

      // ── Layers (painter order: back to front) ─────────────────────────────

      // History track
      map.addLayer({ id: 'history-track', type: 'line', source: 'history-source',
        paint: { 'line-color': COLOR_TRACK, 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [3, 3] } })

      // History event dots
      map.addLayer({ id: 'history-events-layer', type: 'circle', source: 'history-events',
        paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } })

      // Distance rings
      map.addLayer({ id: 'rings-layer', type: 'line', source: 'rings-source',
        paint: { 'line-color': theme.colors.dim, 'line-width': 1, 'line-opacity': 0.5 } })

      // Route — black border then magenta on top
      map.addLayer({ id: 'route-border', type: 'line', source: 'route-source',
        paint: { 'line-color': '#000', 'line-width': ['case', ['get', 'active'], 7, 5], 'line-opacity': 0.4 } })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route-source',
        paint: {
          'line-color': COLOR_MAGENTA,
          'line-width': ['case', ['get', 'active'], 4, 3],
          'line-opacity': ['case', ['get', 'active'], 0.95, 0.6],
          'line-dasharray': ['case', ['get', 'active'], ['literal', [1]], ['literal', [6, 4]]],
        } })

      // Route waypoint tap targets (invisible, 22px radius for 44px touch target)
      map.addLayer({ id: 'route-waypoints-tap', type: 'circle', source: 'route-waypoints',
        paint: { 'circle-radius': 22, 'circle-color': 'transparent', 'circle-opacity': 0 } })

      // Route waypoint dots
      map.addLayer({ id: 'route-waypoints-dots', type: 'circle', source: 'route-waypoints',
        paint: {
          'circle-radius': ['case', ['get', 'isCurrentLeg'], 9, 6],
          'circle-color': ['case', ['get', 'isCurrentLeg'], COLOR_MAGENTA, 'rgba(30,30,36,0.9)'],
          'circle-stroke-color': '#000',
          'circle-stroke-width': 2,
        } })

      // Route waypoint labels
      map.addLayer({ id: 'route-waypoints-labels', type: 'symbol', source: 'route-waypoints',
        layout: {
          'text-field': ['concat', ['to-string', ['get', 'legNum']], '. ', ['get', 'name']],
          'text-font': ['Open Sans Regular'],
          'text-size': 11,
          'text-anchor': 'bottom',
          'text-offset': [0, -0.8],
          'text-allow-overlap': false,
        },
        paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1 } })

      // Direct-To line
      map.addLayer({ id: 'direct-to-line', type: 'line', source: 'direct-to-source',
        paint: { 'line-color': COLOR_MAGENTA, 'line-width': 2, 'line-opacity': 0.85, 'line-dasharray': [5, 3] } })

      // Direction projection line
      map.addLayer({ id: 'direction-line', type: 'line', source: 'direction-source',
        paint: { 'line-color': theme.colors.cream, 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [3, 3] } })

      // Live track (green breadcrumb)
      map.addLayer({ id: 'track-line', type: 'line', source: 'track-source',
        paint: { 'line-color': COLOR_TRACK, 'line-width': 2, 'line-opacity': 0.9 } })

      // Airport circles
      map.addLayer({ id: 'airports-circle', type: 'circle', source: 'airports-source',
        minzoom: AIRPORT_MIN_ZOOM,
        paint: {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-color': theme.colors.cyan,
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        } })

      // Airport labels
      map.addLayer({ id: 'airports-labels', type: 'symbol', source: 'airports-source',
        minzoom: AIRPORT_MIN_ZOOM,
        layout: {
          'text-field': ['get', 'id'],
          'text-font': ['Open Sans Regular'],
          'text-size': 11,
          'text-anchor': 'bottom',
          'text-offset': [0, -0.8],
          'text-allow-overlap': false,
        },
        paint: { 'text-color': theme.colors.cyan, 'text-halo-color': '#000', 'text-halo-width': 1 } })

      // Waypoints — tap target then visible dot
      map.addLayer({ id: 'waypoints-tap', type: 'circle', source: 'waypoints-source',
        paint: { 'circle-radius': 22, 'circle-color': 'transparent', 'circle-opacity': 0 } })
      map.addLayer({ id: 'waypoints-circle', type: 'circle', source: 'waypoints-source',
        paint: { 'circle-radius': 6, 'circle-color': theme.colors.blue, 'circle-stroke-color': theme.colors.blue, 'circle-stroke-width': 2, 'circle-opacity': 0.85 } })
      map.addLayer({ id: 'waypoints-labels', type: 'symbol', source: 'waypoints-source',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular'],
          'text-size': 11,
          'text-anchor': 'bottom',
          'text-offset': [0, -0.8],
          'text-allow-overlap': false,
        },
        paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1 } })

      // ── Click handlers ────────────────────────────────────────────────────

      map.on('click', 'airports-circle', (e) => {
        e.preventDefault()
        const f = e.features?.[0]
        if (!f) return
        const props = f.properties as { id: string; name: string; elev: number; lat: number; lon: number }
        setSelection({ kind: 'airport', airport: { id: props.id, name: props.name, lat: props.lat, lon: props.lon, elev: props.elev }, x: e.point.x, y: e.point.y })
      })

      map.on('click', 'waypoints-tap', (e) => {
        e.preventDefault()
        const f = e.features?.[0]
        if (!f) return
        const p = f.properties as { id: string; name: string; lat: number; lon: number; note: string | null; createdAt: string }
        const wp: Waypoint = { id: p.id, name: p.name, lat: p.lat, lon: p.lon, note: p.note, createdAt: p.createdAt }
        setSelection({ kind: 'waypoint', waypoint: wp, x: e.point.x, y: e.point.y })
      })

      map.on('click', 'route-waypoints-tap', (e) => {
        e.preventDefault()
        const f = e.features?.[0]
        if (!f) return
        const p = f.properties as { routeId: string; legIndex: number; id: string; name: string; lat: number; lon: number; note: string | null; createdAt: string }
        const wp: Waypoint = { id: p.id, name: p.name, lat: p.lat, lon: p.lon, note: p.note, createdAt: p.createdAt }
        setSelection({ kind: 'routeWaypoint', routeId: p.routeId, legIndex: p.legIndex, waypoint: wp, x: e.point.x, y: e.point.y })
      })

      // Empty map tap (only fires when no feature layer handled it)
      map.on('click', (e) => {
        if ((e as maplibregl.MapMouseEvent & { defaultPrevented?: boolean }).defaultPrevented) return
        setSelection({ kind: 'tap', lat: e.lngLat.lat, lon: e.lngLat.lng, x: e.point.x, y: e.point.y })
      })

      // Cursor styles
      for (const layer of ['airports-circle', 'waypoints-tap', 'route-waypoints-tap']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
    })

    map.on('dragstart', () => { autoFollowRef.current = false })
    map.on('moveend', () => saveMapState(map))

    mapRef.current = map

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current!)

    return () => {
      ro.disconnect()
      mapLoadedRef.current = false
      posMarkerRef.current?.remove()
      posMarkerRef.current = null
      originMarkerRef.current?.remove()
      originMarkerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Load airports + waypoints ────────────────────────────────────────────────
  useEffect(() => { loadAirports() }, [loadAirports])
  useEffect(() => { loadWaypoints() }, [loadWaypoints])

  // ── Airports → GeoJSON source ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current || !airportsLoaded) return
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: allAirports.map(ap => ({
        type: 'Feature',
        properties: { id: ap.id, name: ap.name, elev: ap.elev, lat: ap.lat, lon: ap.lon },
        geometry: { type: 'Point', coordinates: [ap.lon, ap.lat] },
      })),
    }
    ;(map.getSource('airports-source') as maplibregl.GeoJSONSource | undefined)?.setData(fc)
  }, [airportsLoaded, allAirports])

  // ── Waypoints → GeoJSON source ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: waypoints.map(wp => ({
        type: 'Feature',
        properties: { id: wp.id, name: wp.name, lat: wp.lat, lon: wp.lon, note: wp.note, createdAt: wp.createdAt },
        geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
      })),
    }
    ;(map.getSource('waypoints-source') as maplibregl.GeoJSONSource | undefined)?.setData(fc)
  }, [waypoints])

  // ── Position marker + bearing + direction line + distance rings ──────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return

    const lngLat: [number, number] = [position.lon, position.lat]

    // Use smoothed track from the GPS store (circular EMA). Falls back to
    // device compass heading, then 0, until we have enough motion to resolve.
    const track = smoothedTrack ?? position.heading ?? 0
    currentTrackRef.current = track

    // Position arrow marker. rotationAlignment:'map' + rotation:track means the
    // arrow points in the geographic track direction regardless of map bearing,
    // so in Track Up mode the arrow naturally points toward the top of screen.
    if (!posMarkerRef.current) {
      posMarkerRef.current = new maplibregl.Marker({
        element: makeArrowEl(),
        anchor: 'center',
        rotation: track,
        rotationAlignment: 'map',
      })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      posMarkerRef.current.setLngLat(lngLat)
      posMarkerRef.current.setRotation(track)
    }

    // Track Up: rotate map to keep aircraft heading toward top. Gated on a
    // smoothed track existing (so we don't rotate on GPS jitter at rest).
    if (mapOrientation === 'track-up' && smoothedTrack !== null) {
      map.setBearing(track)
    }

    if (autoFollowRef.current) {
      map.setCenter(lngLat)
    }

    // Direction projection line
    if (!mapLoadedRef.current) return
    const dirSrc = map.getSource('direction-source') as maplibregl.GeoJSONSource | undefined
    if (showDirectionLine && position.speed > 0.5) {
      const start = destinationPoint(position.lat, position.lon, track, 0.02)
      const end = destinationPoint(position.lat, position.lon, track, DIR_LINE_NM)
      dirSrc?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[start[1], start[0]], [end[1], end[0]]] } })
    } else {
      dirSrc?.setData(emptyFC())
    }

    // Distance rings
    const ringsSrc = map.getSource('rings-source') as maplibregl.GeoJSONSource | undefined
    if (showDistanceRings) {
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: RING_RADII_M.map(r => circlePolygon(position.lat, position.lon, r)),
      }
      ringsSrc?.setData(fc)
    } else {
      ringsSrc?.setData(emptyFC())
    }
  }, [position, smoothedTrack, mapOrientation, showDirectionLine, showDistanceRings])

  // ── React to orientation mode change ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (mapOrientation === 'north-up') {
      map.rotateTo(0, { duration: 300 })
    } else {
      map.setBearing(currentTrackRef.current)
    }
  }, [mapOrientation])

  // ── Direct-To line ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    const src = map.getSource('direct-to-source') as maplibregl.GeoJSONSource | undefined
    if (!directTo || !position) {
      src?.setData(emptyFC())
      return
    }
    src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[position.lon, position.lat], [directTo.lon, directTo.lat]] } })
  }, [directTo, position])

  // ── Route layers ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    const routeId = activeRoute?.routeId ?? previewRouteId
    if (!routeId) {
      ;(map.getSource('route-source') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC())
      ;(map.getSource('route-waypoints') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC())
      return
    }

    const wps = waypointsForRoute(routeId)
    if (wps.length < 2) return

    const isFlying = !!activeRoute && activeRoute.routeId === routeId
    const coords: [number, number][] = wps.map(w => [w.lon, w.lat])

    ;(map.getSource('route-source') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: { active: isFlying },
      geometry: { type: 'LineString', coordinates: coords },
    })

    const wpFeatures: GeoJSON.Feature[] = wps.map((wp, i) => ({
      type: 'Feature',
      properties: {
        routeId, legIndex: i,
        id: wp.id, name: wp.name, lat: wp.lat, lon: wp.lon, note: wp.note, createdAt: wp.createdAt,
        isCurrentLeg: isFlying && i === activeRoute.legIndex,
        legNum: i + 1,
      },
      geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
    }))
    ;(map.getSource('route-waypoints') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: wpFeatures })
  // routeWaypoints dep ensures redraw when waypoint data loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute, previewRouteId, routeWaypoints])

  // ── Origin marker ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!session) {
      originMarkerRef.current?.remove()
      originMarkerRef.current = null
      return
    }
    const lngLat: [number, number] = [session.originLon, session.originLat]
    if (!originMarkerRef.current) {
      originMarkerRef.current = new maplibregl.Marker({ element: makeOriginEl(), anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      originMarkerRef.current.setLngLat(lngLat)
    }
  }, [session?.id, session?.originLat, session?.originLon])

  // ── Live track ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    const src = map.getSource('track-source') as maplibregl.GeoJSONSource | undefined
    if (!session) {
      src?.setData(emptyFC())
      return
    }
    let cancelled = false
    getTrackPoints(session.id).then(pts => {
      if (cancelled || !mapRef.current) return
      const buf = useSessionStore.getState().trackBuffer
      const all: [number, number][] = [
        ...pts.map(p => [p.lon, p.lat] as [number, number]),
        ...buf.map(p => [p.lon, p.lat] as [number, number]),
      ]
      if (all.length < 2) return
      ;(mapRef.current?.getSource('track-source') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: all },
      })
    })
    return () => { cancelled = true }
  }, [session?.id, trackBuffer])

  // ── History session overlay ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    const trackSrc = map.getSource('history-source') as maplibregl.GeoJSONSource | undefined
    const evtSrc = map.getSource('history-events') as maplibregl.GeoJSONSource | undefined

    if (!historySessionId || session) {
      trackSrc?.setData(emptyFC())
      evtSrc?.setData(emptyFC())
      return
    }

    let cancelled = false
    async function load() {
      const [points, events] = await Promise.all([
        getTrackPoints(historySessionId!),
        getEvents(historySessionId!),
      ])
      if (cancelled || !mapRef.current) return
      const m = mapRef.current

      if (points.length > 1) {
        const coords: [number, number][] = points
          .filter((_, i) => i % 5 === 0 || i === points.length - 1)
          .map(p => [p.lon, p.lat])
        trackSrc?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
        // Fit map to history track
        const lons = coords.map(c => c[0])
        const lats = coords.map(c => c[1])
        m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40 })
      }

      const evtFeatures: GeoJSON.Feature[] = events.map(ev => ({
        type: 'Feature',
        properties: { color: EVENT_COLORS[ev.type], label: EVENT_LABELS[ev.type] },
        geometry: { type: 'Point', coordinates: [ev.lon, ev.lat] },
      }))
      evtSrc?.setData({ type: 'FeatureCollection', features: evtFeatures })
    }
    load()
    return () => { cancelled = true }
  }, [historySessionId, session])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleRecenter() {
    const map = mapRef.current
    const pos = useGPSStore.getState().position
    if (!map || !pos) return
    autoFollowRef.current = true
    map.easeTo({ center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), 13) })
  }

  async function handleSaveWaypoint() {
    if (!wpForm || !wpName.trim()) return
    const w: Waypoint = {
      id: newWpId(),
      name: wpName.trim(),
      lat: wpForm.lat,
      lon: wpForm.lon,
      note: null,
      createdAt: new Date().toISOString(),
    }
    await saveWaypoint(w)
    setWpForm(null)
    setWpName('')
  }

  function dismissAll() { setSelection(null) }

  // ── Styles for popup UI ───────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${theme.colors.darkBorder}`,
    background: 'rgba(255,255,255,0.05)', color: theme.colors.cream,
    fontFamily: theme.font.primary, fontSize: theme.size.body, boxSizing: 'border-box',
  }

  const menuBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    width: '100%', padding: '12px 16px',
    background: 'none', border: 'none',
    borderBottom: `1px solid ${theme.colors.darkBorder}`,
    cursor: 'pointer', fontFamily: theme.font.primary,
    fontSize: theme.size.body, minHeight: theme.tapTarget, textAlign: 'left',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {showControls && <MapControls onRecenter={handleRecenter} />}

      {/* Light-dismiss overlay */}
      {selection && !wpForm && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 99 }} onClick={dismissAll} />
      )}

      {/* Unified map selection popup */}
      {selection && !wpForm && (() => {
        const w = containerRef.current?.clientWidth ?? 300
        const borderColor =
          selection.kind === 'airport'       ? `${theme.colors.cyan}55` :
          selection.kind === 'waypoint'      ? `${theme.colors.blue}55` :
          selection.kind === 'routeWaypoint' ? `${theme.colors.magenta}55` :
          theme.colors.darkBorder

        const selLat = selection.kind === 'tap'          ? selection.lat
          : selection.kind === 'waypoint'                ? selection.waypoint.lat
          : selection.kind === 'routeWaypoint'           ? selection.waypoint.lat
          : selection.airport.lat
        const selLon = selection.kind === 'tap'          ? selection.lon
          : selection.kind === 'waypoint'                ? selection.waypoint.lon
          : selection.kind === 'routeWaypoint'           ? selection.waypoint.lon
          : selection.airport.lon
        const selName = selection.kind === 'tap'
          ? `${selLat.toFixed(4)}, ${selLon.toFixed(4)}`
          : selection.kind === 'waypoint'      ? selection.waypoint.name
          : selection.kind === 'routeWaypoint' ? selection.waypoint.name
          : selection.airport.id

        return (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: Math.min(selection.x + 8, w - 220),
              top: Math.max(selection.y - 150, 8),
              background: theme.colors.darkCard,
              border: `1px solid ${borderColor}`,
              borderRadius: '10px',
              overflow: 'hidden',
              zIndex: 100,
              minWidth: '200px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
              {selection.kind === 'tap' && (
                <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono, letterSpacing: '0.04em' }}>
                  {selLat.toFixed(5)}, {selLon.toFixed(5)}
                </div>
              )}
              {selection.kind === 'waypoint' && (
                <>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>⌖ {selection.waypoint.name}</div>
                  <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '3px' }}>
                    {selLat.toFixed(5)}, {selLon.toFixed(5)}
                  </div>
                  {selection.waypoint.note && (
                    <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginTop: '4px' }}>{selection.waypoint.note}</div>
                  )}
                </>
              )}
              {selection.kind === 'airport' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: theme.colors.cyan, fontFamily: theme.font.mono }}>{selection.airport.id}</span>
                    <span style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono }}>{selection.airport.elev} ft MSL</span>
                  </div>
                  <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginTop: '2px', lineHeight: 1.3 }}>{selection.airport.name}</div>
                </>
              )}
              {selection.kind === 'routeWaypoint' && (
                <>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.magenta }}>{selection.legIndex + 1}. {selection.waypoint.name}</div>
                  <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '3px' }}>
                    {selLat.toFixed(5)}, {selLon.toFixed(5)}
                  </div>
                </>
              )}
            </div>

            {/* Fly Leg */}
            {selection.kind === 'routeWaypoint' && (
              <button
                disabled={!session}
                onClick={() => {
                  if (!session) return
                  const pos = useGPSStore.getState().position
                  jumpToLeg(selection.routeId, selection.legIndex, pos?.lat ?? selLat, pos?.lon ?? selLon)
                  setSelection(null)
                }}
                style={{ ...menuBtnStyle, color: session ? theme.colors.magenta : theme.colors.dim, fontWeight: 700, opacity: session ? 1 : 0.5, cursor: session ? 'pointer' : 'default' }}
              >
                <span>✈</span> Fly Leg{!session && <span style={{ fontSize: theme.size.tiny, fontWeight: 400, marginLeft: 6 }}>(start session first)</span>}
              </button>
            )}

            {/* Direct To */}
            {session && (
              <button
                onClick={() => {
                  const pos = useGPSStore.getState().position
                  setDirectTo({ lat: selLat, lon: selLon, name: selName, fromLat: pos?.lat ?? selLat, fromLon: pos?.lon ?? selLon })
                  setSelection(null)
                }}
                style={{ ...menuBtnStyle, color: theme.colors.magenta }}
              >
                <span>◇</span> Direct To
              </button>
            )}

            {/* Share Waypoint */}
            {selection.kind === 'waypoint' && (
              <button onClick={() => { shareWaypoint(selection.waypoint.id); setSelection(null) }} style={{ ...menuBtnStyle, color: theme.colors.magenta }}>
                <span>↑</span> Share Waypoint
              </button>
            )}

            {/* Add Waypoint */}
            {(selection.kind === 'tap' || selection.kind === 'airport') && (
              <button
                onClick={() => {
                  setWpForm({ lat: selLat, lon: selLon })
                  setWpName(selection.kind === 'airport' ? selection.airport.id : `Waypoint ${waypoints.length + 1}`)
                  setSelection(null)
                }}
                style={{ ...menuBtnStyle, color: theme.colors.cream }}
              >
                <span>⌖</span> Add Waypoint
              </button>
            )}

            {/* Fetch METAR */}
            {selection.kind === 'airport' && (
              <button
                onClick={() => { useWeatherStore.getState().fetchByStation(selection.airport.id); setSelection(null) }}
                style={{ ...menuBtnStyle, color: theme.colors.blue }}
              >
                <span>☁</span> Fetch METAR
              </button>
            )}

            {/* Reset Origin */}
            {selection.kind === 'tap' && session && (
              <button
                onClick={async () => {
                  originMarkerRef.current?.remove()
                  originMarkerRef.current = null
                  const altMSLm = useGPSStore.getState().position?.altMSL ?? 0
                  await resetOrigin(selLat, selLon, altMSLm)
                  setSelection(null)
                }}
                style={{ ...menuBtnStyle, color: theme.colors.amber }}
              >
                <span>◎</span> Reset Origin Here
              </button>
            )}

            <button onClick={dismissAll} style={{ ...menuBtnStyle, color: theme.colors.dim, borderBottom: 'none', justifyContent: 'center', fontSize: theme.size.small }}>
              Dismiss
            </button>
          </div>
        )
      })()}

      {/* Waypoint name form */}
      {wpForm && (
        <div
          onClick={() => { setWpForm(null); setWpName('') }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: theme.colors.darkCard, border: `1px solid ${theme.colors.darkBorder}`, borderRadius: '16px', padding: '24px', width: 'min(300px, calc(100vw - 48px))', fontFamily: theme.font.primary }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream, marginBottom: '4px' }}>Add Waypoint</div>
            <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono, marginBottom: '16px' }}>
              {wpForm.lat.toFixed(5)}, {wpForm.lon.toFixed(5)}
            </div>
            <input
              style={inputStyle}
              value={wpName}
              onChange={e => setWpName(e.target.value)}
              placeholder="Waypoint name"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveWaypoint() }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button
                onClick={() => { setWpForm(null); setWpName('') }}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`, background: 'none', color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget }}
              >Cancel</button>
              <button
                onClick={handleSaveWaypoint}
                disabled={!wpName.trim()}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: wpName.trim() ? theme.colors.red : theme.colors.darkBorder, color: '#fff', cursor: wpName.trim() ? 'pointer' : 'default', fontFamily: theme.font.primary, fontSize: theme.size.body, fontWeight: 700, minHeight: theme.tapTarget }}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
