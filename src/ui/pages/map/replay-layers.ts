// Replay rendering shared by the main map (tablet) and the session detail map
// (phone): flown-so-far trail, moving aircraft, and LTA windreader wind lines.
import maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import { frameAt, trailCoords, type ReplayTrack } from '../../../data/logic/replay-logic'
import { windLineLengthNM } from '../../../data/logic/windreader-logic'
import { destinationPoint } from '../../../data/logic/gps-logic'
import { RELATION_COLORS } from '../windreader/WindreaderTable'
import type { WindBand } from '../../../data/models'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function makeAircraftEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:34px;height:44px;pointer-events:none;`
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -16 24 32" width="34" height="44">
    <polygon points="0,-14 8,10 0,5 -8,10" fill="${theme.colors.red}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`
  return el
}

/** Add replay sources + layers. Call inside map 'load', after the base track layer. */
export function addReplayLayers(map: maplibregl.Map, prefix: string) {
  map.addSource(`${prefix}-trail`, { type: 'geojson', data: EMPTY })
  map.addLayer({ id: `${prefix}-trail-casing`, type: 'line', source: `${prefix}-trail`,
    paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.35 } })
  map.addLayer({ id: `${prefix}-trail-line`, type: 'line', source: `${prefix}-trail`,
    paint: { 'line-color': theme.colors.trackGreen, 'line-width': 4 } })

  map.addSource(`${prefix}-wind`, { type: 'geojson', data: EMPTY })
  map.addLayer({ id: `${prefix}-wind-casing`, type: 'line', source: `${prefix}-wind`,
    filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#000', 'line-width': ['case', ['get', 'current'], 6, 4.5], 'line-opacity': 0.5 } })
  map.addLayer({ id: `${prefix}-wind-lines`, type: 'line', source: `${prefix}-wind`,
    filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'current'], 3.5, 2.5] } })
  map.addLayer({ id: `${prefix}-wind-labels`, type: 'symbol', source: `${prefix}-wind`,
    filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Regular'], 'text-size': 11,
      'text-anchor': 'left', 'text-offset': [0.5, 0], 'text-allow-overlap': true },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
}

/** One line per altitude band from (lat, lon), length = distance in `minutes`. */
export function windLineFeatures(bands: WindBand[], lat: number, lon: number, minutes: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const b of bands) {
    if (b.speedKts === 0) continue
    const end = destinationPoint(lat, lon, b.trackDeg, windLineLengthNM(b.speedKts, minutes))
    const props = { color: RELATION_COLORS[b.relation], current: b.relation === 'current' }
    features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: [[lon, lat], [end[1], end[0]]] } })
    features.push({ type: 'Feature', properties: { ...props, label: b.altMSLft.toLocaleString() }, geometry: { type: 'Point', coordinates: [end[1], end[0]] } })
  }
  return { type: 'FeatureCollection', features }
}

export interface ReplayRenderState {
  track: ReplayTrack | null
  active: boolean
  t: number
  originAltMSL: number
  playing: boolean
  windBands: WindBand[] | null
  windMinutes: number
  /** Base track layer to dim while replaying, and its normal opacity */
  baseLayerId: string
  baseOpacity: number
  /** Re-center when the aircraft nears the edge */
  follow: boolean
}

/** Draw (or clear) the replay for the current frame. */
export function renderReplay(
  map: maplibregl.Map,
  prefix: string,
  aircraftRef: { current: maplibregl.Marker | null },
  s: ReplayRenderState,
) {
  const trailSrc = map.getSource(`${prefix}-trail`) as maplibregl.GeoJSONSource | undefined
  const windSrc = map.getSource(`${prefix}-wind`) as maplibregl.GeoJSONSource | undefined
  const hasBase = !!map.getLayer(s.baseLayerId)

  if (!s.track || !s.active) {
    if (hasBase) map.setPaintProperty(s.baseLayerId, 'line-opacity', s.baseOpacity)
    trailSrc?.setData(EMPTY)
    windSrc?.setData(EMPTY)
    aircraftRef.current?.remove()
    aircraftRef.current = null
    return
  }

  if (hasBase) map.setPaintProperty(s.baseLayerId, 'line-opacity', 0.3)
  const f = frameAt(s.track, s.t, s.originAltMSL)
  trailSrc?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trailCoords(s.track, f) } })
  windSrc?.setData(s.windBands ? windLineFeatures(s.windBands, f.lat, f.lon, s.windMinutes) : EMPTY)

  if (!aircraftRef.current) {
    aircraftRef.current = new maplibregl.Marker({ element: makeAircraftEl(), anchor: 'center', rotationAlignment: 'map' })
      .setLngLat([f.lon, f.lat])
      .addTo(map)
  }
  aircraftRef.current.setLngLat([f.lon, f.lat]).setRotation(f.trackDeg)

  // Re-center only near the edge — constant panning makes the map unreadable
  if (s.playing && s.follow) {
    const p = map.project([f.lon, f.lat])
    const c = map.getContainer()
    const mx = c.clientWidth * 0.15, my = c.clientHeight * 0.15
    if (p.x < mx || p.y < my || p.x > c.clientWidth - mx || p.y > c.clientHeight - my) {
      map.easeTo({ center: [f.lon, f.lat], duration: 400 })
    }
  }
}
