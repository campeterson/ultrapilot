import { create } from 'zustand'

const STORAGE_KEY = 'ultrapilot_mapSettings'

interface MapSettingsStore {
  showDirectionLine: boolean
  showDistanceRings: boolean
  toggle: (key: 'showDirectionLine' | 'showDistanceRings') => void
}

function load(): Pick<MapSettingsStore, 'showDirectionLine' | 'showDistanceRings'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { showDirectionLine: true, showDistanceRings: false, ...JSON.parse(raw) }
  } catch {}
  return { showDirectionLine: true, showDistanceRings: false }
}

export const useMapSettingsStore = create<MapSettingsStore>((set, get) => ({
  ...load(),

  toggle: (key) => {
    const next = !get()[key]
    set({ [key]: next } as Partial<MapSettingsStore>)
    const { showDirectionLine, showDistanceRings } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showDirectionLine, showDistanceRings }))
  },
}))
