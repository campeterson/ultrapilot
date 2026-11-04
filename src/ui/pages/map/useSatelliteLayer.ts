// Satellite imagery as a raster layer above the street basemap and beneath
// the app's own layers (zones, tracks, markers). Adding a layer rather than
// swapping the style keeps every app source/layer intact.
import { useEffect, type MutableRefObject } from 'react'
import maplibregl from 'maplibre-gl'
import { useBasemapStore } from '../../../state/basemap-store'
import { satelliteSource, type MapView, type SatelliteSource } from '../../../data/logic/basemap-logic'

const SRC = 'satellite'
const LAYER = 'satellite-layer'
const applied = new WeakMap<maplibregl.Map, string>()

function apply(map: maplibregl.Map, src: SatelliteSource | null, beforeIds: string[]) {
  const sig = src ? JSON.stringify(src) : ''
  if (applied.get(map) === sig && (!src || map.getLayer(LAYER))) return
  if (map.getLayer(LAYER)) map.removeLayer(LAYER)
  if (map.getSource(SRC)) map.removeSource(SRC)
  applied.set(map, sig)
  if (!src) return
  map.addSource(SRC, { type: 'raster', tileSize: src.tileSize, attribution: src.attribution,
    ...(src.url ? { url: src.url } : { tiles: src.tiles }), ...(src.maxzoom ? { maxzoom: src.maxzoom } : {}) })
  const before = beforeIds.find(id => map.getLayer(id))
  map.addLayer({ id: LAYER, type: 'raster', source: SRC, paint: { 'raster-fade-duration': 150 } }, before)
}

/**
 * @param ready      true once the map's own layers exist (its 'load' ran)
 * @param beforeIds  app layers to sit beneath, first one present wins
 */
export function useSatelliteLayer(
  mapRef: MutableRefObject<maplibregl.Map | null>,
  view: MapView,
  ready: (map: maplibregl.Map) => boolean,
  beforeIds: string[],
) {
  const on = useBasemapStore(s => s.satellite[view])
  const provider = useBasemapStore(s => s.provider)
  const key = useBasemapStore(s => (s.provider === 'esri' ? s.keys.esri : s.provider === 'maptiler' ? s.keys.maptiler : ''))

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = on ? satelliteSource(provider, key) : null
    const run = () => apply(map, src, beforeIds)
    if (ready(map)) run()
    else map.once('load', run)
    return () => { map.off('load', run) }
    // beforeIds / ready are fixed per map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, on, provider, key])
}
