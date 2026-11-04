import { useEffect, type MutableRefObject } from 'react'
import type maplibregl from 'maplibre-gl'
import { useZoneStore } from '../../../state/zone-store'
import { ensureZoneLayers, setZoneData } from './zone-layers'

/** Zones on the flying map (beneath tracks, routes and markers), if enabled. */
export function useZoneLayers(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const { zones, showOnFlightMap, load } = useZoneStore()
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ensureZoneLayers(map, 'history-track')
      setZoneData(map, showOnFlightMap ? zones : [])
    }
    if (map.getSource('track-source')) apply()
    else map.once('load', apply)
    return () => { map.off('load', apply) }
  }, [mapRef, zones, showOnFlightMap])
}
