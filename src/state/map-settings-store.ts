import { create } from 'zustand'

const STORAGE_KEY = 'ultrapilot_mapSettings'

type ToggleKey = 'showDirectionLine' | 'showDistanceRings' | 'recordTrack' | 'showInstrumentStrip' | 'showMapOverlays'

export type DirectionLineMode = 'distance' | 'time'
export type DirectionLineMinutes = 5 | 10 | 30

interface MapSettingsStore {
  showDirectionLine: boolean
  /** 'distance' = fixed length ahead; 'time' = where you'll be in N minutes at current groundspeed */
  directionLineMode: DirectionLineMode
  directionLineMinutes: DirectionLineMinutes
  showDistanceRings: boolean
  recordTrack: boolean
  showInstrumentStrip: boolean
  showMapOverlays: boolean
  mapOrientation: 'track-up' | 'north-up'
  toggle: (key: ToggleKey) => void
  setOrientation: (o: 'track-up' | 'north-up') => void
  setDirectionLineMode: (m: DirectionLineMode) => void
  setDirectionLineMinutes: (m: DirectionLineMinutes) => void
}

type Persisted = Omit<MapSettingsStore, 'toggle' | 'setOrientation' | 'setDirectionLineMode' | 'setDirectionLineMinutes'>

const DEFAULTS: Persisted = {
  showDirectionLine: true,
  directionLineMode: 'distance',
  directionLineMinutes: 5,
  showDistanceRings: false,
  recordTrack: true,
  showInstrumentStrip: true,
  showMapOverlays: true,
  mapOrientation: 'track-up',
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

function persist(state: MapSettingsStore) {
  const { showDirectionLine, directionLineMode, directionLineMinutes, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, mapOrientation } = state
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ showDirectionLine, directionLineMode, directionLineMinutes, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, mapOrientation }))
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

  setDirectionLineMode: (m) => {
    set({ directionLineMode: m })
    persist(get())
  },

  setDirectionLineMinutes: (m) => {
    set({ directionLineMinutes: m })
    persist(get())
  },
}))
