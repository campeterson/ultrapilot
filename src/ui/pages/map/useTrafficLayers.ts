// ADS-B traffic on the flying map: a white arrow along each target's track
// (a white dot when it reports none), labelled "CALLSIGN · age" / "+300 ft ↑",
// faded once more than 10 s old. Above group members' layers.
import { useEffect, type MutableRefObject } from 'react'
import type maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import { useTrafficStore } from '../../../state/traffic-store'
import { useGPSStore } from '../../../state/gps-store'
import { useTick } from '../../hooks/useTick'
import { ageText } from '../../../data/logic/live-logic'
import { relAltText, trafficView } from '../../../data/logic/traffic-logic'
import { metersToFeet } from '../../../data/logic/gps-logic'

const SRC = 'traffic'
const ARROW = 'traffic-arrow'

/** Pointing up (north). Narrower than a group member's arrow, white with a dark outline. */
function arrowImage(): ImageData {
  const n = 64, c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  g.beginPath()
  g.moveTo(32, 4); g.lineTo(50, 58); g.lineTo(32, 48); g.lineTo(14, 58)
  g.closePath()
  g.lineJoin = 'round'
  g.lineWidth = 6; g.strokeStyle = theme.colors.trafficOutline; g.stroke()
  g.fillStyle = theme.colors.traffic; g.fill()
  return g.getImageData(0, 0, n, n)
}

function ensureLayers(map: maplibregl.Map) {
  if (!map.hasImage(ARROW)) map.addImage(ARROW, arrowImage(), { pixelRatio: 2 })
  if (map.getSource(SRC)) return
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'traffic-arrow', type: 'symbol', source: SRC, filter: ['has', 'track'],
    layout: { 'icon-image': ARROW, 'icon-rotate': ['get', 'track'], 'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 0.9 },
    paint: { 'icon-opacity': ['get', 'opacity'] } })
  map.addLayer({ id: 'traffic-dot', type: 'circle', source: SRC, filter: ['!', ['has', 'track']],
    paint: { 'circle-radius': 7, 'circle-color': theme.colors.traffic, 'circle-opacity': ['get', 'opacity'],
      'circle-stroke-color': theme.colors.trafficOutline, 'circle-stroke-width': 2.5, 'circle-stroke-opacity': ['get', 'opacity'] } })
  map.addLayer({ id: 'traffic-label', type: 'symbol', source: SRC,
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11, 'text-anchor': 'left',
      'text-offset': [1.4, 0], 'text-allow-overlap': true, 'text-justify': 'left' },
    paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1.5, 'text-opacity': ['get', 'opacity'] } })
}

export function useTrafficLayers(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const { targets, receivedAt, active } = useTrafficStore()
  const myAltM = useGPSStore(s => s.position?.altMSL ?? null)
  const now = useTick(1000)

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ensureLayers(map)
      const since = (now - receivedAt) / 1000
      const myAltFt = myAltM == null ? null : metersToFeet(myAltM)
      const features: GeoJSON.Feature[] = active ? targets.map(t => {
        const v = trafficView(t, myAltFt, since)
        const alt = relAltText(v, t)
        return {
          type: 'Feature',
          properties: { ...(t.trk != null ? { track: t.trk } : {}), opacity: v.faded ? 0.45 : 1, label: `${v.name} · ${ageText(v.ageS)}${alt ? '\n' + alt : ''}` },
          geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
        }
      }) : []
      ;(map.getSource(SRC) as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features })
    }
    if (map.getSource('track-source')) apply()
    else map.once('load', apply)
    return () => { map.off('load', apply) }
  }, [mapRef, targets, receivedAt, active, myAltM, now])
}
