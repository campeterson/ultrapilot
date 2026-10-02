import { create } from 'zustand'
import type { FlightMode } from '../data/models'
import { useMapSettingsStore } from './map-settings-store'
import { useRouteStore } from './route-store'

const STORAGE_KEY = 'ultrapilot_flightMode'

function load(): FlightMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'lta' || raw === 'powered') return raw
  } catch {}
  return 'powered'
}

interface FlightModeStore {
  mode: FlightMode
  setMode: (m: FlightMode) => void
}

export const useFlightModeStore = create<FlightModeStore>((set) => ({
  mode: load(),
  setMode: (mode) => {
    set({ mode })
    try { localStorage.setItem(STORAGE_KEY, mode) } catch {}
    if (mode === 'lta') applyLTADefaults()
  },
}))

/** Switching to LTA: a balloon can't fly a course, and at 1–3 kt the track
 *  wanders, so drop any route, go North Up, and project the direction line
 *  by time. The pilot can still flip orientation back by hand. */
function applyLTADefaults() {
  const map = useMapSettingsStore.getState()
  map.setOrientation('north-up')
  map.setDirectionLineMode('time')
  if (map.directionLineMinutes === 5) map.setDirectionLineMinutes(10)
  const routes = useRouteStore.getState()
  routes.deactivateRoute()
  routes.setPreview(null)
}
