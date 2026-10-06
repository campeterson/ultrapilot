import { create } from 'zustand'
import type { UnitPrefs } from '../data/models'
import { AVIATION_UNITS } from '../data/logic/units-logic'

const STORAGE_KEY = 'ultrapilot_units'
/** Before 1.9.0 the Windreader had its own speed unit; it seeds the app-wide one. */
const LEGACY_WINDREADER_KEY = 'ultrapilot_windreaderSettings'

function load(): UnitPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...AVIATION_UNITS, ...JSON.parse(raw) }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_WINDREADER_KEY) ?? '{}')
    if (legacy.units === 'mph' || legacy.units === 'kmh') return { ...AVIATION_UNITS, speed: legacy.units }
  } catch {}
  return { ...AVIATION_UNITS }
}

interface UnitsStore extends UnitPrefs {
  setUnit: <K extends keyof UnitPrefs>(key: K, value: UnitPrefs[K]) => void
  setAll: (prefs: UnitPrefs) => void
}

export const useUnitsStore = create<UnitsStore>((set, get) => ({
  ...load(),
  setUnit: (key, value) => {
    set({ [key]: value } as Partial<UnitsStore>)
    persist(get())
  },
  setAll: (prefs) => {
    set(prefs)
    persist(prefs)
  },
}))

/** Just the preferences (no actions) — for passing into data-layer formatters. */
export function selectUnits(s: UnitPrefs): UnitPrefs {
  return { altitude: s.altitude, speed: s.speed, distance: s.distance, vertical: s.vertical }
}

function persist(p: UnitPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectUnits(p))) } catch {}
}
