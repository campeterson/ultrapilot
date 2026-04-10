import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { Map as LeafletMap, Marker, Polyline, Circle } from 'leaflet'
import { useGPSStore } from '../../../state/gps-store'
import { useSessionStore } from '../../../state/session-store'
import { useWaypointStore } from '../../../state/waypoint-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { getTrackPoints, getEvents } from '../../../data/db'
import { destinationPoint } from '../../../data/logic/gps-logic'
import { theme } from '../../theme'
import { MapControls } from './MapControls'
import { EVENT_COLORS, EVENT_LABELS } from '../../../data/logic/stamp-logic'
import type { Waypoint } from '../../../data/models'

const MAP_STORAGE_KEY = 'ultrapilot_mapState'

// Direction line distance in NM
const DIR_LINE_NM = 1.5
// Distance ring radii in meters
const RING_RADII_M = [926, 1852, 3704] // 0.5, 1, 2 nm

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

interface TapMenu {
  lat: number
  lon: number
  x: number
  y: number
}

export function MapPage() {
  const mapRef = useRef<LeafletMap | null>(null)
  const posMarkerRef = useRef<Marker | null>(null)
  const originMarkerRef = useRef<L.CircleMarker | null>(null)
  const liveTrackRef = useRef<Polyline | null>(null)
  const dirLineRef = useRef<Polyline | null>(null)
  const distRingsRef = useRef<Circle[]>([])
  const waypointMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map())
  const historyLayersRef = useRef<(L.CircleMarker | Polyline)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)

  const { position } = useGPSStore()
  const { session, historySessionId, trackBuffer, resetOrigin } = useSessionStore()
  const { waypoints, load: loadWaypoints, save: saveWaypoint } = useWaypointStore()
  const { showDirectionLine, showDistanceRings } = useMapSettingsStore()

  const [tapMenu, setTapMenu] = useState<TapMenu | null>(null)
  const [wpForm, setWpForm] = useState<{ lat: number; lon: number } | null>(null)
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

    map.on('moveend', () => saveMapState(map))
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
      setTapMenu({
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
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Load waypoints ──────────────────────────────────────────────────────────
  useEffect(() => { loadWaypoints() }, [loadWaypoints])

  // ── Position arrow marker + direction line + distance rings ─────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return

    const latlng: [number, number] = [position.lat, position.lon]
    const heading = position.heading ?? 0

    // Arrow marker
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

    // Direction line
    if (showDirectionLine && position.speed > 0.5) {
      const dest = destinationPoint(position.lat, position.lon, heading, DIR_LINE_NM)
      const lineCoords: [number, number][] = [latlng, dest]
      if (!dirLineRef.current) {
        dirLineRef.current = L.polyline(lineCoords, {
          color: theme.colors.cream,
          weight: 1.5,
          opacity: 0.6,
          dashArray: '4 4',
        }).addTo(map)
      } else {
        dirLineRef.current.setLatLngs(lineCoords)
      }
    } else {
      dirLineRef.current?.remove()
      dirLineRef.current = null
    }

    // Distance rings
    if (showDistanceRings) {
      if (distRingsRef.current.length === 0) {
        distRingsRef.current = RING_RADII_M.map(r =>
          L.circle(latlng, {
            radius: r,
            color: theme.colors.dim,
            weight: 1,
            fillOpacity: 0,
            opacity: 0.4,
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
        const marker = L.circleMarker([wp.lat, wp.lon], {
          radius: 6, color: theme.colors.blue, weight: 2,
          fillColor: theme.colors.blue, fillOpacity: 0.3,
        }).addTo(map)
        marker.bindTooltip(wp.name, { permanent: false, direction: 'top' })
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${theme.colors.darkBorder}`,
    background: 'rgba(255,255,255,0.05)', color: theme.colors.cream,
    fontFamily: theme.font.primary, fontSize: theme.size.body, boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', isolation: 'isolate' }}
        onClick={() => setTapMenu(null)}
      />
      <MapControls onRecenter={handleRecenter} />

      {/* Tap context menu */}
      {tapMenu && !wpForm && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: Math.min(tapMenu.x + 8, (containerRef.current?.clientWidth ?? 300) - 180),
            top: Math.max(tapMenu.y - 60, 8),
            background: theme.colors.darkCard,
            border: `1px solid ${theme.colors.darkBorder}`,
            borderRadius: '10px',
            overflow: 'hidden',
            zIndex: 100,
            minWidth: '160px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ padding: '8px 12px 4px', fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, letterSpacing: '0.04em' }}>
            {tapMenu.lat.toFixed(5)}, {tapMenu.lon.toFixed(5)}
          </div>
          <button
            onClick={() => {
              setWpForm({ lat: tapMenu.lat, lon: tapMenu.lon })
              setWpName('')
              setTapMenu(null)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              width: '100%', padding: '12px 16px',
              background: 'none', border: 'none',
              borderBottom: session ? `1px solid ${theme.colors.darkBorder}` : 'none',
              color: theme.colors.cream, cursor: 'pointer',
              fontFamily: theme.font.primary, fontSize: theme.size.body,
              minHeight: theme.tapTarget, textAlign: 'left',
            }}
          >
            <span>⌖</span> Add Waypoint
          </button>
          {session && (
            <button
              onClick={async () => {
                originMarkerRef.current?.remove()
                originMarkerRef.current = null
                const altMSLm = useGPSStore.getState().position?.altMSL ?? 0
                await resetOrigin(tapMenu.lat, tapMenu.lon, altMSLm)
                setTapMenu(null)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '12px 16px',
                background: 'none', border: 'none',
                color: theme.colors.amber, cursor: 'pointer',
                fontFamily: theme.font.primary, fontSize: theme.size.body,
                minHeight: theme.tapTarget, textAlign: 'left',
              }}
            >
              <span>◎</span> Reset Origin Here
            </button>
          )}
        </div>
      )}

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
