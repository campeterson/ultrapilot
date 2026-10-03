import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../map/pmtiles-protocol'
import { useReplayStore } from '../../../state/replay-store'
import { useWindreaderStore } from '../../../state/windreader-store'
import { useReplayWindBands } from '../../hooks/useReplayWindBands'
import { addReplayLayers, renderReplay } from '../map/replay-layers'
import { ReplayWindPanel } from './ReplayWindPanel'
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

/** Session detail map. Used for replay on phones; tablets replay on the main map. */
export function SessionMap({ session, events }: SessionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const mapLoadedRef = useRef(false)
  const aircraftRef = useRef<maplibregl.Marker | null>(null)
  // Follow the replay aircraft until the user pans; the button resumes it
  const [follow, setFollow] = useState(true)
  const track = useReplayStore(s => s.track)
  const replayActive = useReplayStore(s => s.active)
  const replayT = useReplayStore(s => s.t)
  const originAlt = useReplayStore(s => s.originAltMSL)
  const wind = useReplayWindBands()
  const windLineMinutes = useWindreaderStore(s => s.lineMinutes)

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
      addReplayLayers(map, 'replay')
    })
    // Panning by hand stops following (pinch/scroll zoom keeps it). Only
    // user drags fire dragstart — our own jumpTo doesn't.
    map.on('dragstart', () => setFollow(false))

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

  // ── Static track, origin and stamps ────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    const points = track?.points ?? []

    for (const mk of markersRef.current) mk.remove()
    markersRef.current = []

    const originMarker = new maplibregl.Marker({ element: makeOriginEl(), anchor: 'center' })
      .setLngLat([session.originLon, session.originLat])
      .addTo(m)
    markersRef.current.push(originMarker)

    const originLL: [number, number] = [session.originLon, session.originLat]
    const bounds = new maplibregl.LngLatBounds(originLL, originLL)

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

    for (const ev of events) {
      const label = eventLabel(ev.type, useFlightModeStore.getState().mode)
      const marker = new maplibregl.Marker({ element: makeStampEl(EVENT_COLORS[ev.type], label), anchor: 'bottom' })
        .setLngLat([ev.lon, ev.lat])
        .addTo(m)
      markersRef.current.push(marker)
      bounds.extend([ev.lon, ev.lat])
    }

    m.fitBounds(bounds, { padding: 30, maxZoom: 15, duration: 0 })
  }, [session.id, events, track])

  // ── Replay frame ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return
    renderReplay(map, 'replay', aircraftRef, {
      track, active: replayActive, t: replayT, originAltMSL: originAlt,
      windBands: wind?.bands ?? null, windMinutes: windLineMinutes,
      baseLayerId: 'track-line', baseOpacity: 0.9, follow,
    })
  }, [track, replayActive, replayT, originAlt, wind, windLineMinutes, follow])

  // Each new replay starts out following
  useEffect(() => { if (!replayActive) setFollow(true) }, [replayActive])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: theme.colors.darkCard }} />
      <ReplayWindPanel />
      {replayActive && !follow && (
        <button
          onClick={() => setFollow(true)}
          title="Follow aircraft"
          aria-label="Follow aircraft"
          style={{
            position: 'absolute', right: '10px', bottom: '36px', zIndex: 5,
            width: theme.tapTarget, height: theme.tapTarget, borderRadius: '50%',
            border: `1px solid ${theme.colors.darkBorder}`, background: 'rgba(14, 14, 20, 0.88)',
            color: theme.colors.cream, fontSize: '18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: theme.font.primary,
          }}
        >
          ▲
        </button>
      )}
    </div>
  )
}
