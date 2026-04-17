import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Map as LeafletMap, Polyline } from 'leaflet'
import { getTrackPoints } from '../../../data/db'
import { EVENT_COLORS, EVENT_LABELS } from '../../../data/logic/stamp-logic'
import { theme } from '../../theme'
import type { Session, StampEvent } from '../../../data/models'

interface SessionMapProps {
  session: Session
  events: StampEvent[]
}

function makeStampIcon(color: string, label: string): L.DivIcon {
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-100%);">
      <div style="background:${theme.colors.darkCard};color:${theme.colors.cream};font-family:${theme.font.primary};font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid ${color};white-space:nowrap;line-height:1.2;margin-bottom:2px;">${label}</div>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="18" viewBox="0 0 14 18">
        <path d="M7 18 L1 8 A6 6 0 1 1 13 8 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="7" cy="7" r="2" fill="#fff"/>
      </svg>
    </div>`
  return L.divIcon({
    html,
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

export function SessionMap({ session, events }: SessionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layersRef = useRef<(L.Marker | L.CircleMarker | Polyline)[]>([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: [session.originLat, session.originLon],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
    mapRef.current = map

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [session.id])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const layer of layersRef.current) layer.remove()
    layersRef.current = []

    let cancelled = false

    async function load() {
      const points = await getTrackPoints(session.id)
      if (cancelled || !mapRef.current) return
      const m = mapRef.current
      const layers: (L.Marker | L.CircleMarker | Polyline)[] = []

      // Origin marker
      const origin = L.circleMarker([session.originLat, session.originLon], {
        radius: 6, color: theme.colors.cream, weight: 2, fillColor: theme.colors.red, fillOpacity: 1,
      }).addTo(m)
      origin.bindTooltip('Origin', { direction: 'top' })
      layers.push(origin)

      // Track polyline
      let bounds: L.LatLngBounds | null = null
      if (points.length > 1) {
        const coords: [number, number][] = points
          .filter((_, i) => i % 3 === 0 || i === points.length - 1)
          .map(p => [p.lat, p.lon])
        const line = L.polyline(coords, {
          color: theme.colors.red, weight: 3, opacity: 0.85,
        }).addTo(m)
        layers.push(line)
        bounds = line.getBounds()
      }

      // Stamp markers with flag + label
      for (const ev of events) {
        const color = EVENT_COLORS[ev.type]
        const label = EVENT_LABELS[ev.type]
        const marker = L.marker([ev.lat, ev.lon], {
          icon: makeStampIcon(color, label),
          keyboard: false,
        }).addTo(m)
        layers.push(marker)
        const ll = L.latLng(ev.lat, ev.lon)
        bounds = bounds ? bounds.extend(ll) : L.latLngBounds(ll, ll)
      }

      if (bounds && bounds.isValid()) {
        m.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
      }

      layersRef.current = layers
    }

    load()
    return () => { cancelled = true }
  }, [session.id, events])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        background: theme.colors.darkCard,
      }}
    />
  )
}
