import { create } from 'zustand'
import { addSample, holdSample, pushFix, WINDREADER_STEP_MS, type WindreaderFix } from '../data/logic/windreader-logic'
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

/** v2 (1.8.0): default band went 100 → 50 ft. */
const SETTINGS_VERSION = 2

const DEFAULT_SETTINGS: Settings = {
  bandFt: 50,
  units: 'kt',
  showMapLines: true,
  lineMinutes: 10,
  showMapPanel: true,
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const settings: Settings = { ...DEFAULT_SETTINGS, ...parsed }
      // Settings saved before v2 always carried the old 100 ft default
      if (parsed.settingsVersion !== SETTINGS_VERSION) settings.bandFt = DEFAULT_SETTINGS.bandFt
      return settings
    }
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
  /** Rolling buffer of recent fixes for the hold check (not persisted). */
  recentFixes: WindreaderFix[]
  lastSampleTs: number

  ingest: (fix: WindreaderFix, sessionId: string) => void
  clear: () => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

const initialData = loadData()

export const useWindreaderStore = create<WindreaderStore>((set, get) => ({
  ...loadSettings(),
  sessionId: initialData.sessionId,
  samples: initialData.samples,
  recentFixes: [],
  lastSampleTs: 0,

  ingest: (fix, sessionId) => {
    const s = get()
    if (s.sessionId !== sessionId) {
      set({ sessionId, samples: [], recentFixes: [fix], lastSampleTs: 0 })
      persistData(sessionId, [])
      return
    }
    const recentFixes = pushFix(s.recentFixes, fix)
    // A restarted buffer (dropout) also restarts the sample cadence
    const lastSampleTs = recentFixes.length === 1 ? 0 : s.lastSampleTs
    // Only a level held for WINDREADER_HOLD_MS yields a reading
    const sample = fix.ts - lastSampleTs >= WINDREADER_STEP_MS ? holdSample(recentFixes) : null
    if (sample) {
      const samples = addSample(s.samples, sample, s.bandFt)
      set({ samples, recentFixes, lastSampleTs: fix.ts })
      persistData(sessionId, samples)
    } else {
      set({ recentFixes, lastSampleTs })
    }
  },

  clear: () => {
    set({ samples: [], recentFixes: [], lastSampleTs: 0 })
    persistData(get().sessionId, [])
  },

  setSetting: (key, value) => {
    set({ [key]: value } as Partial<WindreaderStore>)
    const { bandFt, units, showMapLines, lineMinutes, showMapPanel } = get()
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bandFt, units, showMapLines, lineMinutes, showMapPanel, settingsVersion: SETTINGS_VERSION }))
    } catch {}
  },
}))

function persistData(sessionId: string | null, samples: WindreaderSample[]) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify({ sessionId, samples })) } catch {}
}
