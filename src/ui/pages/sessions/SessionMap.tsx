import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../map/pmtiles-protocol'
import { useReplayStore } from '../../../state/replay-store'
import { frameAt, trailCoords } from '../../../data/logic/replay-logic'
import { windLineLengthNM } from '../../../data/logic/windreader-logic'
import { destinationPoint } from '../../../data/logic/gps-logic'
import { useWindreaderStore } from '../../../state/windreader-store'
import { useReplayWindBands } from '../../hooks/useReplayWindBands'
import { WindreaderTable, RELATION_COLORS } from '../windreader/WindreaderTable'
import { EVENT_COLORS, eventLabel } from '../../../data/logic/stamp-logic'
import { useFlightModeStore } from '../../../state/flight-mode-store'
import { theme } from '../../theme'
import { PROTOMAPS_STYLE_LIGHT } from '../map/map-style'
import type { Session, StampEvent } from '../../../data/models'

interface SessionMapProps {
  session: Session
  events: StampEvent[]
}

function makeOriginEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${theme.colors.red};border:2px solid ${theme.colors.cream};`
  el.title = 'Origin'
  return el
}

function makeAircraftEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:34px;height:44px;pointer-events:none;`
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -16 24 32" width="34" height="44">
    <polygon points="0,-14 8,10 0,5 -8,10" fill="${theme.colors.red}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`
  return el
}

function makeStampEl(color: string, label: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `display:flex;flex-direction:column;align-items:center;transform:translateY(-100%);pointer-events:none;`
  el.innerHTML = `
    <div style="background:${theme.colors.darkCard};color:${theme.colors.cream};font-family:${theme.font.primary};font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid ${color};white-space:nowrap;line-height:1.2;margin-bottom:2px;">${label}</div>
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="18" viewBox="0 0 14 18">
      <path d="M7 18 L1 8 A6 6 0 1 1 13 8 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="7" cy="7" r="2" fill="#fff"/>
    </svg>`
  return el
}

