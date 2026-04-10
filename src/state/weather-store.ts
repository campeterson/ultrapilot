import { create } from 'zustand'
import { decodeMETAR, type MetarDecoded } from '../data/logic/metar-logic'

interface WeatherStore {
  stationId: string
  metar: MetarDecoded | null
  fetchedAt: number | null
  fetching: boolean
  error: string | null

  setStation: (id: string) => void
  fetchMETAR: (stationId: string) => Promise<void>
}

export const useWeatherStore = create<WeatherStore>((set) => ({
  stationId: '',
  metar: null,
  fetchedAt: null,
  fetching: false,
  error: null,

  setStation: (id) => set({ stationId: id.toUpperCase() }),

  fetchMETAR: async (stationId) => {
    set({ fetching: true, error: null })
    try {
      const url = `https://aviationweather.gov/api/data/metar?ids=${stationId.toUpperCase()}&format=json`
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { rawOb?: string }[]
      if (!data.length || !data[0].rawOb) throw new Error('No METAR data')
      const decoded = decodeMETAR(data[0].rawOb)
      set({ metar: decoded, fetchedAt: Date.now(), fetching: false, stationId: stationId.toUpperCase() })
    } catch (err) {
      set({ fetching: false, error: err instanceof Error ? err.message : 'Fetch failed' })
    }
  },
}))
