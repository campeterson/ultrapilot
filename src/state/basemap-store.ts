import { create } from 'zustand'
import type { MapView, SatelliteProvider } from '../data/logic/basemap-logic'

const STORAGE_KEY = 'ultrapilot_basemap'

interface Persisted {
  /** Satellite on, per map. */
  satellite: Record<MapView, boolean>
  provider: SatelliteProvider
  keys: { esri: string; maptiler: string }
}

const DEFAULTS: Persisted = {
  satellite: { flight: false, plan: false, zones: false },
  provider: 'usgs',
  keys: { esri: '', maptiler: '' },
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { ...DEFAULTS, ...p, satellite: { ...DEFAULTS.satellite, ...p.satellite }, keys: { ...DEFAULTS.keys, ...p.keys } }
    }
  } catch {}
  return { ...DEFAULTS, satellite: { ...DEFAULTS.satellite }, keys: { ...DEFAULTS.keys } }
}

interface BasemapStore extends Persisted {
  toggleSatellite: (view: MapView) => void
  setProvider: (p: SatelliteProvider) => void
  setKey: (p: 'esri' | 'maptiler', key: string) => void
}

export const useBasemapStore = create<BasemapStore>((set, get) => {
  const save = () => {
    const { satellite, provider, keys } = get()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ satellite, provider, keys })) } catch {}
  }
  return {
    ...load(),
    toggleSatellite: (view) => { set({ satellite: { ...get().satellite, [view]: !get().satellite[view] } }); save() },
    setProvider: (provider) => { set({ provider }); save() },
    setKey: (p, key) => { set({ keys: { ...get().keys, [p]: key } }); save() },
  }
})
