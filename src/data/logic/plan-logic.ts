// The what-if: for a site, a moment, and a set of altitudes, what is the wind
// and where does a drift take you. Pure — composes forecast + drift logic.
import type { ForecastHour, LaunchSite, PlanAltitudeMode, SiteForecast, Zone } from '../models'
import { hourAt, siteGroundFt, windAt } from './forecast-logic'
import { driftTrack, type DriftTrack } from './drift-logic'
import { zoneAt } from './zone-logic'

export const MAX_PLAN_SITES = 3

export interface PlanLevel {
  /** Index into the altitude set — drives color so levels match across sites. */
  index: number
  mslFt: number
  aglFt: number
  wind: { speedKt: number; dirFrom: number } | null
  track: DriftTrack | null
  /** MSL mode only: the shared altitude is at or below this site's ground. */
  belowGround: boolean
  /** Zone the drift ends in (most restrictive if several), or null. */
  endZone: Zone | null
}

export interface SitePlan {
  site: LaunchSite
  groundFt: number
  hour: ForecastHour | null
  levels: PlanLevel[]
}

/** Altitudes (ft) of the active set, AGL or MSL depending on mode. */
export function planAltitudes(mode: PlanAltitudeMode, aglFt: number[], mslFt: number[]): number[] {
  return mode === 'agl' ? aglFt : mslFt
}

export function buildSitePlan(
  site: LaunchSite,
  forecast: SiteForecast,
  ts: number,
  mode: PlanAltitudeMode,
  altitudesFt: number[],
  driftMinutes: number,
  zones: Zone[] = [],
): SitePlan {
  const groundFt = siteGroundFt(site, forecast) ?? forecast.modelElevFt
  const levels: PlanLevel[] = altitudesFt.map((alt, index) => {
    const mslFt = mode === 'agl' ? groundFt + alt : alt
    const aglFt = mslFt - groundFt
    const belowGround = aglFt <= 0
    if (belowGround) return { index, mslFt, aglFt, wind: null, track: null, belowGround, endZone: null }
    const track = driftTrack(forecast.hours, site.lat, site.lon, ts, mslFt, driftMinutes)
    const end = track?.coords[track.coords.length - 1]
    return {
      index,
      mslFt,
      aglFt,
      wind: windAt(forecast.hours, ts, mslFt),
      track,
      belowGround,
      endZone: end ? zoneAt(zones, end[0], end[1]) : null,
    }
  })
  return { site, groundFt, hour: hourAt(forecast.hours, ts), levels }
}

/** Parse a comma/space separated altitude list ("250, 500 1000") into whole
 *  feet, sorted, de-duplicated, at most `max`. Non-positive values dropped. */
export function parseAltitudeList(text: string, max = 4): number[] {
  const vals = text.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n) && n > 0).map(Math.round)
  return [...new Set(vals)].sort((a, b) => a - b).slice(0, max)
}

/** Validate typed coordinates. Returns an error message or null. */
export function coordinateError(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be between -90 and 90'
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return 'Longitude must be between -180 and 180'
  return null
}

/** Levels whose drift is drawn: all of them when comparing altitudes,
 *  otherwise only the cruise altitude. */
export function drawnLevels(plan: SitePlan, compare: boolean, cruiseIndex: number): PlanLevel[] {
  return compare ? plan.levels : plan.levels.filter(l => l.index === cruiseIndex)
}

/** The model returned nothing usable at this time (e.g. past its horizon). */
export function planHasNoData(plan: SitePlan): boolean {
  return plan.levels.every(l => l.belowGround || l.wind === null)
}

/** [west, south, east, north] around every site and drawn track, or null. */
export function planExtent(plans: SitePlan[], compare: boolean, cruiseIndex: number): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  const add = (lon: number, lat: number) => { w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat) }
  for (const p of plans) {
    add(p.site.lon, p.site.lat)
    for (const l of drawnLevels(p, compare, cruiseIndex)) l.track?.coords.forEach(c => add(c[0], c[1]))
  }
  return Number.isFinite(w) ? [w, s, e, n] : null
}
