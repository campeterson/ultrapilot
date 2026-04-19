import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { Map as LeafletMap, Marker, Polyline, Circle } from 'leaflet'
import { useGPSStore } from '../../../state/gps-store'
import { useSessionStore } from '../../../state/session-store'
import { useWaypointStore } from '../../../state/waypoint-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { useDirectToStore } from '../../../state/direct-to-store'
import { useRouteStore } from '../../../state/route-store'
import { useAirportStore } from '../../../state/airport-store'
import { useWeatherStore } from '../../../state/weather-store'
import { getTrackPoints, getEvents } from '../../../data/db'
import { destinationPoint, bearing } from '../../../data/logic/gps-logic'
import { theme } from '../../theme'
import { MapControls } from './MapControls'
import { EVENT_COLORS, EVENT_LABELS } from '../../../data/logic/stamp-logic'
import type { Airport, Waypoint } from '../../../data/models'

const MAP_STORAGE_KEY = 'ultrapilot_mapState'
const DIR_LINE_NM = 1.5
const RING_RADII_M = [926, 1852, 3704] // 0.5, 1, 2 nm
const AIRPORT_MIN_ZOOM = 8
const AIRPORT_CYAN = theme.colors.cyan

function loadMapState() {
  try {
    const raw = localStorage.getItem(MAP_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as { center: [number, number]; zoom: number }
  } catch {}
  return { center: [38.9, -94.6] as [number, number], zoom: 11 }
}

function saveMapState(map: LeafletMap) {
  const c = map.getCenter()
  localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }))
}

function newWpId() {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function makeArrowIcon(headingDeg: number): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -16 24 32" width="24" height="32">
    <polygon points="0,-14 8,10 0,5 -8,10" fill="${theme.colors.red}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`
  return L.divIcon({
    html: `<div style="transform:rotate(${headingDeg}deg);transform-origin:50% 50%;width:24px;height:32px;display:flex;align-items:center;justify-content:center;">${svg}</div>`,
    className: '',
    iconSize: [24, 32],
    iconAnchor: [12, 16],
  })
}

function makeWaypointIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;"><div style="width:12px;height:12px;border-radius:50%;background:${theme.colors.blue};opacity:0.85;border:2px solid ${theme.colors.blue};box-sizing:border-box;"></div></div>`,
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    tooltipAnchor: [0, -22],
  })
}

function makeDirectToIcon(): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20" width="20" height="20">
    <polygon points="0,-8 8,0 0,8 -8,0" fill="none" stroke="${theme.colors.magenta}" stroke-width="2.5" stroke-linejoin="round"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

type MapSelection =
  | { kind: 'tap';          lat: number; lon: number; x: number; y: number }
  | { kind: 'waypoint';     waypoint: Waypoint;        x: number; y: number }
  | { kind: 'airport';      airport: Airport;           x: number; y: number }
  | { kind: 'routeWaypoint'; routeId: string; legIndex: number; waypoint: Waypoint; x: number; y: number }

