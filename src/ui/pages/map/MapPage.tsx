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

// ─── Tap context menu ─────────────────────────────────────────────────────────

interface TapMenu {
  lat: number
  lon: number
  // Pixel coords relative to map container for positioning the menu
  x: number
  y: number
}

export function MapPage() {
  const mapRef = useRef<LeafletMap | null>(null)
  const posMarkerRef = useRef<CircleMarker | null>(null)
  const originMarkerRef = useRef<CircleMarker | null>(null)
  const liveTrackRef = useRef<Polyline | null>(null)
  const waypointMarkersRef = useRef<Map<string, CircleMarker>>(new Map())
  const historyLayersRef = useRef<(CircleMarker | Polyline)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)

  const { position } = useGPSStore()
  const { session, historySessionId, trackBuffer } = useSessionStore()
  const { waypoints, load: loadWaypoints, save: saveWaypoint } = useWaypointStore()

  // Tap menu state
  const [tapMenu, setTapMenu] = useState<TapMenu | null>(null)
  // Waypoint name form (shown after tapping "Add Waypoint" in menu)
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

    // Tap = click on map — show context menu. Distinguish from drag by checking movement.
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

  // ── Position marker ─────────────────────────────────────────────────────────
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

  // ── Origin marker ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!session) {
      // Clear origin marker when session ends
      originMarkerRef.current?.remove()
      originMarkerRef.current = null
      return
    }

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

  // ── Live track polyline ─────────────────────────────────────────────────────
  // Rebuilds from trackBuffer whenever a new point is buffered.
  // On session start (new session object), also loads any persisted points from DB
  // so the track is complete even after a flush.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!session) {
      liveTrackRef.current?.remove()
      liveTrackRef.current = null
      return
    }

    // Combine DB-persisted points with in-memory buffer for a complete track
    async function rebuildTrack() {
      const persisted = await getTrackPoints(session!.id)
      const bufPts = useSessionStore.getState().trackBuffer

      const all = [
        ...persisted.map(p => [p.lat, p.lon] as [number, number]),
        ...bufPts.map(p => [p.lat, p.lon] as [number, number]),
      ]

      if (all.length < 2 || !mapRef.current) return

      if (!liveTrackRef.current) {
        liveTrackRef.current = L.polyline(all, {
          color: theme.colors.red,
          weight: 2,
          opacity: 0.8,
          dashArray: '6 4',
        }).addTo(mapRef.current)
      } else {
        liveTrackRef.current.setLatLngs(all)
      }
    }

    rebuildTrack()
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
      const layers: (CircleMarker | Polyline)[] = []

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
        m.fitBounds(line.getBounds(), { padding: [40, 40] })
      }

      for (const ev of events) {
        const color = EVENT_COLORS[ev.type]
        const label = EVENT_LABELS[ev.type]
        const marker = L.circleMarker([ev.lat, ev.lon], {
          radius: 5, color, weight: 2, fillColor: color, fillOpacity: 0.8,
        }).addTo(m)
        marker.bindTooltip(label, { direction: 'top' })
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
        // Dismiss tap menu on click-outside (the map itself)
        onClick={() => setTapMenu(null)}
      />
      <MapControls onRecenter={handleRecenter} />

      {/* ── Tap context menu ── */}
      {tapMenu && !wpForm && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            // Position near the tap point, clamped so it doesn't go offscreen
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
              color: theme.colors.cream, cursor: 'pointer',
              fontFamily: theme.font.primary, fontSize: theme.size.body,
              minHeight: theme.tapTarget, textAlign: 'left',
            }}
          >
            <span>⌖</span> Add Waypoint
          </button>
        </div>
      )}

      {/* ── Waypoint name modal ── */}
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
              borderRadius: '16px',
              padding: '24px',
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
              >
                Cancel
              </button>
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
