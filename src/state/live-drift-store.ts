import { create } from 'zustand'
import { buildForecastUrl, forecastResults, parseSiteForecast } from '../data/logic/forecast-logic'
import { needsForecast, siteForFix, type DriftForecast, type LiveDriftMinutes } from '../data/logic/live-drift-logic'
import type { LiveFix } from '../data/logic/live-codec'
import { useLiveGroupStore } from './live-group-store'
import { useFlightPlanStore } from './flight-plan-store'
import { trackEvent } from '../lib/analytics'

interface LiveDriftStore {
  /** Member whose forecast drift is drawn, or null. */
  memberId: string | null
  minutes: LiveDriftMinutes
  forecast: DriftForecast | null
  fetching: boolean
  error: string | null
  watch: (memberId: string) => void
  stop: () => void
  setMinutes: (m: LiveDriftMinutes) => void
}

let unsub: (() => void) | null = null

export const useLiveDriftStore = create<LiveDriftStore>((set, get) => {
  /** Fetch winds around the member when the current forecast no longer covers it. */
  async function ensure(fix: LiveFix) {
    const { forecast, minutes, fetching } = get()
    if (fetching || !needsForecast(forecast, fix, minutes, Date.now())) return
    set({ fetching: true, error: null })
    try {
      const model = useFlightPlanStore.getState().model
      const res = await fetch(buildForecastUrl([fix], model, fix.ts), { signal: AbortSignal.timeout(15_000) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error((json as { reason?: string } | null)?.reason ?? `Forecast failed (${res.status})`)
      const f = parseSiteForecast(forecastResults(json)[0], siteForFix(fix), model, Date.now())
      set({ forecast: { lat: fix.lat, lon: fix.lon, hours: f.hours, fetchedAt: f.fetchedAt }, fetching: false })
    } catch (e) {
      set({ fetching: false, error: navigator.onLine === false ? 'Offline — no forecast' : (e as Error).message })
    }
  }

  function check() {
    const { memberId } = get()
    const m = useLiveGroupStore.getState().members.find(x => x.pubId === memberId)
    if (m?.fix) void ensure(m.fix)
  }

  return {
    memberId: null,
    minutes: 60,
    forecast: null,
    fetching: false,
    error: null,

    watch: (memberId) => {
      unsub?.()
      set({ memberId, forecast: null, error: null })
      // Each poll may move the member past the forecast's reach
      unsub = useLiveGroupStore.subscribe((s, p) => {
        if (!s.group) { get().stop(); return }   // left the group
        if (s.members !== p.members) check()
      })
      check()
      trackEvent('live_drift_forecast')
    },

    stop: () => {
      unsub?.(); unsub = null
      set({ memberId: null, forecast: null, error: null })
    },

    setMinutes: (minutes) => { set({ minutes }); check() },
  }
})