export function MapPage({ showControls = true }: { showControls?: boolean }) {
  const mapRef = useRef<LeafletMap | null>(null)
  const posMarkerRef = useRef<Marker | null>(null)
  const originMarkerRef = useRef<L.CircleMarker | null>(null)
  const liveTrackRef = useRef<Polyline | null>(null)
  const dirLineRef = useRef<Polyline | null>(null)
  const directToLineRef = useRef<Polyline | null>(null)
  const directToMarkerRef = useRef<Marker | null>(null)
  const distRingsRef = useRef<Circle[]>([])
  const waypointMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const airportMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map())
  const historyLayersRef = useRef<(L.CircleMarker | Polyline)[]>([])
  const routeLayersRef = useRef<(L.Polyline | L.CircleMarker)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)
  const updateAirportsRef = useRef<(() => void) | null>(null)

  const { position } = useGPSStore()
  const { session, historySessionId, trackBuffer, resetOrigin } = useSessionStore()
  const { waypoints, load: loadWaypoints, save: saveWaypoint, shareWaypoint } = useWaypointStore()
  const { showDirectionLine, showDistanceRings } = useMapSettingsStore()
  const { target: directTo, setTarget: setDirectTo } = useDirectToStore()
  const { waypointsForRoute, active: activeRoute, previewRouteId, jumpToLeg } = useRouteStore()
  const routeWaypoints = useWaypointStore(s => s.waypoints)
  const { loadDatabase: loadAirports } = useAirportStore()

  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [wpForm, setWpForm] = useState<{ lat: number; lon: number; name?: string } | null>(null)
  const [wpName, setWpName] = useState('')

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const saved = loadMapState()
    const map = L.map(containerRef.current, {
      center: saved.center,
      zoom: saved.zoom,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)

    function updateAirportMarkers() {
      const { allAirports, loaded } = useAirportStore.getState()
      if (!loaded || allAirports.length === 0) return
      const zoom = map.getZoom()
      if (zoom < AIRPORT_MIN_ZOOM) {
        for (const [, m] of airportMarkersRef.current) m.remove()
        airportMarkersRef.current.clear()
        return
      }
      const bounds = map.getBounds()
      const visible = allAirports.filter(ap => bounds.contains([ap.lat, ap.lon]))
      const visibleIds = new Set(visible.map(ap => ap.id))
      for (const [id, m] of airportMarkersRef.current) {
        if (!visibleIds.has(id)) { m.remove(); airportMarkersRef.current.delete(id) }
      }
      for (const ap of visible) {
        if (airportMarkersRef.current.has(ap.id)) continue
        const m = L.circleMarker([ap.lat, ap.lon], {
          radius: 5, color: AIRPORT_CYAN, weight: 2, fillColor: '#fff', fillOpacity: 0.9,
        }).addTo(map)
        m.bindTooltip(ap.id, { permanent: true, direction: 'top', className: 'airport-label' })
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          const pt = map.latLngToContainerPoint([ap.lat, ap.lon])
          setSelection({ kind: 'airport', airport: ap, x: pt.x, y: pt.y })
        })
        airportMarkersRef.current.set(ap.id, m)
      }
    }

    updateAirportsRef.current = updateAirportMarkers

    map.on('moveend', () => { saveMapState(map); updateAirportMarkers() })
    map.on('zoomend', () => updateAirportMarkers())
    map.on('dragstart', () => { autoFollowRef.current = false })

    let pointerDownAt: { x: number; y: number } | null = null

    map.on('mousedown touchstart', (e) => {
      const orig = (e as L.LeafletMouseEvent).originalEvent as MouseEvent | TouchEvent
      const touch = 'touches' in orig ? orig.touches[0] : orig as MouseEvent
      pointerDownAt = { x: touch.clientX, y: touch.clientY }
    })

    map.on('click', (e) => {
      const me = e as L.LeafletMouseEvent
      if (!pointerDownAt) return
      const orig = me.originalEvent as MouseEvent | TouchEvent
      const touch = 'changedTouches' in orig ? orig.changedTouches[0] : orig as MouseEvent
      const dx = touch.clientX - pointerDownAt.x
      const dy = touch.clientY - pointerDownAt.y
      pointerDownAt = null
      if (Math.sqrt(dx * dx + dy * dy) > 8) return

      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return
      setSelection({
        kind: 'tap',
        lat: me.latlng.lat,
        lon: me.latlng.lng,
        x: touch.clientX - containerRect.left,
        y: touch.clientY - containerRect.top,
      })
    })

    mapRef.current = map

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(containerRef.current!)

    return () => {
      ro.disconnect()
      for (const [, m] of airportMarkersRef.current) m.remove()
      airportMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Load airports + render on initial load ──────────────────────────────────
  useEffect(() => {
    loadAirports().then(() => updateAirportsRef.current?.())
  }, [loadAirports])

  // ── Load waypoints ──────────────────────────────────────────────────────────
  useEffect(() => { loadWaypoints() }, [loadWaypoints])

  // ── Position arrow marker + direction line + distance rings ─────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return

    const latlng: [number, number] = [position.lat, position.lon]

    // Compute heading from last 2 track points when moving, fall back to GPS heading
    const recent = useGPSStore.getState().recentPositions
    const heading = (recent.length >= 2 && position.speed > 1)
      ? bearing(recent[recent.length - 2].lat, recent[recent.length - 2].lon,
                recent[recent.length - 1].lat, recent[recent.length - 1].lon)
      : (position.heading ?? 0)

    if (!posMarkerRef.current) {
      posMarkerRef.current = L.marker(latlng, {
        icon: makeArrowIcon(heading),
        zIndexOffset: 100,
      }).addTo(map)
    } else {
      posMarkerRef.current.setLatLng(latlng)
      posMarkerRef.current.setIcon(makeArrowIcon(heading))
    }

    if (autoFollowRef.current) {
      map.setView(latlng, map.getZoom())
    }

    if (showDirectionLine && position.speed > 0.5) {
      // Start line slightly ahead of the aircraft so it projects from the arrow tip
      const lineStart = destinationPoint(position.lat, position.lon, heading, 0.02)
      const dest = destinationPoint(position.lat, position.lon, heading, DIR_LINE_NM)
      const lineCoords: [number, number][] = [lineStart, dest]
      if (!dirLineRef.current) {
        dirLineRef.current = L.polyline(lineCoords, {
          color: theme.colors.cream, weight: 1.5, opacity: 0.6, dashArray: '4 4',
        }).addTo(map)
      } else {
        dirLineRef.current.setLatLngs(lineCoords)
      }
    } else {
      dirLineRef.current?.remove()
      dirLineRef.current = null
    }

    if (showDistanceRings) {
      if (distRingsRef.current.length === 0) {
        distRingsRef.current = RING_RADII_M.map(r =>
          L.circle(latlng, {
            radius: r, color: theme.colors.dim, weight: 1, fillOpacity: 0, opacity: 0.4,
          }).addTo(map)
        )
      } else {
        distRingsRef.current.forEach(ring => ring.setLatLng(latlng))
      }
    } else {
      distRingsRef.current.forEach(r => r.remove())
      distRingsRef.current = []
    }
  }, [position, showDirectionLine, showDistanceRings])

  // ── Direct-To line + destination marker ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!directTo || !position) {
      directToLineRef.current?.remove()
      directToLineRef.current = null
      directToMarkerRef.current?.remove()
      directToMarkerRef.current = null
      return
    }

    const from: [number, number] = [position.lat, position.lon]
    const to: [number, number] = [directTo.lat, directTo.lon]

    if (!directToLineRef.current) {
      directToLineRef.current = L.polyline([from, to], {
        color: theme.colors.magenta, weight: 2, opacity: 0.85, dashArray: '8 4',
      }).addTo(map)
    } else {
      directToLineRef.current.setLatLngs([from, to])
    }

    if (!directToMarkerRef.current) {
      directToMarkerRef.current = L.marker(to, {
        icon: makeDirectToIcon(),
        zIndexOffset: 90,
      }).addTo(map)
      directToMarkerRef.current.bindTooltip(`D→ ${directTo.name}`, {
        permanent: true, direction: 'top', className: 'origin-tooltip',
      })
    } else {
      directToMarkerRef.current.setLatLng(to)
    }
  }, [directTo, position])

  // ── Route polyline ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    for (const layer of routeLayersRef.current) layer.remove()
    routeLayersRef.current = []
    if (!map) return

    // Determine which route to draw: active takes priority, then preview
    const routeId = activeRoute?.routeId ?? previewRouteId
    if (!routeId) return

    const wps = waypointsForRoute(routeId)
    if (wps.length < 2) return

    const isFlying = !!activeRoute && activeRoute.routeId === routeId
    const layers: (L.Polyline | L.CircleMarker)[] = []

    // Route line — black border underneath, magenta on top
    const allCoords: [number, number][] = wps.map(w => [w.lat, w.lon])
    const lineOpacity = isFlying ? 0.95 : 0.6
    const dashArray = isFlying ? undefined : '8 5'
    // Black border (wider, drawn first so it sits behind)
    layers.push(L.polyline(allCoords, {
      color: '#000', weight: isFlying ? 7 : 5, opacity: lineOpacity * 0.6, dashArray,
    }).addTo(map))
    // Magenta line on top — clickable to select nearest waypoint
    const magentaLine = L.polyline(allCoords, {
      color: theme.colors.magenta, weight: isFlying ? 4 : 3, opacity: lineOpacity, dashArray,
      interactive: true, bubblingMouseEvents: false,
    }).addTo(map)
    magentaLine.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e)
      // Find the waypoint closest to the click point
      let nearest = 0
      let nearestDist = Infinity
      wps.forEach((wp, i) => {
        const pt = map.latLngToContainerPoint([wp.lat, wp.lon])
        const dx = pt.x - e.containerPoint.x
        const dy = pt.y - e.containerPoint.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < nearestDist) { nearestDist = d; nearest = i }
      })
      const wp = wps[nearest]
      setSelection({ kind: 'routeWaypoint', routeId, legIndex: nearest, waypoint: wp, x: e.containerPoint.x, y: e.containerPoint.y })
    })
    layers.push(magentaLine)

    // Waypoint markers — large invisible tap target + small visible dot on top
    wps.forEach((wp, i) => {
      const isCurrentLeg = isFlying && i === activeRoute.legIndex

      // Invisible tap target (44px diameter = 22px radius)
      const tapTarget = L.circleMarker([wp.lat, wp.lon], {
        radius: 22,
        color: 'transparent',
        fillColor: 'transparent',
        fillOpacity: 0,
        weight: 0,
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(map)

      // Visible dot on top (purely decorative, non-interactive)
      const dot = L.circleMarker([wp.lat, wp.lon], {
        radius: isCurrentLeg ? 9 : 6,
        color: '#000',
        weight: 2,
        fillColor: isCurrentLeg ? theme.colors.magenta : 'rgba(30,30,36,0.9)',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map)

      dot.bindTooltip(`${i + 1}. ${wp.name}`, { direction: 'top' })

      tapTarget.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e)
        setSelection({ kind: 'routeWaypoint', routeId, legIndex: i, waypoint: wp, x: e.containerPoint.x, y: e.containerPoint.y })
      })

      layers.push(tapTarget, dot)
    })

    routeLayersRef.current = layers
  // routeWaypoints in deps ensures redraw when waypoints load
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
    const latlng: [number, number] = [session.originLat, session.originLon]
    if (!originMarkerRef.current) {
      originMarkerRef.current = L.circleMarker(latlng, {
        radius: 6, color: theme.colors.cream, weight: 2, fillOpacity: 0,
      }).addTo(map)
      originMarkerRef.current.bindTooltip('ORIGIN', { permanent: true, direction: 'top', className: 'origin-tooltip' })
    } else {
      originMarkerRef.current.setLatLng(latlng)
    }
  }, [session?.id, session?.originLat, session?.originLon])

  // ── Live track ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!session) {
      liveTrackRef.current?.remove()
      liveTrackRef.current = null
      return
    }
    let cancelled = false
    getTrackPoints(session.id).then(pts => {
      if (cancelled || !mapRef.current) return
      const buf = useSessionStore.getState().trackBuffer
      const all: [number, number][] = [
        ...pts.map(p => [p.lat, p.lon] as [number, number]),
        ...buf.map(p => [p.lat, p.lon] as [number, number]),
      ]
      if (all.length < 2) return
      if (!liveTrackRef.current) {
        liveTrackRef.current = L.polyline(all, {
          color: theme.colors.red, weight: 2, opacity: 0.85, dashArray: '6 4',
        }).addTo(mapRef.current)
      } else {
        liveTrackRef.current.setLatLngs(all)
      }
    })
    return () => { cancelled = true }
  }, [session?.id, trackBuffer])

  // ── Waypoint markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const existing = waypointMarkersRef.current
    const currentIds = new Set(waypoints.map(w => w.id))
    for (const [id, marker] of existing) {
      if (!currentIds.has(id)) { marker.remove(); existing.delete(id) }
    }
    for (const wp of waypoints) {
      if (!existing.has(wp.id)) {
        const marker = L.marker([wp.lat, wp.lon], {
          icon: makeWaypointIcon(),
          zIndexOffset: 80,
        }).addTo(map)
        marker.bindTooltip(wp.name, { permanent: false, direction: 'top' })
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          const current = useWaypointStore.getState().waypoints.find(w => w.id === wp.id)
          if (!current) return
          const pt = map.latLngToContainerPoint([current.lat, current.lon])
          setSelection({ kind: 'waypoint', waypoint: current, x: pt.x, y: pt.y })
        })
        existing.set(wp.id, marker)
      }
    }
  }, [waypoints])

  // ── History session overlay ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    for (const layer of historyLayersRef.current) layer.remove()
    historyLayersRef.current = []
    if (!map || !historySessionId || session) return

    let cancelled = false
    async function loadHistory() {
      const [points, events] = await Promise.all([
        getTrackPoints(historySessionId!),
        getEvents(historySessionId!),
      ])
      if (cancelled || !mapRef.current) return
      const m = mapRef.current
      const layers: (L.CircleMarker | Polyline)[] = []
      if (points.length > 1) {
        const coords: [number, number][] = points
          .filter((_, i) => i % 5 === 0 || i === points.length - 1)
          .map(p => [p.lat, p.lon])
        const line = L.polyline(coords, {
          color: theme.colors.red, weight: 2, opacity: 0.7, dashArray: '6 4',
        }).addTo(m)
        layers.push(line)
        m.fitBounds(line.getBounds(), { padding: [40, 40] })
      }
      for (const ev of events) {
        const color = EVENT_COLORS[ev.type]
        const marker = L.circleMarker([ev.lat, ev.lon], {
          radius: 5, color, weight: 2, fillColor: color, fillOpacity: 0.8,
        }).addTo(m)
        marker.bindTooltip(EVENT_LABELS[ev.type], { direction: 'top' })
        layers.push(marker)
      }
      historyLayersRef.current = layers
    }
    loadHistory()
    return () => { cancelled = true }
  }, [historySessionId, session])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleRecenter() {
    const map = mapRef.current
    const pos = useGPSStore.getState().position
    if (!map || !pos) return
    autoFollowRef.current = true
    map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 13))
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

  function dismissAll() {
    setSelection(null)
  }

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
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', isolation: 'isolate' }}
      />
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

        // Extract lat/lon/name for shared actions (Direct To, Add Waypoint)
        const selLat = selection.kind === 'tap' ? selection.lat
          : selection.kind === 'waypoint'      ? selection.waypoint.lat
          : selection.kind === 'routeWaypoint' ? selection.waypoint.lat
          : selection.airport.lat
        const selLon = selection.kind === 'tap' ? selection.lon
          : selection.kind === 'waypoint'      ? selection.waypoint.lon
          : selection.kind === 'routeWaypoint' ? selection.waypoint.lon
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
                  <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>
                    ⌖ {selection.waypoint.name}
                  </div>
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
                    <span style={{ fontSize: '16px', fontWeight: 700, color: theme.colors.cyan, fontFamily: theme.font.mono }}>
                      {selection.airport.id}
                    </span>
                    <span style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono }}>
                      {selection.airport.elev} ft MSL
                    </span>
                  </div>
                  <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginTop: '2px', lineHeight: 1.3 }}>
                    {selection.airport.name}
                  </div>
                </>
              )}
              {selection.kind === 'routeWaypoint' && (
                <>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.magenta }}>
                    {selection.legIndex + 1}. {selection.waypoint.name}
                  </div>
                  <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '3px' }}>
                    {selLat.toFixed(5)}, {selLon.toFixed(5)}
                  </div>
                </>
              )}
            </div>

            {/* Fly Leg — route waypoint only, session required */}
            {selection.kind === 'routeWaypoint' && (
              <button
                disabled={!session}
                onClick={() => {
                  if (!session) return
                  const pos = useGPSStore.getState().position
                  jumpToLeg(selection.routeId, selection.legIndex, pos?.lat ?? selLat, pos?.lon ?? selLon)
                  setSelection(null)
                }}
                style={{
                  ...menuBtnStyle,
                  color: session ? theme.colors.magenta : theme.colors.dim,
                  fontWeight: 700,
                  opacity: session ? 1 : 0.5,
                  cursor: session ? 'pointer' : 'default',
                }}
              >
                <span>✈</span> Fly Leg{!session && <span style={{ fontSize: theme.size.tiny, fontWeight: 400, marginLeft: 6 }}>(start session first)</span>}
              </button>
            )}

            {/* Direct To — all kinds, session required */}
            {session && (
              <button
                onClick={() => {
                  const pos = useGPSStore.getState().position
                  setDirectTo({ lat: selLat, lon: selLon, name: selName,
                    fromLat: pos?.lat ?? selLat, fromLon: pos?.lon ?? selLon })
                  setSelection(null)
                }}
                style={{ ...menuBtnStyle, color: theme.colors.magenta }}
              >
                <span>◇</span> Direct To
              </button>
            )}

            {/* Share Waypoint — waypoint only */}
            {selection.kind === 'waypoint' && (
              <button
                onClick={() => { shareWaypoint(selection.waypoint.id); setSelection(null) }}
                style={{ ...menuBtnStyle, color: theme.colors.magenta }}
              >
                <span>↑</span> Share Waypoint
              </button>
            )}

            {/* Add Waypoint — tap and airport */}
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

            {/* Fetch METAR — airport only */}
            {selection.kind === 'airport' && (
              <button
                onClick={() => {
                  useWeatherStore.getState().fetchByStation(selection.airport.id)
                  setSelection(null)
                }}
                style={{ ...menuBtnStyle, color: theme.colors.blue }}
              >
                <span>☁</span> Fetch METAR
              </button>
            )}

            {/* Reset Origin — tap only, session required */}
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

            {/* Close row — last item, no border */}
            <button
              onClick={dismissAll}
              style={{ ...menuBtnStyle, color: theme.colors.dim, borderBottom: 'none', justifyContent: 'center', fontSize: theme.size.small }}
            >
              Dismiss
            </button>
          </div>
        )
      })()}

      {/* Waypoint name form */}
      {wpForm && (
        <div
          onClick={() => { setWpForm(null); setWpName('') }}
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.colors.darkCard,
              border: `1px solid ${theme.colors.darkBorder}`,
              borderRadius: '16px', padding: '24px',
              width: 'min(300px, calc(100vw - 48px))',
              fontFamily: theme.font.primary,
            }}
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
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: `1px solid ${theme.colors.darkBorder}`,
                  background: 'none', color: theme.colors.light, cursor: 'pointer',
                  fontFamily: theme.font.primary, fontSize: theme.size.body,
                  minHeight: theme.tapTarget,
                }}
              >Cancel</button>
              <button
                onClick={handleSaveWaypoint}
                disabled={!wpName.trim()}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                  background: wpName.trim() ? theme.colors.red : theme.colors.darkBorder,
                  color: '#fff', cursor: wpName.trim() ? 'pointer' : 'default',
                  fontFamily: theme.font.primary, fontSize: theme.size.body,
                  fontWeight: 700, minHeight: theme.tapTarget,
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
