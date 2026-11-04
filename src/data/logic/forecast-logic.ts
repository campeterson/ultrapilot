// Planning forecasts: Open-Meteo request building, response parsing, and wind
// interpolation in height and time. Pure — no fetch, no DOM.
//
// The height handling follows low-and-slow-wx's windProfile.js: the surface
// band (10/80/120/180 m) is already AGL, the pressure levels come with a
// geopotential height that is already MSL. Both are put on one MSL axis so a
// fixed AGL above each site and a shared MSL altitude are the same lookup.
import type { ForecastHour, ForecastLevel, LaunchSite, SiteForecast } from '../models'
import { metersToFeet } from './gps-logic'

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

const HEIGHT_LEVELS_M = [10, 80, 120, 180]
const PRESSURE_LEVELS_HPA = [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 700, 650, 600]

// ─── Models ──────────────────────────────────────────────────────────────────

export interface ForecastModel {
  id: string
  label: string
  note: string
}

/** Open-Meteo model ids. "best_match" lets Open-Meteo blend the best
 *  regional model for the location (HRRR + GFS in the US). */
export const FORECAST_MODELS: ForecastModel[] = [
  { id: 'best_match',     label: 'Best match',  note: 'Open-Meteo picks the best model for the location' },
  { id: 'ncep_hrrr_conus', label: 'HRRR',       note: 'NOAA 3 km, US only, ~18 h ahead' },
  { id: 'gfs_seamless',   label: 'GFS',         note: 'NOAA global, blends HRRR for the first hours' },
  { id: 'ecmwf_ifs025',   label: 'ECMWF IFS',   note: 'European global, 25 km' },
  { id: 'icon_seamless',  label: 'ICON',        note: 'DWD global + regional' },
  { id: 'gem_seamless',   label: 'GEM',         note: 'Canadian global + regional' },
]

export function modelLabel(id: string): string {
  return FORECAST_MODELS.find(m => m.id === id)?.label ?? id
}

// ─── Plan time ───────────────────────────────────────────────────────────────

/** The hour slots around the chosen time: one back, two forward. */
export const SLOT_OFFSETS = [-1, 0, 1, 2] as const

/** Default plan date: tomorrow, device local, as YYYY-MM-DD. */
export function tomorrowDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return localDateString(d)
}

export function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Epoch ms of `hour`:00 on `date` (YYYY-MM-DD), device local time. */
export function planBaseTs(date: string, hour: number): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour).getTime()
}

/** Epoch ms of a slot: the base time plus whole hours. */
export function slotTs(baseTs: number, offset: number): number {
  return baseTs + offset * 3_600_000
}

