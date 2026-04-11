import { create } from 'zustand'
import type { InstrumentId } from '../data/models'
import type { InstrumentValues } from '../data/logic/instrument-logic'
import { DEFAULT_INSTRUMENT_STRIP } from '../data/models'

const STORAGE_KEY = 'ultrapilot_instrumentConfig'

interface SavedConfig {
  strip: InstrumentId[]
  mapLeft: InstrumentId | null
  mapRight: InstrumentId | null
  mapBottom: InstrumentId | null
  stripCount: 4 | 5 | 6
}

function loadConfig(): SavedConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return { strip: parsed.length > 0 ? parsed : DEFAULT_INSTRUMENT_STRIP, mapLeft: null, mapRight: null, mapBottom: null, stripCount: 6 }
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          strip: Array.isArray(parsed.strip) && parsed.strip.length > 0 ? parsed.strip : DEFAULT_INSTRUMENT_STRIP,
          mapLeft: parsed.mapLeft ?? null,
          mapRight: parsed.mapRight ?? null,
          mapBottom: parsed.mapBottom ?? null,
          stripCount: parsed.stripCount ?? 6,
        }
      }
    }
  } catch {}
  return { strip: DEFAULT_INSTRUMENT_STRIP, mapLeft: null, mapRight: null, mapBottom: null, stripCount: 6 }
}

function saveConfig(c: SavedConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
}

interface InstrumentStore {
  strip: InstrumentId[]
  mapLeft: InstrumentId | null
  mapRight: InstrumentId | null
  mapBottom: InstrumentId | null
  stripCount: 4 | 5 | 6
  values: InstrumentValues | null
  maxAGLft: number

  setValues: (values: InstrumentValues) => void
  updateMaxAGL: (aglFt: number) => void
  setStrip: (ids: InstrumentId[]) => void
  setMapLeft: (id: InstrumentId | null) => void
  setMapRight: (id: InstrumentId | null) => void
  setMapBottom: (id: InstrumentId | null) => void
  setStripCount: (n: 4 | 5 | 6) => void
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
  mapBottom: initial.mapBottom,
  stripCount: initial.stripCount,
  values: null,
  maxAGLft: 0,

  setValues: (values) => set({ values }),
  updateMaxAGL: (aglFt) => { if (aglFt > get().maxAGLft) set({ maxAGLft: aglFt }) },

  setStrip: (ids) => {
    const s = get(); saveConfig({ strip: ids, mapLeft: s.mapLeft, mapRight: s.mapRight, mapBottom: s.mapBottom, stripCount: s.stripCount })
    set({ strip: ids })
  },
  setMapLeft: (id) => {
    const s = get(); saveConfig({ strip: s.strip, mapLeft: id, mapRight: s.mapRight, mapBottom: s.mapBottom, stripCount: s.stripCount })
    set({ mapLeft: id })
  },
  setMapRight: (id) => {
    const s = get(); saveConfig({ strip: s.strip, mapLeft: s.mapLeft, mapRight: id, mapBottom: s.mapBottom, stripCount: s.stripCount })
    set({ mapRight: id })
  },
  setMapBottom: (id) => {
    const s = get(); saveConfig({ strip: s.strip, mapLeft: s.mapLeft, mapRight: s.mapRight, mapBottom: id, stripCount: s.stripCount })
    set({ mapBottom: id })
  },
  setStripCount: (n) => {
    const s = get(); saveConfig({ strip: s.strip, mapLeft: s.mapLeft, mapRight: s.mapRight, mapBottom: s.mapBottom, stripCount: n })
    set({ stripCount: n })
  },

  resetMaxAGL: () => set({ maxAGLft: 0 }),
}))

export { NULL_VALUES }
