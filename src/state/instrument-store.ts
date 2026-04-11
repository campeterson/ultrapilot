import { create } from 'zustand'
import type { InstrumentId } from '../data/models'
import type { InstrumentValues } from '../data/logic/instrument-logic'
import { DEFAULT_INSTRUMENT_STRIP } from '../data/models'

const STORAGE_KEY = 'ultrapilot_instrumentConfig'

interface SavedConfig {
  strip: InstrumentId[]
  mapLeft: InstrumentId | null
  mapRight: InstrumentId | null
}

function loadConfig(): SavedConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Legacy: stored as a plain array before map overlay support
      if (Array.isArray(parsed)) {
        return { strip: parsed.length > 0 ? parsed : DEFAULT_INSTRUMENT_STRIP, mapLeft: null, mapRight: null }
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          strip: Array.isArray(parsed.strip) && parsed.strip.length > 0 ? parsed.strip : DEFAULT_INSTRUMENT_STRIP,
          mapLeft: parsed.mapLeft ?? null,
          mapRight: parsed.mapRight ?? null,
        }
      }
    }
  } catch {}
  return { strip: DEFAULT_INSTRUMENT_STRIP, mapLeft: null, mapRight: null }
}

function saveConfig(strip: InstrumentId[], mapLeft: InstrumentId | null, mapRight: InstrumentId | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ strip, mapLeft, mapRight }))
}

interface InstrumentStore {
  strip: InstrumentId[]
  mapLeft: InstrumentId | null
  mapRight: InstrumentId | null
  values: InstrumentValues | null
  maxAGLft: number

  setValues: (values: InstrumentValues) => void
  updateMaxAGL: (aglFt: number) => void
  setStrip: (ids: InstrumentId[]) => void
  setMapLeft: (id: InstrumentId | null) => void
  setMapRight: (id: InstrumentId | null) => void
  resetMaxAGL: () => void
}

const NULL_VALUES: InstrumentValues = {
  gs: 0, agl: 0, msl: 0, vs: 0, hdg: 0,
  dist: 0, brg: 0, etime: 0, sess: 0, maxalt: 0,
  dtk: null, dte: null, xtk: null, ete: null,
}

const initial = loadConfig()

export const useInstrumentStore = create<InstrumentStore>((set, get) => ({
  strip: initial.strip,
  mapLeft: initial.mapLeft,
  mapRight: initial.mapRight,
  values: null,
  maxAGLft: 0,

  setValues: (values) => set({ values }),

  updateMaxAGL: (aglFt) => {
    if (aglFt > get().maxAGLft) set({ maxAGLft: aglFt })
  },

  setStrip: (ids) => {
    const { mapLeft, mapRight } = get()
    saveConfig(ids, mapLeft, mapRight)
    set({ strip: ids })
  },

  setMapLeft: (id) => {
    const { strip, mapRight } = get()
    saveConfig(strip, id, mapRight)
    set({ mapLeft: id })
  },

  setMapRight: (id) => {
    const { strip, mapLeft } = get()
    saveConfig(strip, mapLeft, id)
    set({ mapRight: id })
  },

  resetMaxAGL: () => set({ maxAGLft: 0 }),
}))

export { NULL_VALUES }
