import { create } from 'zustand'
import { addSample, bandSizeFt, holdSample, pushFix, WINDREADER_STEP_MS, type WindreaderBandStep, type WindreaderFix } from '../data/logic/windreader-logic'
import type { WindreaderSample } from '../data/models'
import { useUnitsStore } from './units-store'

const SETTINGS_KEY = 'ultrapilot_windreaderSettings'
const DATA_KEY = 'ultrapilot_windreaderData'

export type WindLineMinutes = 5 | 10 | 30

interface Settings {
  /** Band size: 1 = 50 ft / 15 m, 2 = 100 ft / 30 m, 4 = 200 ft / 60 m. */
  bandStep: WindreaderBandStep
  showMapLines: boolean
  lineMinutes: WindLineMinutes
  showMapPanel: boolean
}

/** v2 (1.8.0): default band went 100 → 50 ft.
 *  v3 (1.9.0): bandFt → bandStep; speed units moved to the app-wide units store. */
const SETTINGS_VERSION = 3
const STEP_FROM_FT: Record<number, WindreaderBandStep> = { 50: 1, 100: 2, 200: 4 }

const DEFAULT_SETTINGS: Settings = {
  bandStep: 1,
  showMapLines: true,
  lineMinutes: 10,
  showMapPanel: true,
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const { showMapLines, lineMinutes, showMapPanel } = { ...DEFAULT_SETTINGS, ...parsed }
      let bandStep: WindreaderBandStep = parsed.bandStep ?? DEFAULT_SETTINGS.bandStep
      // v2 stored bandFt; before v2 it always carried the old 100 ft default
      if (parsed.settingsVersion === 2) bandStep = STEP_FROM_FT[parsed.bandFt] ?? DEFAULT_SETTINGS.bandStep
      else if (parsed.settingsVersion !== SETTINGS_VERSION) bandStep = DEFAULT_SETTINGS.bandStep
      return { bandStep, showMapLines, lineMinutes, showMapPanel }
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
      const samples = addSample(s.samples, sample, bandSizeFt(s.bandStep, useUnitsStore.getState().altitude))
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
    const { bandStep, showMapLines, lineMinutes, showMapPanel } = get()
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bandStep, showMapLines, lineMinutes, showMapPanel, settingsVersion: SETTINGS_VERSION }))
    } catch {}
  },
}))

function persistData(sessionId: string | null, samples: WindreaderSample[]) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify({ sessionId, samples })) } catch {}
}
