import { create } from 'zustand'
import type { GPSPosition } from '../data/models'

type GPSStatus = 'waiting' | 'active' | 'error' | 'denied' | 'unavailable'

interface GPSStore {
  status: GPSStatus
  position: GPSPosition | null
  errorMessage: string | null

  // Recent positions for VS smoothing (last 3)
  recentPositions: GPSPosition[]

  setPosition: (pos: GPSPosition) => void
  setStatus: (status: GPSStatus, errorMessage?: string) => void
  reset: () => void
}

export const useGPSStore = create<GPSStore>((set) => ({
  status: 'waiting',
  position: null,
  errorMessage: null,
  recentPositions: [],

  setPosition: (pos) =>
    set(state => ({
      position: pos,
      status: 'active',
      recentPositions: [...state.recentPositions.slice(-2), pos],
    })),

  setStatus: (status, errorMessage) =>
    set({ status, errorMessage: errorMessage ?? null }),

  reset: () =>
    set({ status: 'waiting', position: null, errorMessage: null, recentPositions: [] }),
}))
