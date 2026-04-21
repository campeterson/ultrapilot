import { create } from 'zustand'
import { bearing, circularEMA } from '../data/logic/gps-logic'
import type { GPSPosition } from '../data/models'

type GPSStatus = 'waiting' | 'active' | 'error' | 'denied' | 'unavailable'

// Circular EMA weight on the newest sample. Lower = smoother but more lag.
// 0.25 gives ~3-sec settling for a heading change at 1 Hz GPS updates.
const TRACK_EMA_ALPHA = 0.25
// Minimum speed (m/s) below which we don't recompute track — stationary GPS
// jitter spins bearing() wildly. 1 m/s ≈ 2 kt.
const TRACK_MIN_SPEED_MS = 1

interface GPSStore {
  status: GPSStatus
  position: GPSPosition | null
  errorMessage: string | null

  // Recent positions for VS smoothing (last 3)
  recentPositions: GPSPosition[]

  // Smoothed ground track in degrees (0..360), null until moving
  smoothedTrack: number | null

  setPosition: (pos: GPSPosition) => void
  setStatus: (status: GPSStatus, errorMessage?: string) => void
  reset: () => void
}

export const useGPSStore = create<GPSStore>((set) => ({
  status: 'waiting',
  position: null,
  errorMessage: null,
  recentPositions: [],
  smoothedTrack: null,

  setPosition: (pos) =>
    set(state => {
      const newRecent = [...state.recentPositions.slice(-2), pos]
      let smoothedTrack = state.smoothedTrack
      if (newRecent.length >= 2 && pos.speed > TRACK_MIN_SPEED_MS) {
        const prev = newRecent[newRecent.length - 2]
        const raw = bearing(prev.lat, prev.lon, pos.lat, pos.lon)
        smoothedTrack = circularEMA(state.smoothedTrack, raw, TRACK_EMA_ALPHA)
      }
      return {
        position: pos,
        status: 'active',
        recentPositions: newRecent,
        smoothedTrack,
      }
    }),

  setStatus: (status, errorMessage) =>
    set({ status, errorMessage: errorMessage ?? null }),

  reset: () =>
    set({ status: 'waiting', position: null, errorMessage: null, recentPositions: [], smoothedTrack: null }),
}))
