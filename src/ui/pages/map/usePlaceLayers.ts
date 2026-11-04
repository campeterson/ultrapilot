import { useEffect, type MutableRefObject } from 'react'
import type maplibregl from 'maplibre-gl'
import { usePlacesStore } from '../../../state/places-store'
import { ensurePlaceLayers, setPlaceData } from './place-layers'

/** Places on the flying map (beneath tracks, routes and markers), if enabled. */
export function usePlaceLayers(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const { places, showOnFlightMap, load } = usePlacesStore()
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ensurePlaceLayers(map, 'history-track')
      setPlaceData(map, showOnFlightMap ? places : [])
    }
    if (map.getSource('track-source')) apply()
    else map.once('load', apply)
    return () => { map.off('load', apply) }
  }, [mapRef, places, showOnFlightMap])
}
