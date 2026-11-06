// Live Group members on the flying map: a dot per member coloured by role,
// labelled "CALLSIGN · age" / "altitude · speed track", fading with age; an
// optional direction line ahead of each moving member; and the forecast drift
// of the member being chased.
import { useEffect, type MutableRefObject } from 'react'
import type maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useLiveDriftStore } from '../../../state/live-drift-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { useGPSStore } from '../../../state/gps-store'
import { useTick } from '../../hooks/useTick'
import { useUnits } from '../../hooks/useUnits'
import { ageText, directionLineEnd, displayAltitude, displayCallsigns, groundReference, memberView } from '../../../data/logic/live-logic'
import { memberDrift } from '../../../data/logic/live-drift-logic'
import { formatAltitude, formatSpeed, ALTITUDE_LABELS, SPEED_LABELS } from '../../../data/logic/units-logic'
import { formatDeg, metersToFeet } from '../../../data/logic/gps-logic'

const SRC = 'live-members'
const OPACITY = { live: 1, fading: 0.6, stale: 0.35 } as const

function ensureLayers(map: maplibregl.Map) {
  if (map.getSource(SRC)) return
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  const lines: maplibregl.FilterSpecification = ['==', ['geometry-type'], 'LineString']
  map.addLayer({ id: 'live-direction', type: 'line', source: SRC, filter: ['all', lines, ['==', ['get', 'kind'], 'dir']],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': ['get', 'opacity'], 'line-dasharray': [1, 0] } })
  map.addLayer({ id: 'live-drift', type: 'line', source: SRC, filter: ['all', lines, ['==', ['get', 'kind'], 'drift']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.5] } })
  map.addLayer({ id: 'live-drift-ticks', type: 'circle', source: SRC, filter: ['==', ['get', 'kind'], 'tick'],
    paint: { 'circle-radius': 3.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } })
  map.addLayer({ id: 'live-drift-end', type: 'symbol', source: SRC, filter: ['==', ['get', 'kind'], 'driftEnd'],
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11, 'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-allow-overlap': true },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
  map.addLayer({ id: 'live-members-dot', type: 'circle', source: SRC, filter: ['==', ['get', 'kind'], 'member'],
    paint: { 'circle-radius': 9, 'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['get', 'opacity'] } })
  map.addLayer({ id: 'live-members-label', type: 'symbol', source: SRC, filter: ['==', ['get', 'kind'], 'member'],
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11, 'text-anchor': 'left',
      'text-offset': [1.1, 0], 'text-allow-overlap': true, 'text-justify': 'left' },
    paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1.5, 'text-opacity': ['get', 'opacity'] } })
}

export function useLiveLayers(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const { members, offset, display, profile } = useLiveGroupStore()
  const drift = useLiveDriftStore()
  const lineMinutes = useMapSettingsStore(s => s.directionLineMinutes)
  const myAltM = useGPSStore(s => s.position?.altMSL ?? null)
  const units = useUnits()
  const now = useTick(1000) + offset

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ensureLayers(map)
      const names = displayCallsigns(members)
      const ref = groundReference(members, profile ? { role: profile.role, altFt: myAltM == null ? null : metersToFeet(myAltM) } : null)
      const features: GeoJSON.Feature[] = []
      for (const m of members) {
        if (!m.fix) continue
        const v = memberView(m.fix, null, now)
        const color = v.freshness === 'stale' ? theme.colors.dim : theme.colors.liveRoles[m.role]
        const opacity = OPACITY[v.freshness]

        // The chased member's forecast drift (also for my own balloon)
        if (drift.memberId === m.pubId && drift.forecast) {
          const t = memberDrift(drift.forecast, m.fix, drift.minutes)
          if (t && t.coords.length > 1) {
            features.push({ type: 'Feature', properties: { kind: 'drift', color }, geometry: { type: 'LineString', coordinates: t.coords } })
            for (const k of t.ticks) features.push({ type: 'Feature', properties: { kind: 'tick', color }, geometry: { type: 'Point', coordinates: [k.lon, k.lat] } })
            features.push({ type: 'Feature', properties: { kind: 'driftEnd', color, label: `${names.get(m.pubId)} +${t.minutes} min` }, geometry: { type: 'Point', coordinates: t.coords[t.coords.length - 1] } })
          }
        }
        if (m.isMe) continue   // my own aircraft is drawn by the map already

        if (display.lines) {
          const end = directionLineEnd(m.fix, v, lineMinutes)
          if (end) features.push({ type: 'Feature', properties: { kind: 'dir', color, opacity }, geometry: { type: 'LineString', coordinates: [[m.fix.lon, m.fix.lat], [end[1], end[0]]] } })
        }

        const alt = displayAltitude(v.altFt, display.altMode, ref)
        const parts = [
          alt && `${Number(formatAltitude(alt.ft, units.altitude)).toLocaleString()} ${ALTITUDE_LABELS[units.altitude]} ${alt.datum}`,
          v.speedKt != null && `${formatSpeed(v.speedKt, units.speed)} ${SPEED_LABELS[units.speed]}${v.trackDeg != null ? ` ${formatDeg(v.trackDeg)}` : ''}`,
        ].filter(Boolean)
        features.push({
          type: 'Feature',
          properties: { kind: 'member', color, opacity, label: `${names.get(m.pubId)} · ${ageText(v.ageS)}${parts.length ? '\n' + parts.join(' · ') : ''}` },
          geometry: { type: 'Point', coordinates: [m.fix.lon, m.fix.lat] },
        })
      }
      ;(map.getSource(SRC) as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features })
    }
    if (map.getSource('track-source')) apply()
    else map.once('load', apply)
    return () => { map.off('load', apply) }
  }, [mapRef, members, now, units.altitude, units.speed, display, profile, myAltM, lineMinutes, drift.memberId, drift.forecast, drift.minutes])
}
