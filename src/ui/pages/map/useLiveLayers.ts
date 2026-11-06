// Live Group members on the flying map: a dot per member coloured by role,
// labelled with callsign, altitude and age, fading as the position ages.
import { useEffect, type MutableRefObject } from 'react'
import type maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useTick } from '../../hooks/useTick'
import { useUnits } from '../../hooks/useUnits'
import { ageText, displayCallsigns, memberView } from '../../../data/logic/live-logic'
import { formatAltitude, ALTITUDE_LABELS } from '../../../data/logic/units-logic'

const SRC = 'live-members'
const OPACITY = { live: 1, fading: 0.6, stale: 0.35 } as const

function ensureLayers(map: maplibregl.Map) {
  if (map.getSource(SRC)) return
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'live-members-dot', type: 'circle', source: SRC,
    paint: { 'circle-radius': 9, 'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['get', 'opacity'] } })
  map.addLayer({ id: 'live-members-label', type: 'symbol', source: SRC,
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11, 'text-anchor': 'left',
      'text-offset': [1.1, 0], 'text-allow-overlap': true, 'text-justify': 'left' },
    paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1.5, 'text-opacity': ['get', 'opacity'] } })
}

export function useLiveLayers(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const { members, offset } = useLiveGroupStore()
  const units = useUnits()
  const now = useTick(1000) + offset

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ensureLayers(map)
      const names = displayCallsigns(members)
      const features: GeoJSON.Feature[] = []
      for (const m of members) {
        if (m.isMe || !m.fix) continue
        const v = memberView(m.fix, null, now)
        const alt = v.altFt != null ? `${Number(formatAltitude(v.altFt, units.altitude)).toLocaleString()} ${ALTITUDE_LABELS[units.altitude]} · ` : ''
        features.push({
          type: 'Feature',
          properties: {
            color: v.freshness === 'stale' ? theme.colors.dim : theme.colors.liveRoles[m.role],
            opacity: OPACITY[v.freshness],
            label: `${names.get(m.pubId)}\n${alt}${ageText(v.ageS)}`,
          },
          geometry: { type: 'Point', coordinates: [m.fix.lon, m.fix.lat] },
        })
      }
      ;(map.getSource(SRC) as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features })
    }
    if (map.getSource('track-source')) apply()
    else map.once('load', apply)
    return () => { map.off('load', apply) }
  }, [mapRef, members, now, units.altitude])
}
