// Drift tracks: where you end up holding one altitude with zero airspeed of
// your own — a balloon, or a PPC with the engine at idle. Integrates the
// forecast wind minute by minute, so a wind that changes through the hour
// (or a track that runs into the next hour) bends the path. Pure.
import type { ForecastHour } from '../models'
import { windVecAt } from './forecast-logic'
import { bearing, destinationPoint, haversineNM } from './gps-logic'

export const DRIFT_MINUTES_OPTIONS = [30, 60, 90, 120] as const
export type DriftMinutes = typeof DRIFT_MINUTES_OPTIONS[number]

/** Time marks along a track, every this many minutes. */
export const DRIFT_TICK_MIN = 15
const STEP_MIN = 1

export interface DriftTick {
  minutes: number
  lat: number
  lon: number
}

export interface DriftTrack {
  mslFt: number
  /** [lon, lat] pairs, launch first — ready for GeoJSON. */
  coords: [number, number][]
  ticks: DriftTick[]
  /** Straight-line launch → end. */
  distNM: number
  bearingDeg: number
  /** Minutes actually integrated; short when the wind data ran out. */
  minutes: number
}

/**
 * Integrate a constant-altitude drift from (lat, lon) starting at startTs.
 * Returns null when there is no wind at that height at launch.
 */
export function driftTrack(
  hours: ForecastHour[],
  lat: number,
  lon: number,
  startTs: number,
  mslFt: number,
  minutes: number,
): DriftTrack | null {
  if (!windVecAt(hours, startTs, mslFt)) return null
  const coords: [number, number][] = [[lon, lat]]
  const ticks: DriftTick[] = []
  let cur: [number, number] = [lat, lon]
  let done = 0
  for (let m = 0; m < minutes; m += STEP_MIN) {
    // Midpoint wind in time for the step (cheap second-order accuracy)
    const v = windVecAt(hours, startTs + (m + STEP_MIN / 2) * 60_000, mslFt)
    if (!v) break
    const speed = Math.hypot(v.x, v.y)
    if (speed > 0.05) {
      const to = ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360
      cur = destinationPoint(cur[0], cur[1], to, speed * (STEP_MIN / 60))
    }
    done = m + STEP_MIN
    coords.push([cur[1], cur[0]])
    if (done % DRIFT_TICK_MIN === 0) ticks.push({ minutes: done, lat: cur[0], lon: cur[1] })
  }
  return {
    mslFt,
    coords,
    ticks,
    distNM: haversineNM(lat, lon, cur[0], cur[1]),
    bearingDeg: bearing(lat, lon, cur[0], cur[1]),
    minutes: done,
  }
}
