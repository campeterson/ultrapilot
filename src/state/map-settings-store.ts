import { create } from 'zustand'

const STORAGE_KEY = 'ultrapilot_mapSettings'

type ToggleKey = 'showDirectionLine' | 'showDistanceRings' | 'recordTrack' | 'showInstrumentStrip'

interface MapSettingsStore {
  showDirectionLine: boolean
  showDistanceRings: boolean
  recordTrack: boolean
  showInstrumentStrip: boolean
  toggle: (key: ToggleKey) => void
}

function load(): Pick<MapSettingsStore, 'showDirectionLine' | 'showDistanceRings' | 'recordTrack' | 'showInstrumentStrip'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { showDirectionLine: true, showDistanceRings: false, recordTrack: true, showInstrumentStrip: true, ...JSON.parse(raw) }
  } catch {}
  return { showDirectionLine: true, showDistanceRings: false, recordTrack: true, showInstrumentStrip: true }
}

export const useMapSettingsStore = create<MapSettingsStore>((set, get) => ({
  ...load(),

  toggle: (key) => {
    const next = !get()[key]
    set({ [key]: next } as Partial<MapSettingsStore>)
    const { showDirectionLine, showDistanceRings, recordTrack, showInstrumentStrip } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showDirectionLine, showDistanceRings, recordTrack, showInstrumentStrip }))
  },
}))
