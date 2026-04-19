import { create } from 'zustand'
import type { InstrumentId } from '../data/models'
import type { InstrumentValues, RollingStats } from '../data/logic/instrument-logic'
import type { WindSample } from '../data/logic/gps-logic'
import { DEFAULT_INSTRUMENT_STRIP } from '../data/models'

const WIND_BUFFER_SIZE = 60
const WIND_MIN_SPEED_KTS = 3  // below this, track is unreliable

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

  // Rolling stats (reset per session)
  avgGSSum: number
  avgGSCount: number
  avgVSSum: number
  avgVSCount: number
  windSamples: WindSample[]

  setValues: (values: InstrumentValues) => void
  updateMaxAGL: (aglFt: number) => void
  updateRolling: (gsKts: number, vsFpm: number, trackDeg: number) => void
  getRollingStats: () => RollingStats
  resetRolling: () => void
  setStrip: (ids: InstrumentId[]) => void
  setMapLeft: (id: InstrumentId | null) => void
  setMapRight: (id: InstrumentId | null) => void
  setMapBottom: (id: InstrumentId | null) => void
  setStripCount: (n: 4 | 5 | 6) => void
  resetMaxAGL: () => void
}

const NULL_VALUES: InstrumentValues = {
  gs: 0, agl: 0, msl: 0, vs: 0, hdg: 0,
  dist: 0, brg: 0, etime: 0, sess: 0, tod: 0, maxalt: 0,
  avgs: 0, avgvs: 0, wdir: null, wspd: null,
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

  avgGSSum: 0,
  avgGSCount: 0,
  avgVSSum: 0,
  avgVSCount: 0,
  windSamples: [],

  setValues: (values) => set({ values }),
  updateMaxAGL: (aglFt) => { if (aglFt > get().maxAGLft) set({ maxAGLft: aglFt }) },

  updateRolling: (gsKts, vsFpm, trackDeg) => {
    const s = get()
    const nextGSSum = s.avgGSSum + gsKts
    const nextGSCount = s.avgGSCount + 1
    // Only include VS when there's meaningful motion
    const includeVS = Math.abs(vsFpm) > 50
    const nextVSSum = includeVS ? s.avgVSSum + vsFpm : s.avgVSSum
    const nextVSCount = includeVS ? s.avgVSCount + 1 : s.avgVSCount
    // Wind buffer: only while moving, finite track
    let nextWind = s.windSamples
    if (gsKts >= WIND_MIN_SPEED_KTS && isFinite(trackDeg)) {
      nextWind = [...s.windSamples.slice(-(WIND_BUFFER_SIZE - 1)), { trackDeg, speedKts: gsKts }]
    }
    set({
      avgGSSum: nextGSSum, avgGSCount: nextGSCount,
      avgVSSum: nextVSSum, avgVSCount: nextVSCount,
      windSamples: nextWind,
    })
  },

  getRollingStats: () => {
    const s = get()
    return {
      avgGSKts: s.avgGSCount > 0 ? s.avgGSSum / s.avgGSCount : 0,
      avgVSFpm: s.avgVSCount > 0 ? s.avgVSSum / s.avgVSCount : 0,
      windSamples: s.windSamples,
    }
  },

  resetRolling: () => set({
    avgGSSum: 0, avgGSCount: 0,
    avgVSSum: 0, avgVSCount: 0,
    windSamples: [],
  }),

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
