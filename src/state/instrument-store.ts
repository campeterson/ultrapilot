import { create } from 'zustand'
import type { InstrumentId } from '../data/models'
import type { InstrumentValues, RollingStats } from '../data/logic/instrument-logic'
import type { WindSample } from '../data/logic/gps-logic'
import { DEFAULT_INSTRUMENT_STRIP } from '../data/models'
import {
  PAGE_LAYOUTS, PAGE_LAYOUT_IDS, DEFAULT_PAGE_LAYOUT_ID, resizePageSlots,
  type PageLayoutId,
} from '../data/logic/instrument-layouts'

const WIND_BUFFER_SIZE = 60
const WIND_MIN_SPEED_KTS = 3  // below this, track is unreliable

const STORAGE_KEY = 'ultrapilot_instrumentConfig'

interface SavedConfig {
  strip: InstrumentId[]
  mapLeft: InstrumentId | null
  mapRight: InstrumentId | null
  mapBottom: InstrumentId | null
  stripCount: 4 | 5 | 6
  pageLayoutId: PageLayoutId
  pageSlots: InstrumentId[]
}

function defaultPageSlots(): InstrumentId[] {
  return [...PAGE_LAYOUTS[DEFAULT_PAGE_LAYOUT_ID].defaults]
}

function normalizeLayoutId(raw: unknown): PageLayoutId {
  return PAGE_LAYOUT_IDS.includes(raw as PageLayoutId) ? (raw as PageLayoutId) : DEFAULT_PAGE_LAYOUT_ID
}

function loadConfig(): SavedConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return {
          strip: parsed.length > 0 ? parsed : DEFAULT_INSTRUMENT_STRIP,
          mapLeft: null, mapRight: null, mapBottom: null, stripCount: 6,
          pageLayoutId: DEFAULT_PAGE_LAYOUT_ID,
          pageSlots: defaultPageSlots(),
        }
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const pageLayoutId = normalizeLayoutId(parsed.pageLayoutId)
        const rawSlots: InstrumentId[] = Array.isArray(parsed.pageSlots) ? parsed.pageSlots : []
        return {
          strip: Array.isArray(parsed.strip) && parsed.strip.length > 0 ? parsed.strip : DEFAULT_INSTRUMENT_STRIP,
          mapLeft: parsed.mapLeft ?? null,
          mapRight: parsed.mapRight ?? null,
          mapBottom: parsed.mapBottom ?? null,
          stripCount: parsed.stripCount ?? 6,
          pageLayoutId,
          pageSlots: resizePageSlots(pageLayoutId, rawSlots),
        }
      }
    }
  } catch {}
  return {
    strip: DEFAULT_INSTRUMENT_STRIP,
    mapLeft: null, mapRight: null, mapBottom: null, stripCount: 6,
    pageLayoutId: DEFAULT_PAGE_LAYOUT_ID,
    pageSlots: defaultPageSlots(),
  }
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
  pageLayoutId: PageLayoutId
  pageSlots: InstrumentId[]
  values: InstrumentValues | null
  maxAGLft: number

  // Rolling stats (reset per session)
  avgGSSum: number
  avgGSCount: number
  avgVSSum: number
  avgVSCount: number
  windSamples: WindSample[]

  setValues: (values: InstrumentValues) => void
  clearValues: () => void
  updateMaxAGL: (aglFt: number) => void
  updateRolling: (gsKts: number, vsFpm: number, trackDeg: number) => void
  getRollingStats: () => RollingStats
  resetRolling: () => void
  setStrip: (ids: InstrumentId[]) => void
  setMapLeft: (id: InstrumentId | null) => void
  setMapRight: (id: InstrumentId | null) => void
  setMapBottom: (id: InstrumentId | null) => void
  setStripCount: (n: 4 | 5 | 6) => void
  setPageLayout: (id: PageLayoutId) => void
  setPageSlot: (index: number, id: InstrumentId) => void
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
  pageLayoutId: initial.pageLayoutId,
  pageSlots: initial.pageSlots,
  values: null,
  maxAGLft: 0,

  avgGSSum: 0,
  avgGSCount: 0,
  avgVSSum: 0,
  avgVSCount: 0,
  windSamples: [],

  setValues: (values) => set({ values }),
  clearValues: () => set({ values: null }),
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
    set({ strip: ids })
    persist(get())
  },
  setMapLeft: (id) => {
    set({ mapLeft: id })
    persist(get())
  },
  setMapRight: (id) => {
    set({ mapRight: id })
    persist(get())
  },
  setMapBottom: (id) => {
    set({ mapBottom: id })
    persist(get())
  },
  setStripCount: (n) => {
    set({ stripCount: n })
    persist(get())
  },
  setPageLayout: (id) => {
    const nextSlots = resizePageSlots(id, get().pageSlots)
    set({ pageLayoutId: id, pageSlots: nextSlots })
    persist(get())
  },
  setPageSlot: (index, id) => {
    const next = [...get().pageSlots]
    if (index < 0 || index >= next.length) return
    next[index] = id
    set({ pageSlots: next })
    persist(get())
  },

  resetMaxAGL: () => set({ maxAGLft: 0 }),
}))

function persist(s: ReturnType<typeof useInstrumentStore.getState>) {
  saveConfig({
    strip: s.strip,
    mapLeft: s.mapLeft,
    mapRight: s.mapRight,
    mapBottom: s.mapBottom,
    stripCount: s.stripCount,
    pageLayoutId: s.pageLayoutId,
    pageSlots: s.pageSlots,
  })
}

export { NULL_VALUES }