/** "7 AM" style label for an epoch ms, device local. */
export function hourLabel(ts: number): string {
  const h = new Date(ts).getHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`
}

// ─── Altitudes ───────────────────────────────────────────────────────────────

export const DEFAULT_AGL_FT = [250, 500, 1000, 1500]

/** A starting MSL set that works for every chosen site: the highest ground
 *  plus the AGL ladder, rounded up to the next 100 ft. */
export function defaultMslLevels(groundFts: number[]): number[] {
  const top = groundFts.length ? Math.max(...groundFts) : 0
  return DEFAULT_AGL_FT.map(a => Math.ceil((top + a) / 100) * 100)
}

/** Ground elevation used for a site: its own, else the model's terrain. */
export function siteGroundFt(site: LaunchSite, forecast: SiteForecast | undefined): number | null {
  return site.elevFt ?? forecast?.modelElevFt ?? null
}

// ─── Request ─────────────────────────────────────────────────────────────────

/** Hours on either side of the base time the request covers: the slot range
 *  (−1 … +2) plus room for a drift of up to two hours from the last slot. */
const FETCH_HOURS_BEFORE = 2
const FETCH_HOURS_AFTER = 5

function utcHourIso(ts: number): string {
  return new Date(ts).toISOString().slice(0, 13) + ':00'
}

/** One request for every site — Open-Meteo takes comma-separated coordinates
 *  and returns an array of results in the same order. */
export function buildForecastUrl(sites: { lat: number; lon: number }[], model: string, baseTs: number): string {
  const hourly = [
    ...HEIGHT_LEVELS_M.flatMap(h => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
    ...PRESSURE_LEVELS_HPA.flatMap(p => [`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`]),
    'wind_gusts_10m',
    'precipitation_probability',
  ]
  const params = new URLSearchParams({
    latitude: sites.map(s => s.lat.toFixed(4)).join(','),
    longitude: sites.map(s => s.lon.toFixed(4)).join(','),
    hourly: hourly.join(','),
    wind_speed_unit: 'kn',
    timezone: 'GMT',
    timeformat: 'unixtime',
    start_hour: utcHourIso(baseTs - FETCH_HOURS_BEFORE * 3_600_000),
    end_hour: utcHourIso(baseTs + FETCH_HOURS_AFTER * 3_600_000),
    cell_selection: 'land',
  })
  if (model !== 'best_match') params.set('models', model)
  return `${OPEN_METEO_URL}?${params.toString()}`
}

// ─── Parse ───────────────────────────────────────────────────────────────────

interface OpenMeteoResult {
  elevation?: number
  hourly?: Record<string, (number | null)[]>
  error?: boolean
  reason?: string
}

/** Normalise the one-or-many response shape and surface API errors. */
export function forecastResults(json: unknown): OpenMeteoResult[] {
  const obj = json as OpenMeteoResult
  if (obj && !Array.isArray(json) && obj.error) throw new Error(obj.reason ?? 'Forecast request rejected')
  return Array.isArray(json) ? (json as OpenMeteoResult[]) : [obj]
}

const num = (v: number | null | undefined): number | null =>
  v == null || Number.isNaN(v) ? null : v

/** One Open-Meteo result → hourly soundings on an MSL axis. */
export function parseSiteForecast(
  result: OpenMeteoResult,
  site: LaunchSite,
  model: string,
  fetchedAt: number,
): SiteForecast {
  const hourly = result.hourly
  if (!hourly || !Array.isArray(hourly.time)) throw new Error('Forecast response missing hourly data')
  const modelElevFt = metersToFeet(result.elevation ?? 0)
  const groundFt = site.elevFt ?? modelElevFt
  const at = (key: string, i: number) => num(hourly[key]?.[i])

  const hours: ForecastHour[] = hourly.time.map((t, i) => {
    const levels: ForecastLevel[] = []
    for (const h of HEIGHT_LEVELS_M) {
      const speedKt = at(`wind_speed_${h}m`, i)
      const dirFrom = at(`wind_direction_${h}m`, i)
      if (speedKt == null || dirFrom == null) continue
      levels.push({ mslFt: groundFt + metersToFeet(h), speedKt, dirFrom })
    }
    for (const p of PRESSURE_LEVELS_HPA) {
      const ghM = at(`geopotential_height_${p}hPa`, i)
      const speedKt = at(`wind_speed_${p}hPa`, i)
      const dirFrom = at(`wind_direction_${p}hPa`, i)
      if (ghM == null || speedKt == null || dirFrom == null) continue
      const mslFt = metersToFeet(ghM)
      if (mslFt <= groundFt) continue   // level is underground here
      levels.push({ mslFt, speedKt, dirFrom })
    }
    levels.sort((a, b) => a.mslFt - b.mslFt)
    return {
      ts: (t as number) * 1000,
      levels,
      surfaceSpeedKt: at('wind_speed_10m', i),
      surfaceDirFrom: at('wind_direction_10m', i),
      gustKt: at('wind_gusts_10m', i),
      precipProb: at('precipitation_probability', i),
    }
  })
  return { siteId: site.id, model, modelElevFt, hours, fetchedAt }
}

// ─── Wind lookup ─────────────────────────────────────────────────────────────

/** Wind as a vector the air moves TOWARD, knots. x = east, y = north. */
interface Vec { x: number; y: number }

function toVec(speedKt: number, dirFrom: number): Vec {
  const to = ((dirFrom + 180) * Math.PI) / 180
  return { x: speedKt * Math.sin(to), y: speedKt * Math.cos(to) }
}

function fromVec(v: Vec): { speedKt: number; dirFrom: number } {
  const speedKt = Math.hypot(v.x, v.y)
  const to = (Math.atan2(v.x, v.y) * 180) / Math.PI
  return { speedKt, dirFrom: (((to + 180) % 360) + 360) % 360 }
}

const lerpVec = (a: Vec, b: Vec, f: number): Vec => ({ x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) })

/** Wind vector at an MSL height within one hour. Interpolated by components
 *  (so a veer through calm shrinks the wind rather than spinning it). Below
 *  the lowest level holds that level; above the highest returns null. */
function vecAtHeight(hour: ForecastHour, mslFt: number): Vec | null {
  const lv = hour.levels
  if (!lv.length) return null
  if (mslFt <= lv[0].mslFt) return toVec(lv[0].speedKt, lv[0].dirFrom)
  if (mslFt > lv[lv.length - 1].mslFt) return null
  for (let i = 0; i < lv.length - 1; i++) {
    const lo = lv[i], hi = lv[i + 1]
    if (mslFt >= lo.mslFt && mslFt <= hi.mslFt) {
      const span = hi.mslFt - lo.mslFt
      const f = span > 0 ? (mslFt - lo.mslFt) / span : 0
      return lerpVec(toVec(lo.speedKt, lo.dirFrom), toVec(hi.speedKt, hi.dirFrom), f)
    }
  }
  return null
}

/** Index of the hour at or before ts, and the fraction toward the next. */
function bracket(hours: ForecastHour[], ts: number): { i0: number; i1: number; f: number; beyond: boolean } | null {
  if (!hours.length) return null
  if (ts <= hours[0].ts) return { i0: 0, i1: 0, f: 0, beyond: ts < hours[0].ts }
  const last = hours.length - 1
  if (ts >= hours[last].ts) return { i0: last, i1: last, f: 0, beyond: ts > hours[last].ts }
  for (let i = 0; i < last; i++) {
    if (ts >= hours[i].ts && ts < hours[i + 1].ts) {
      return { i0: i, i1: i + 1, f: (ts - hours[i].ts) / (hours[i + 1].ts - hours[i].ts), beyond: false }
    }
  }
  return null
}

function vecAt(hours: ForecastHour[], ts: number, mslFt: number): Vec | null {
  const b = bracket(hours, ts)
  if (!b) return null
  const a = vecAtHeight(hours[b.i0], mslFt)
  const c = vecAtHeight(hours[b.i1], mslFt)
  if (!a || !c) return a ?? c
  return lerpVec(a, c, b.f)
}

/** Wind (from-direction and speed) at an MSL height and instant, blended
 *  linearly between the bracketing hours. null when no data reaches it. */
export function windAt(hours: ForecastHour[], ts: number, mslFt: number): { speedKt: number; dirFrom: number } | null {
  const v = vecAt(hours, ts, mslFt)
  return v ? fromVec(v) : null
}

/** The hour record for exactly `ts` (top of an hour), if fetched. */
export function hourAt(hours: ForecastHour[], ts: number): ForecastHour | null {
  return hours.find(h => h.ts === ts) ?? null
}

/** True when every slot hour is inside the fetched data — false means the
 *  plan time moved and the forecast should be refetched. */
export function coversSlots(f: SiteForecast, baseTs: number): boolean {
  return SLOT_OFFSETS.every(o => hourAt(f.hours, slotTs(baseTs, o)) !== null)
}

// Exported for drift-logic, which integrates through the same lookup.
export { vecAt as windVecAt }

/** A stored forecast still answers the plan: same model, and it holds every slot hour. */
export function isForecastCurrent(f: SiteForecast | undefined, model: string, baseTs: number): boolean {
  return !!f && f.model === model && coversSlots(f, baseTs)
}
