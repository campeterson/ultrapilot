import { create } from 'zustand'
import { makeSample, addSample, WINDREADER_MAX_INTERVAL_MS, type WindreaderFix } from '../data/logic/windreader-logic'
import type { WindreaderSample, WindreaderUnits } from '../data/models'

const SETTINGS_KEY = 'ultrapilot_windreaderSettings'
const DATA_KEY = 'ultrapilot_windreaderData'

export type WindreaderBandFt = 50 | 100 | 200
export type WindLineMinutes = 5 | 10 | 30

interface Settings {
  bandFt: WindreaderBandFt
  units: WindreaderUnits
  showMapLines: boolean
  lineMinutes: WindLineMinutes
  showMapPanel: boolean
}

const DEFAULT_SETTINGS: Settings = {
  bandFt: 100,
  units: 'kt',
  showMapLines: true,
  lineMinutes: 10,
  showMapPanel: true,
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function loadData(): { sessionId: string | null; samples: WindreaderSample[] } {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.samples)) return { sessionId: parsed.sessionId ?? null, samples: parsed.samples }
    }
  } catch {}
  return { sessionId: null, samples: [] }
}

interface WindreaderStore extends Settings {
  /** Session the samples belong to. A new session starts a fresh windreader. */
  sessionId: string | null
  samples: WindreaderSample[]
  lastFix: WindreaderFix | null

  ingest: (fix: WindreaderFix, sessionId: string) => void
  clear: () => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

const initialData = loadData()

export const useWindreaderStore = create<WindreaderStore>((set, get) => ({
  ...loadSettings(),
  sessionId: initialData.sessionId,
  samples: initialData.samples,
  lastFix: null,

  ingest: (fix, sessionId) => {
    const s = get()
    if (s.sessionId !== sessionId) {
      set({ sessionId, samples: [], lastFix: fix })
      persistData(sessionId, [])
      return
    }
    if (!s.lastFix || fix.ts < s.lastFix.ts) {
      set({ lastFix: fix })
      return
    }
    // Wait until a full sampling interval has elapsed since the anchor fix
    const sample = makeSample(s.lastFix, fix)
    if (sample) {
      const samples = addSample(s.samples, sample, s.bandFt)
      set({ samples, lastFix: fix })
      persistData(sessionId, samples)
    } else if (fix.ts - s.lastFix.ts > WINDREADER_MAX_INTERVAL_MS) {
      // Interval was too long (dropout) — restart from this fix
      set({ lastFix: fix })
    }
  },

  clear: () => {
    set({ samples: [], lastFix: null })
    persistData(get().sessionId, [])
  },

  setSetting: (key, value) => {
    set({ [key]: value } as Partial<WindreaderStore>)
    const { bandFt, units, showMapLines, lineMinutes, showMapPanel } = get()
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bandFt, units, showMapLines, lineMinutes, showMapPanel }))
    } catch {}
  },
}))

function persistData(sessionId: string | null, samples: WindreaderSample[]) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify({ sessionId, samples })) } catch {}
}
