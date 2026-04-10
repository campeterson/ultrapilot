import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Map as LeafletMap, CircleMarker } from 'leaflet'
import { useGPSStore } from '../../../state/gps-store'
import { useSessionStore } from '../../../state/session-store'
import { theme } from '../../theme'
import { MapControls } from './MapControls'

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

export function MapPage() {
  const mapRef = useRef<LeafletMap | null>(null)
  const posMarkerRef = useRef<CircleMarker | null>(null)
  const originMarkerRef = useRef<CircleMarker | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)

  const { position } = useGPSStore()
  const { session } = useSessionStore()

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

    // Small attribution in corner
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)

    // Save position on move
    map.on('moveend', () => saveMapState(map))
    map.on('dragstart', () => { autoFollowRef.current = false })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

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

  // Track line — rebuild from session track points
  // (track points come from DB; for live use we use GPS positions buffered in store)
  useEffect(() => {
    // Track rendering handled by separate TrackLayer logic
    // For now, the position marker shows current location
  }, [])

  function handleRecenter() {
    const map = mapRef.current
    const pos = useGPSStore.getState().position
    if (!map || !pos) return
    autoFollowRef.current = true
    map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 13))
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', isolation: 'isolate' }}
      />
      <MapControls onRecenter={handleRecenter} />
    </div>
  )
}
