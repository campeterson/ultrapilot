// Forecast drift for a Live Group member (balloon chase): where the balloon is
// likely to be if it holds its current altitude, from its live position and the
// forecast wind. Same integration as the flight plan's drift tracks. Pure.
import type { ForecastHour, LaunchSite } from '../models'
import type { LiveFix } from './live-codec'
import { driftTrack, type DriftTrack } from './drift-logic'
import { haversineNM } from './gps-logic'

export const LIVE_DRIFT_MINUTES = [30, 60, 90] as const
export type LiveDriftMinutes = typeof LIVE_DRIFT_MINUTES[number]

/** Re-fetch winds when the balloon has moved this far from where they were fetched… */
export const REFETCH_NM = 15
/** …or they are this old. */
export const REFETCH_MS = 60 * 60_000

export interface DriftForecast {
  lat: number
  lon: number
  hours: ForecastHour[]
  fetchedAt: number
}

/** True when there is no usable forecast for this fix and the minutes ahead. */
export function needsForecast(f: DriftForecast | null, fix: LiveFix, minutes: number, now: number): boolean {
  if (!f || f.hours.length === 0) return true
  if (now - f.fetchedAt > REFETCH_MS) return true
  if (haversineNM(f.lat, f.lon, fix.lat, fix.lon) > REFETCH_NM) return true
  const last = f.hours[f.hours.length - 1].ts
  return fix.ts < f.hours[0].ts || fix.ts + minutes * 60_000 > last
}

/** Drift from the member's latest fix at its current altitude, or null (no altitude / no wind). */
export function memberDrift(f: DriftForecast, fix: LiveFix, minutes: number): DriftTrack | null {
  if (fix.altM == null) return null
  return driftTrack(f.hours, fix.lat, fix.lon, fix.ts, fix.altM * 3.28084, minutes)
}

/** The forecast parser expects a site; a fix stands in (ground from the model's terrain). */
export function siteForFix(fix: LiveFix): LaunchSite {
  return { id: 'live-drift', name: 'Live drift', lat: fix.lat, lon: fix.lon, elevFt: null, createdAt: '' }
}