export function SessionMap({ session, events }: SessionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const mapLoadedRef = useRef(false)
  const aircraftRef = useRef<maplibregl.Marker | null>(null)
  const followRef = useRef(true)
  const track = useReplayStore(s => s.track)
  const replayActive = useReplayStore(s => s.active)
  const replayT = useReplayStore(s => s.t)
  const playing = useReplayStore(s => s.playing)
  const originAlt = useReplayStore(s => s.originAltMSL)
  const wind = useReplayWindBands()
  const windLineMinutes = useWindreaderStore(s => s.lineMinutes)
  const [windPanelOpen, setWindPanelOpen] = useState(true)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: PROTOMAPS_STYLE_LIGHT,
      center: [session.originLon, session.originLat],
      zoom: 13,
      attributionControl: false,
      pitchWithRotate: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      mapLoadedRef.current = true
      map.addSource('track-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'track-line', type: 'line', source: 'track-source',
        paint: { 'line-color': theme.colors.trackGreen, 'line-width': 3, 'line-opacity': 0.9 } })
      // Replay: portion flown so far, drawn bright over the dimmed full track
      map.addSource('replay-trail', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'replay-trail-casing', type: 'line', source: 'replay-trail',
        paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.35 } })
      map.addLayer({ id: 'replay-trail-line', type: 'line', source: 'replay-trail',
        paint: { 'line-color': theme.colors.trackGreen, 'line-width': 4 } })
      // LTA replay: windreader wind lines from the replay aircraft
      map.addSource('replay-wind', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'replay-wind-casing', type: 'line', source: 'replay-wind',
        filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#000', 'line-width': ['case', ['get', 'current'], 6, 4.5], 'line-opacity': 0.5 } })
      map.addLayer({ id: 'replay-wind-lines', type: 'line', source: 'replay-wind',
        filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'current'], 3.5, 2.5] } })
      map.addLayer({ id: 'replay-wind-labels', type: 'symbol', source: 'replay-wind',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11,
          'text-anchor': 'left', 'text-offset': [0.5, 0], 'text-allow-overlap': true },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
    })
    // Panning by hand stops the replay camera from following
    map.on('dragstart', () => { followRef.current = false })

    mapRef.current = map

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      aircraftRef.current?.remove()
      aircraftRef.current = null
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      mapLoadedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [session.id])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let cancelled = false

    async function load() {
      const points = track?.points ?? []
      if (cancelled || !mapRef.current) return
      const m = mapRef.current

      // Clear prior markers
      for (const mk of markersRef.current) mk.remove()
      markersRef.current = []

      // Origin marker
      const originMarker = new maplibregl.Marker({ element: makeOriginEl(), anchor: 'center' })
        .setLngLat([session.originLon, session.originLat])
        .addTo(m)
      markersRef.current.push(originMarker)

      // Build list of coordinates to fit bounds to
      const originLL: [number, number] = [session.originLon, session.originLat]
      const bounds = new maplibregl.LngLatBounds(originLL, originLL)

      // Track polyline → GeoJSON source
      const setTrack = () => {
        if (points.length > 1) {
          const coords: [number, number][] = points
            .filter((_, i) => i % 3 === 0 || i === points.length - 1)
            .map(p => [p.lon, p.lat])
          ;(m.getSource('track-source') as maplibregl.GeoJSONSource | undefined)?.setData({
            type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords },
          })
          for (const c of coords) bounds.extend(c)
        }
      }
      if (mapLoadedRef.current) setTrack()
      else m.once('load', setTrack)

      // Stamp markers
      for (const ev of events) {
        const color = EVENT_COLORS[ev.type]
        const label = eventLabel(ev.type, useFlightModeStore.getState().mode)
        const marker = new maplibregl.Marker({ element: makeStampEl(color, label), anchor: 'bottom' })
          .setLngLat([ev.lon, ev.lat])
          .addTo(m)
        markersRef.current.push(marker)
        bounds.extend([ev.lon, ev.lat])
      }

      m.fitBounds(bounds, { padding: 30, maxZoom: 15, duration: 0 })
    }

    load()
    return () => { cancelled = true }
  }, [session.id, events, track])

  // ── Replay: dim the full track, draw the trail, move the aircraft ──────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    const trailSrc = map.getSource('replay-trail') as maplibregl.GeoJSONSource | undefined
    if (!track || !replayActive) {
      map.setPaintProperty('track-line', 'line-opacity', 0.9)
      trailSrc?.setData({ type: 'FeatureCollection', features: [] })
      aircraftRef.current?.remove()
      aircraftRef.current = null
      followRef.current = true
      return
    }
    map.setPaintProperty('track-line', 'line-opacity', 0.3)
    const f = frameAt(track, replayT, originAlt)
    trailSrc?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trailCoords(track, f) } })

    if (!aircraftRef.current) {
      aircraftRef.current = new maplibregl.Marker({ element: makeAircraftEl(), anchor: 'center', rotationAlignment: 'map' })
        .setLngLat([f.lon, f.lat])
        .addTo(map)
    }
    aircraftRef.current.setLngLat([f.lon, f.lat]).setRotation(f.trackDeg)

    // Follow: re-center when the aircraft nears the edge (not every frame —
    // constant panning makes the map unreadable)
    if (playing && followRef.current) {
      const p = map.project([f.lon, f.lat])
      const c = map.getContainer()
      const mx = c.clientWidth * 0.15, my = c.clientHeight * 0.15
      if (p.x < mx || p.y < my || p.x > c.clientWidth - mx || p.y > c.clientHeight - my) {
        map.easeTo({ center: [f.lon, f.lat], duration: 400 })
      }
    }
  }, [track, replayActive, replayT, playing, originAlt])

  // ── LTA replay: wind lines from the aircraft, one per altitude band ─────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    const src = map.getSource('replay-wind') as maplibregl.GeoJSONSource | undefined
    if (!wind || !track || !replayActive) {
      src?.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const f = frameAt(track, replayT, originAlt)
    const features: GeoJSON.Feature[] = []
    for (const b of wind.bands) {
      if (b.speedKts === 0) continue
      const end = destinationPoint(f.lat, f.lon, b.trackDeg, windLineLengthNM(b.speedKts, windLineMinutes))
      const props = { color: RELATION_COLORS[b.relation], current: b.relation === 'current' }
      features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: [[f.lon, f.lat], [end[1], end[0]]] } })
      features.push({ type: 'Feature', properties: { ...props, label: b.altMSLft.toLocaleString() }, geometry: { type: 'Point', coordinates: [end[1], end[0]] } })
    }
    src?.setData({ type: 'FeatureCollection', features })
  }, [wind, track, replayActive, replayT, originAlt, windLineMinutes])

  // Pressing play again re-enables follow
  useEffect(() => { if (playing) followRef.current = true }, [playing])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: theme.colors.darkCard }} />
      {wind && wind.bands.length > 0 && (
        windPanelOpen ? (
          <div style={{
            position: 'absolute', top: '8px', left: '8px', zIndex: 5, width: '200px',
            maxHeight: 'calc(100% - 16px)', overflowY: 'auto',
            background: 'rgba(14, 14, 20, 0.88)', border: `1px solid ${theme.colors.darkBorder}`,
            borderRadius: '10px', backdropFilter: 'blur(6px)',
          }}>
            <button
              onClick={() => setWindPanelOpen(false)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer',
                color: theme.colors.light, fontFamily: theme.font.primary, fontSize: theme.size.tiny,
                letterSpacing: '0.08em', minHeight: theme.tapTarget,
              }}
            >
              <span>{replayActive ? 'WINDREADER' : 'FLIGHT WINDS'}</span><span style={{ color: theme.colors.dim }}>✕</span>
            </button>
            {/* Replaying: the 5 bands around the replay altitude. Otherwise the whole profile. */}
            <WindreaderTable bands={wind.bands} compact maxRows={replayActive ? 5 : undefined} nowTs={wind.nowTs} />
          </div>
        ) : (
          <button
            onClick={() => setWindPanelOpen(true)}
            aria-label="Show Windreader"
            style={{
              position: 'absolute', top: '8px', left: '8px', zIndex: 5,
              width: theme.tapTarget, height: theme.tapTarget, borderRadius: '50%',
              border: `1px solid ${theme.colors.darkBorder}`, background: 'rgba(14, 14, 20, 0.88)',
              color: theme.colors.cream, fontSize: '18px', cursor: 'pointer',
            }}
          >
            ≋
          </button>
        )
      )}
    </div>
  )
}
