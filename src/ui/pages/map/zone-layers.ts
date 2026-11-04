// Imported zones drawn as tinted areas with an outline and name. Shared by the
// flying map and the plan map; added beneath each map's own app layers.
import maplibregl from 'maplibre-gl'
import { theme } from '../../theme'
import type { Zone, ZoneRating } from '../../../data/models'

const SRC = 'zones'

export const ZONE_COLORS: Record<ZoneRating, string> = {
  good: theme.colors.zoneGood,
  caution: theme.colors.zoneCaution,
  nogo: theme.colors.zoneNogo,
}

export function ensureZoneLayers(map: maplibregl.Map, beforeId?: string) {
  if (map.getSource(SRC)) return
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'zones-fill', type: 'fill', source: SRC,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'rating'], 'nogo'], 0.3, 0.22] } }, before)
  map.addLayer({ id: 'zones-outline', type: 'line', source: SRC,
    paint: { 'line-color': ['get', 'color'], 'line-width': 2,
      'line-dasharray': ['case', ['==', ['get', 'rating'], 'caution'], ['literal', [3, 2]], ['literal', [1, 0]]] } }, before)
  map.addLayer({ id: 'zones-labels', type: 'symbol', source: SRC, minzoom: 11,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Regular'], 'text-size': 11 },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1.4 } }, before)
}

export function setZoneData(map: maplibregl.Map, zones: Zone[]) {
  ;(map.getSource(SRC) as maplibregl.GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: zones.map(z => ({
      type: 'Feature',
      properties: { id: z.id, name: z.name, rating: z.rating, color: ZONE_COLORS[z.rating] },
      geometry: { type: 'MultiPolygon', coordinates: z.polygons },
    })),
  })
}
