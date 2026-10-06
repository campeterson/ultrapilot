// Display-unit conversion and formatting. Values are stored and computed in
// ft / kt / nm / fpm everywhere; convert only at the moment of display.
import type { AltitudeUnit, DistanceUnit, SpeedUnit, UnitPrefs, VerticalSpeedUnit } from '../models'

export const AVIATION_UNITS: UnitPrefs = { altitude: 'ft', speed: 'kt', distance: 'nm', vertical: 'fpm' }
export const METRIC_UNITS: UnitPrefs = { altitude: 'm', speed: 'kmh', distance: 'km', vertical: 'ms' }

const FT_TO_M = 0.3048
const KT_TO_MPH = 1.150779
const KT_TO_KMH = 1.852
const KT_TO_MS = 0.514444
const NM_TO_SM = 1.150779
const NM_TO_KM = 1.852
const FPM_TO_MS = 0.00508

export const ALTITUDE_LABELS: Record<AltitudeUnit, string> = { ft: 'ft', m: 'm' }
export const SPEED_LABELS: Record<SpeedUnit, string> = { kt: 'kt', mph: 'mph', kmh: 'km/h', ms: 'm/s' }
export const DISTANCE_LABELS: Record<DistanceUnit, string> = { nm: 'nm', sm: 'sm', km: 'km' }
export const VERTICAL_LABELS: Record<VerticalSpeedUnit, string> = { fpm: 'fpm', ms: 'm/s' }

export function convertAltitude(ft: number, unit: AltitudeUnit): number {
  return unit === 'm' ? ft * FT_TO_M : ft
}

/** Inverse of convertAltitude — a display-unit altitude back to feet. */
export function altitudeToFeet(value: number, unit: AltitudeUnit): number {
  return unit === 'm' ? value / FT_TO_M : value
}

export function convertSpeed(kts: number, unit: SpeedUnit): number {
  switch (unit) {
    case 'mph': return kts * KT_TO_MPH
    case 'kmh': return kts * KT_TO_KMH
    case 'ms': return kts * KT_TO_MS
    default: return kts
  }
}

export function convertDistance(nm: number, unit: DistanceUnit): number {
  if (unit === 'sm') return nm * NM_TO_SM
  if (unit === 'km') return nm * NM_TO_KM
  return nm
}

export function convertVerticalSpeed(fpm: number, unit: VerticalSpeedUnit): number {
  return unit === 'ms' ? fpm * FPM_TO_MS : fpm
}

/** Altitude number only, whole units. */
export function formatAltitude(ft: number, unit: AltitudeUnit): string {
  return Math.round(convertAltitude(ft, unit)).toString()
}

/** Speed number only. m/s gets a decimal — whole m/s is too coarse. */
export function formatSpeed(kts: number, unit: SpeedUnit): string {
  const v = convertSpeed(kts, unit)
  return unit === 'ms' ? v.toFixed(1) : Math.round(v).toString()
}

/** Distance number only, `decimals` places (1 for distances, 2 for XTK). */
export function formatDistance(nm: number, unit: DistanceUnit, decimals = 1): string {
  return convertDistance(nm, unit).toFixed(decimals)
}

/** Signed climb rate: "+300" fpm or "+1.5" m/s. */
export function formatVerticalSpeed(fpm: number, unit: VerticalSpeedUnit): string {
  const v = convertVerticalSpeed(fpm, unit)
  const text = unit === 'ms' ? v.toFixed(1) : Math.round(v).toString()
  const n = Number(text)
  if (n === 0) return unit === 'ms' ? '0.0' : '0'   // no "-0"
  return n > 0 ? `+${text}` : text
}

/** Map distance-ring radii (meters) at round values in the display unit:
 *  0.5 / 1 / 2 nm or sm, 1 / 2 / 4 km. */
export function distanceRingRadiiM(unit: DistanceUnit): number[] {
  if (unit === 'km') return [1000, 2000, 4000]
  const unitM = unit === 'sm' ? 1609.344 : 1852
  return [0.5, 1, 2].map(n => n * unitM)
}

/** Number + unit label, for inline text ("1,250 ft", "12.4 km"). */
export function altitudeText(ft: number, unit: AltitudeUnit): string {
  return `${Math.round(convertAltitude(ft, unit)).toLocaleString()} ${ALTITUDE_LABELS[unit]}`
}
export function speedText(kts: number, unit: SpeedUnit): string {
  return `${formatSpeed(kts, unit)} ${SPEED_LABELS[unit]}`
}
export function distanceText(nm: number, unit: DistanceUnit): string {
  return `${formatDistance(nm, unit)} ${DISTANCE_LABELS[unit]}`
}
export function verticalSpeedText(fpm: number, unit: VerticalSpeedUnit): string {
  return `${formatVerticalSpeed(fpm, unit)} ${VERTICAL_LABELS[unit]}`
}
