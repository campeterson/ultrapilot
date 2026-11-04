// Places drawn on a map: areas tinted by category (caution dashed), points as
// colored dots (launch sites marked "L"), names at closer zoom. Shared by the
// flying, plan and places maps; added beneath each map's own app layers.
import maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import type { Place, PlaceCategory, ZoneRating } from '../../../data/models'

const SRC = 'places'

export const CATEGORY_COLORS: Record<PlaceCategory, string> = {
  launch: theme.colors.launchSite,
  good: theme.colors.zoneGood,
  caution: theme.colors.zoneCaution,
  nogo: theme.colors.zoneNogo,
  poi: theme.colors.poi,
}
export const ZONE_COLORS: Record<ZoneRating, string> = CATEGORY_COLORS

const isPolygon: maplibregl.FilterSpecification = ['==', ['geometry-type'], 'Polygon']
const isPoint: maplibregl.FilterSpecification = ['==', ['geometry-type'], 'Point']

export function ensurePlaceLayers(map: maplibregl.Map, beforeId?: string) {
  if (map.getSource(SRC)) return
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'places-fill', type: 'fill', source: SRC, filter: isPolygon,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'category'], 'nogo'], 0.3, 0.22] } }, before)
  map.addLayer({ id: 'places-outline', type: 'line', source: SRC, filter: isPolygon,
    paint: { 'line-color': ['get', 'color'], 'line-width': 2,
      'line-dasharray': ['case', ['==', ['get', 'category'], 'caution'], ['literal', [3, 2]], ['literal', [1, 0]]] } }, before)
  map.addLayer({ id: 'places-area-labels', type: 'symbol', source: SRC, filter: isPolygon, minzoom: 11,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Regular'], 'text-size': 11 },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.4 } }, before)
  map.addLayer({ id: 'places-points', type: 'circle', source: SRC, filter: isPoint,
    paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } }, before)
  map.addLayer({ id: 'places-point-marks', type: 'symbol', source: SRC, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'category'], 'launch']],
    layout: { 'text-field': 'L', 'text-font': ['Open Sans Regular'], 'text-size': 10, 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' } }, before)
  map.addLayer({ id: 'places-point-labels', type: 'symbol', source: SRC, filter: isPoint, minzoom: 9,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Regular'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.9] },
    paint: { 'text-color': theme.colors.cream, 'text-halo-color': '#000', 'text-halo-width': 1.3 } }, before)
}

/** `hideLaunchPoints`: the plan map draws launch sites itself (numbered when chosen). */
export function setPlaceData(map: maplibregl.Map, places: Place[], opts: { hideLaunchPoints?: boolean } = {}) {
  const shown = opts.hideLaunchPoints ? places.filter(p => !(p.category === 'launch' && p.geometry.type === 'Point')) : places
  ;(map.getSource(SRC) as maplibregl.GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: shown.map(p => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, category: p.category, color: CATEGORY_COLORS[p.category] },
      geometry: p.geometry,
    })),
  })
}
