import { create } from 'zustand'
import { decodeMETAR, type MetarDecoded } from '../data/logic/metar-logic'
import { useSessionStore } from './session-store'
import { useTimelineStore } from './timeline-store'
import { useGPSStore } from './gps-store'

const METAR_FN = '/.netlify/functions/metar'

interface WeatherStore {
  stationId: string
  metar: MetarDecoded | null
  fetchedAt: number | null
  fetching: boolean
  error: string | null

  fetchByStation: (id: string) => Promise<void>
  fetchNearest: (lat: number, lon: number) => Promise<void>
}

async function callMetarFn(params: Record<string, string>): Promise<{ metar: string; station: string }> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${METAR_FN}?${qs}`, { signal: AbortSignal.timeout(10_000) })
  const data = await res.json() as { error?: string; metar?: string; station?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
  if (!data.metar || !data.station) throw new Error('No METAR data returned')
  return { metar: data.metar, station: data.station }
}

/** If a session is active, stamp the decoded METAR to the timeline. */
function stampWeather(decoded: MetarDecoded, station: string) {
  const { session } = useSessionStore.getState()
  if (!session) return
  const pos = useGPSStore.getState().position
  const note = `${station} ${decoded.category} · ${decoded.wind} · ${decoded.visibility} · ${decoded.ceiling}`
  useTimelineStore.getState().addStamp({
    sessionId: session.id,
    ts: Date.now(),
    type: 'weather',
    lat: pos?.lat ?? session.originLat,
    lon: pos?.lon ?? session.originLon,
    altMSL: pos?.altMSL ?? session.originAltMSL,
    altAGL: 0,
    speed: pos?.speed ?? 0,
    note,
  })
}

export const useWeatherStore = create<WeatherStore>((set) => ({
  stationId: '',
  metar: null,
  fetchedAt: null,
  fetching: false,
  error: null,

  fetchByStation: async (id) => {
    set({ fetching: true, error: null })
    try {
      const { metar, station } = await callMetarFn({ id })
      const decoded = decodeMETAR(metar)
      set({ metar: decoded, stationId: station, fetchedAt: Date.now(), fetching: false })
      stampWeather(decoded, station)
    } catch (err) {
      set({ fetching: false, error: err instanceof Error ? err.message : 'Fetch failed' })
    }
  },

  fetchNearest: async (lat, lon) => {
    set({ fetching: true, error: null })
    try {
      const { metar, station } = await callMetarFn({ lat: lat.toFixed(4), lon: lon.toFixed(4) })
      const decoded = decodeMETAR(metar)
      set({ metar: decoded, stationId: station, fetchedAt: Date.now(), fetching: false })
      stampWeather(decoded, station)
    } catch (err) {
      set({ fetching: false, error: err instanceof Error ? err.message : 'Fetch failed' })
    }
  },
}))
