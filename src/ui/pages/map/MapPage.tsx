import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { Map as LeafletMap, CircleMarker, Polyline } from 'leaflet'
import { useGPSStore } from '../../../state/gps-store'
import { useSessionStore } from '../../../state/session-store'
import { useWaypointStore } from '../../../state/waypoint-store'
import { getTrackPoints, getEvents } from '../../../data/db'
import { theme } from '../../theme'
import { MapControls } from './MapControls'
import { EVENT_COLORS, EVENT_LABELS } from '../../../data/logic/stamp-logic'
import type { Waypoint } from '../../../data/models'

const MAP_STORAGE_KEY = 'ultrapilot_mapState'

interface MapState {
  center: [number, number]
  zoom: number
}

function loadMapState(): MapState {
  try {
    const raw = localStorage.getItem(MAP_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { center: [38.9, -94.6], zoom: 11 }
}

function saveMapState(map: LeafletMap) {
  const c = map.getCenter()
  localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }))
}

function newWpId() {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function MapPage() {
  const mapRef = useRef<LeafletMap | null>(null)
  const posMarkerRef = useRef<CircleMarker | null>(null)
  const originMarkerRef = useRef<CircleMarker | null>(null)
  const waypointMarkersRef = useRef<Map<string, CircleMarker>>(new Map())
  const historyLayersRef = useRef<(CircleMarker | Polyline)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)

  const { position } = useGPSStore()
  const { session, historySessionId } = useSessionStore()
  const { waypoints, load: loadWaypoints, save: saveWaypoint } = useWaypointStore()

  // Long-press state
  const [longPressPos, setLongPressPos] = useState<{ lat: number; lon: number } | null>(null)
  const [wpName, setWpName] = useState('')

  // Initialize map
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

    // Long-press detection
    let pressTimer: ReturnType<typeof setTimeout> | null = null
    let pressLatLng: L.LatLng | null = null

    function startPress(e: L.LeafletMouseEvent) {
      cancelPress()
      pressLatLng = e.latlng
      pressTimer = setTimeout(() => {
        if (pressLatLng) {
          setLongPressPos({ lat: pressLatLng.lat, lon: pressLatLng.lng })
          setWpName('')
        }
        pressTimer = null
      }, 600)
    }

    function cancelPress() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
    }

    map.on('mousedown', startPress)
    map.on('dragstart mouseup contextmenu', cancelPress)

    mapRef.current = map

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(containerRef.current!)

    return () => {
      cancelPress()
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Load waypoints on mount
  useEffect(() => { loadWaypoints() }, [loadWaypoints])

  // Position marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return

    const latlng: [number, number] = [position.lat, position.lon]

    if (!posMarkerRef.current) {
      posMarkerRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: theme.colors.red,
        fillOpacity: 1,
      }).addTo(map)
    } else {
      posMarkerRef.current.setLatLng(latlng)
    }

    if (autoFollowRef.current) {
      map.setView(latlng, map.getZoom())
    }
  }, [position])

  // Origin marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !session) return

    const latlng: [number, number] = [session.originLat, session.originLon]

    if (!originMarkerRef.current) {
      originMarkerRef.current = L.circleMarker(latlng, {
        radius: 6,
        color: theme.colors.cream,
        weight: 2,
        fillOpacity: 0,
      }).addTo(map)
      originMarkerRef.current.bindTooltip('ORIGIN', { permanent: true, direction: 'top', className: 'origin-tooltip' })
    }
  }, [session])

  // Waypoint markers — sync with store
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const existing = waypointMarkersRef.current
    const currentIds = new Set(waypoints.map(w => w.id))

    // Remove markers for deleted waypoints
    for (const [id, marker] of existing) {
      if (!currentIds.has(id)) {
        marker.remove()
        existing.delete(id)
      }
    }

    // Add markers for new waypoints
    for (const wp of waypoints) {
      if (!existing.has(wp.id)) {
        const marker = L.circleMarker([wp.lat, wp.lon], {
          radius: 6,
          color: theme.colors.blue,
          weight: 2,
          fillColor: theme.colors.blue,
          fillOpacity: 0.3,
        }).addTo(map)
        marker.bindTooltip(wp.name, { permanent: false, direction: 'top' })
        existing.set(wp.id, marker)
      }
    }
  }, [waypoints])

  // History session overlay — track line + event markers
  useEffect(() => {
    const map = mapRef.current
    // Remove any existing history layers
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
      const layers: (CircleMarker | Polyline)[] = []

      // Track line — downsample to every 5th point for performance
      if (points.length > 1) {
        const coords: [number, number][] = points
          .filter((_, i) => i % 5 === 0 || i === points.length - 1)
          .map(p => [p.lat, p.lon])
        const line = L.polyline(coords, {
          color: theme.colors.red,
          weight: 2,
          opacity: 0.7,
          dashArray: '6 4',
        }).addTo(m)
        layers.push(line)

        // Fit map to track bounds
        m.fitBounds(line.getBounds(), { padding: [40, 40] })
      }

      // Event markers
      for (const ev of events) {
        const color = EVENT_COLORS[ev.type]
        const label = EVENT_LABELS[ev.type]
        const marker = L.circleMarker([ev.lat, ev.lon], {
          radius: 5,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.8,
        }).addTo(m)
        marker.bindTooltip(label, { direction: 'top' })
        layers.push(marker)
      }

      historyLayersRef.current = layers
    }

    loadHistory()
    return () => { cancelled = true }
  }, [historySessionId, session])

  function handleRecenter() {
    const map = mapRef.current
    const pos = useGPSStore.getState().position
    if (!map || !pos) return
    autoFollowRef.current = true
    map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 13))
  }

  async function handleSaveWaypoint() {
    if (!longPressPos || !wpName.trim()) return
    const w: Waypoint = {
      id: newWpId(),
      name: wpName.trim(),
      lat: longPressPos.lat,
      lon: longPressPos.lon,
      note: null,
      createdAt: new Date().toISOString(),
    }
    await saveWaypoint(w)
    setLongPressPos(null)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.colors.darkBorder}`,
    background: 'rgba(255,255,255,0.05)',
    color: theme.colors.cream,
    fontFamily: theme.font.primary,
    fontSize: theme.size.body,
    boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', isolation: 'isolate' }}
      />
      <MapControls onRecenter={handleRecenter} />

      {/* Long-press waypoint modal */}
      {longPressPos && (
        <div
          onClick={() => setLongPressPos(null)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.colors.darkCard,
              border: `1px solid ${theme.colors.darkBorder}`,
              borderRadius: '16px',
              padding: '24px',
              width: 'min(300px, calc(100vw - 48px))',
              fontFamily: theme.font.primary,
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream, marginBottom: '4px' }}>Add Waypoint</div>
            <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono, marginBottom: '16px' }}>
              {longPressPos.lat.toFixed(5)}, {longPressPos.lon.toFixed(5)}
            </div>
            <input
              style={inputStyle}
              value={wpName}
              onChange={e => setWpName(e.target.value)}
              placeholder="Waypoint name"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveWaypoint() }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button
                onClick={() => setLongPressPos(null)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: `1px solid ${theme.colors.darkBorder}`,
                  background: 'none', color: theme.colors.light, cursor: 'pointer',
                  fontFamily: theme.font.primary, fontSize: theme.size.body,
                  minHeight: theme.tapTarget,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWaypoint}
                disabled={!wpName.trim()}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: 'none',
                  background: wpName.trim() ? theme.colors.red : theme.colors.darkBorder,
                  color: '#fff', cursor: wpName.trim() ? 'pointer' : 'default',
                  fontFamily: theme.font.primary, fontSize: theme.size.body,
                  fontWeight: 700, minHeight: theme.tapTarget,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
