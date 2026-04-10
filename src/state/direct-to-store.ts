import { create } from 'zustand'

export interface DirectToTarget {
  lat: number
  lon: number
  name: string
  fromLat: number  // position when D→ was activated (XTK reference start)
  fromLon: number
}

interface DirectToStore {
  target: DirectToTarget | null
  setTarget: (target: DirectToTarget) => void
  clearTarget: () => void
}

export const useDirectToStore = create<DirectToStore>((set) => ({
  target: null,
  setTarget: (target) => set({ target }),
  clearTarget: () => set({ target: null }),
}))
