import { create } from 'zustand'
import type { InstrumentId } from '../data/models'
import type { InstrumentValues } from '../data/logic/instrument-logic'
import { DEFAULT_INSTRUMENT_STRIP } from '../data/models'

const STORAGE_KEY = 'ultrapilot_instrumentConfig'

function loadStrip(): InstrumentId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as InstrumentId[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return DEFAULT_INSTRUMENT_STRIP
}

interface InstrumentStore {
  strip: InstrumentId[]
  values: InstrumentValues | null
  maxAGLft: number

  setValues: (values: InstrumentValues) => void
  updateMaxAGL: (aglFt: number) => void
  setStrip: (ids: InstrumentId[]) => void
  resetMaxAGL: () => void
}

const NULL_VALUES: InstrumentValues = {
  gs: 0, agl: 0, msl: 0, vs: 0, hdg: 0,
  dist: 0, brg: 0, etime: 0, sess: 0, maxalt: 0,
}

export const useInstrumentStore = create<InstrumentStore>((set, get) => ({
  strip: loadStrip(),
  values: null,
  maxAGLft: 0,

  setValues: (values) => set({ values }),

  updateMaxAGL: (aglFt) => {
    if (aglFt > get().maxAGLft) set({ maxAGLft: aglFt })
  },

  setStrip: (ids) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    set({ strip: ids })
  },

  resetMaxAGL: () => set({ maxAGLft: 0 }),
}))

export { NULL_VALUES }
