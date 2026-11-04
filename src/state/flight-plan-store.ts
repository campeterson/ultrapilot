import { create } from 'zustand'
import {
  buildForecastUrl, DEFAULT_AGL_FT, forecastResults, parseSiteForecast, planBaseTs, tomorrowDate, localDateString,
} from '../data/logic/forecast-logic'
import { MAX_PLAN_SITES } from '../data/logic/plan-logic'
import type { DriftMinutes } from '../data/logic/drift-logic'
import type { LaunchSite, PlanAltitudeMode, SiteForecast } from '../data/models'
import { trackEvent } from '../lib/analytics'

const SETTINGS_KEY = 'ultrapilot_flightPlan'
const FORECASTS_KEY = 'ultrapilot_flightPlanForecasts'

export type SlotOffset = -1 | 0 | 1 | 2

interface Settings {
  selectedSiteIds: string[]
  date: string          // YYYY-MM-DD, device local
  hour: number          // 0–23
  mode: PlanAltitudeMode
  aglFt: number[]
  /** null = derived from the chosen sites' ground (highest + AGL ladder). */
  mslFt: number[] | null
  model: string
  driftMinutes: DriftMinutes
  showOnMap: boolean
  /** Draw every altitude's track, or just the cruise altitude's. */
  compare: boolean
  /** Index into the altitude set used as cruise altitude. */
  cruiseIndex: number
}

const DEFAULT_SETTINGS: Settings = {
  selectedSiteIds: [],
  date: tomorrowDate(),
  hour: 7,
  mode: 'agl',
  aglFt: DEFAULT_AGL_FT,
  mslFt: null,
  model: 'best_match',
  driftMinutes: 60,
  showOnMap: true,
  compare: true,
  cruiseIndex: 3,
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s: Settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      // A plan date in the past rolls forward to tomorrow
      if (s.date < localDateString(new Date())) s.date = tomorrowDate()
      return s
    }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function loadForecasts(): Record<string, SiteForecast> {
  try {
    const raw = localStorage.getItem(FORECASTS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

interface FlightPlanStore extends Settings {
  /** Hour slot being viewed, relative to the plan time. Not persisted. */
  slot: SlotOffset
  forecasts: Record<string, SiteForecast>
  fetching: boolean
  error: string | null

  toggleSite: (id: string) => void
  deselectSite: (id: string) => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setSlot: (slot: SlotOffset) => void
  /** Forget a site's forecast (its position or elevation changed). */
  dropForecast: (id: string) => void
  fetchForecasts: (sites: LaunchSite[]) => Promise<void>
}

export const useFlightPlanStore = create<FlightPlanStore>((set, get) => ({
  ...loadSettings(),
  slot: 0,
  forecasts: loadForecasts(),
  fetching: false,
  error: null,

  toggleSite: (id) => {
    const ids = get().selectedSiteIds
    if (ids.includes(id)) get().setSetting('selectedSiteIds', ids.filter(x => x !== id))
    else if (ids.length < MAX_PLAN_SITES) get().setSetting('selectedSiteIds', [...ids, id])
  },

  deselectSite: (id) => {
    const ids = get().selectedSiteIds
    if (ids.includes(id)) get().setSetting('selectedSiteIds', ids.filter(x => x !== id))
  },

  setSetting: (key, value) => {
    set({ [key]: value } as Partial<FlightPlanStore>)
    // A new plan time starts back on the chosen hour
    if (key === 'date' || key === 'hour') set({ slot: 0 })
    const s = get()
    const settings: Settings = {
      selectedSiteIds: s.selectedSiteIds, date: s.date, hour: s.hour, mode: s.mode, aglFt: s.aglFt,
      mslFt: s.mslFt, model: s.model, driftMinutes: s.driftMinutes, showOnMap: s.showOnMap,
      compare: s.compare, cruiseIndex: s.cruiseIndex,
    }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch {}
  },

  setSlot: (slot) => set({ slot }),

  dropForecast: (id) => {
    if (!get().forecasts[id]) return
    const { [id]: _omit, ...forecasts } = get().forecasts
    void _omit
    set({ forecasts })
    try { localStorage.setItem(FORECASTS_KEY, JSON.stringify(forecasts)) } catch {}
  },

  fetchForecasts: async (sites) => {
    if (sites.length === 0) return
    const { model, date, hour } = get()
    set({ fetching: true, error: null })
    try {
      const url = buildForecastUrl(sites, model, planBaseTs(date, hour))
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error((json as { reason?: string } | null)?.reason ?? `Forecast request failed (${res.status})`)
      const results = forecastResults(json)
      const now = Date.now()
      // Keep only what this plan fetched — storage stays small
      const forecasts: Record<string, SiteForecast> = {}
      sites.forEach((site, i) => {
        if (results[i]) forecasts[site.id] = parseSiteForecast(results[i], site, model, now)
      })
      set({ forecasts, fetching: false })
      try { localStorage.setItem(FORECASTS_KEY, JSON.stringify(forecasts)) } catch {}
      trackEvent('flight_plan_fetch')
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      set({ fetching: false, error: offline ? 'Offline — connect to fetch a forecast' : (e as Error).message })
    }
  },
}))
