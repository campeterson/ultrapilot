import { create } from 'zustand'
import { nearestAirports, type NearbyAirport } from '../data/logic/airport-logic'
import type { Airport } from '../data/models'

interface AirportStore {
  allAirports: Airport[]
  nearby: NearbyAirport[]
  loading: boolean
  loaded: boolean

  loadDatabase: () => Promise<void>
  refreshNearby: (lat: number, lon: number) => void
}

export const useAirportStore = create<AirportStore>((set, get) => ({
  allAirports: [],
  nearby: [],
  loading: false,
  loaded: false,

  loadDatabase: async () => {
    if (get().loaded) return
    set({ loading: true })
    try {
      const res = await fetch('/data/airports.json')
      const airports = await res.json() as Airport[]
      set({ allAirports: airports, loaded: true, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  refreshNearby: (lat, lon) => {
    const { allAirports } = get()
    if (allAirports.length === 0) return
    const nearby = nearestAirports(allAirports, lat, lon, 20)
    set({ nearby })
  },
}))
