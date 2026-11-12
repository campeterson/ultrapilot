import { create } from 'zustand'
import type { FlightMode } from '../data/models'
import { DEFAULT_LINE_MINUTES, validLineMinutes, type LineMinutes } from '../data/logic/direction-line-logic'

const STORAGE_KEY = 'ultrapilot_mapSettings'

type ToggleKey = 'showDirectionLine' | 'showDistanceRings' | 'recordTrack' | 'showInstrumentStrip' | 'showMapOverlays'

interface MapSettingsStore {
  showDirectionLine: boolean
  /** Look-ahead (min) of the direction line — where you'll be at current groundspeed — per flight mode. */
  lineMinutes: Record<FlightMode, LineMinutes>
  showDistanceRings: boolean
  recordTrack: boolean
  showInstrumentStrip: boolean
  showMapOverlays: boolean
  mapOrientation: 'track-up' | 'north-up'
  toggle: (key: ToggleKey) => void
  setOrientation: (o: 'track-up' | 'north-up') => void
  setLineMinutes: (mode: FlightMode, m: LineMinutes) => void
}

type Persisted = Omit<MapSettingsStore, 'toggle' | 'setOrientation' | 'setLineMinutes'>

const DEFAULTS: Persisted = {
  showDirectionLine: true,
  lineMinutes: { ...DEFAULT_LINE_MINUTES },
  showDistanceRings: false,
  recordTrack: true,
  showInstrumentStrip: true,
  showMapOverlays: true,
  mapOrientation: 'track-up',
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      // Older saves had a fixed-2 nm mode and 5/10/30 min; anything not on today's lists → default
      const lineMinutes = { powered: validLineMinutes('powered', p.lineMinutes?.powered), lta: validLineMinutes('lta', p.lineMinutes?.lta) }
      const { directionLineMode: _m, directionLineMinutes: _n, ...rest } = p
      return { ...DEFAULTS, ...rest, lineMinutes }
    }
  } catch {}
  return { ...DEFAULTS }
}

function persist(state: MapSettingsStore) {
  const { showDirectionLine, lineMinutes, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, mapOrientation } = state
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ showDirectionLine, lineMinutes, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, mapOrientation })) } catch {}
}

export const useMapSettingsStore = create<MapSettingsStore>((set, get) => ({
  ...load(),

  toggle: (key) => {
    set({ [key]: !get()[key] } as Partial<MapSettingsStore>)
    persist(get())
  },

  setOrientation: (o) => {
    set({ mapOrientation: o })
    persist(get())
  },

  setLineMinutes: (mode, m) => {
    set({ lineMinutes: { ...get().lineMinutes, [mode]: m } })
    persist(get())
  },
}))
