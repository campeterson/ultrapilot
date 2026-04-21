import { create } from 'zustand'

const STORAGE_KEY = 'ultrapilot_mapSettings'

type ToggleKey = 'showDirectionLine' | 'showDistanceRings' | 'recordTrack' | 'showInstrumentStrip' | 'showMapOverlays'

interface MapSettingsStore {
  showDirectionLine: boolean
  showDistanceRings: boolean
  recordTrack: boolean
  showInstrumentStrip: boolean
  showMapOverlays: boolean
  mapOrientation: 'track-up' | 'north-up'
  toggle: (key: ToggleKey) => void
  setOrientation: (o: 'track-up' | 'north-up') => void
}

type Persisted = Omit<MapSettingsStore, 'toggle' | 'setOrientation'>

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { showDirectionLine: true, showDistanceRings: false, recordTrack: true, showInstrumentStrip: true, showMapOverlays: true, mapOrientation: 'track-up', ...JSON.parse(raw) }
  } catch {}
  return { showDirectionLine: true, showDistanceRings: false, recordTrack: true, showInstrumentStrip: true, showMapOverlays: true, mapOrientation: 'track-up' }
}

function persist(state: MapSettingsStore) {
  const { showDirectionLine, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, mapOrientation } = state
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ showDirectionLine, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, mapOrientation }))
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
}))
