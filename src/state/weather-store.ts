import { create } from 'zustand'
import { decodeMETAR, type MetarDecoded } from '../data/logic/metar-logic'

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

async function callMetarFn(params: Record<string, string>): Promise<{ metar: string; station: string; distance_miles?: number }> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${METAR_FN}?${qs}`, { signal: AbortSignal.timeout(10_000) })
  const data = await res.json() as { error?: string; metar?: string; station?: string; distance_miles?: number }
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
  if (!data.metar || !data.station) throw new Error('No METAR data returned')
  return { metar: data.metar, station: data.station, distance_miles: data.distance_miles }
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
      set({ metar: decodeMETAR(metar), stationId: station, fetchedAt: Date.now(), fetching: false })
    } catch (err) {
      set({ fetching: false, error: err instanceof Error ? err.message : 'Fetch failed' })
    }
  },

  fetchNearest: async (lat, lon) => {
    set({ fetching: true, error: null })
    try {
      const { metar, station } = await callMetarFn({ lat: lat.toFixed(4), lon: lon.toFixed(4) })
      set({ metar: decodeMETAR(metar), stationId: station, fetchedAt: Date.now(), fetching: false })
    } catch (err) {
      set({ fetching: false, error: err instanceof Error ? err.message : 'Fetch failed' })
    }
  },
}))
