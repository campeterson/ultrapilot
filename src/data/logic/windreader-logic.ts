import type { WindreaderSample, WindBand, WindreaderUnits } from '../models'
import { haversineNM, bearing, metersToFeet } from './gps-logic'

/** Samples kept per altitude band — matches Balloon Navigator's "last 20". */
export const WINDREADER_SAMPLES_PER_BAND = 20

/** Sampling interval. Displacement over ≥5 s is well above GPS position
 *  jitter even at 1–2 kt drift, which 1 Hz fix-to-fix bearings are not. */
export const WINDREADER_MIN_INTERVAL_MS = 5_000
/** Gaps longer than this (GPS dropout, app backgrounded) don't make a sample. */
export const WINDREADER_MAX_INTERVAL_MS = 30_000

/** Below this the track direction is noise; the sample is kept as calm (0 kt). */
const CALM_KTS = 0.3

export interface WindreaderFix {
  lat: number
  lon: number
  altMSL: number  // meters
  ts: number
}

/** Build a drift sample from two fixes, or null if the interval is unusable. */
export function makeSample(prev: WindreaderFix, cur: WindreaderFix): WindreaderSample | null {
  const dt = cur.ts - prev.ts
  if (dt < WINDREADER_MIN_INTERVAL_MS || dt > WINDREADER_MAX_INTERVAL_MS) return null
  const distNM = haversineNM(prev.lat, prev.lon, cur.lat, cur.lon)
  const speedKts = distNM / (dt / 3_600_000)
  const calm = speedKts < CALM_KTS
  return {
    ts: cur.ts,
    altMSLft: metersToFeet((prev.altMSL + cur.altMSL) / 2),
    trackDeg: calm ? 0 : bearing(prev.lat, prev.lon, cur.lat, cur.lon),
    speedKts: calm ? 0 : speedKts,
  }
}

export function bandOf(altMSLft: number, bandFt: number): number {
  return Math.round(altMSLft / bandFt) * bandFt
}

/** Append a sample, then trim each band to its newest `perBand` samples. */
export function addSample(
  samples: WindreaderSample[],
  sample: WindreaderSample,
  bandFt: number,
  perBand = WINDREADER_SAMPLES_PER_BAND,
): WindreaderSample[] {
  const band = bandOf(sample.altMSLft, bandFt)
  const inBand = samples.filter(s => bandOf(s.altMSLft, bandFt) === band)
  if (inBand.length < perBand) return [...samples, sample]
  const drop = new Set(inBand.slice(0, inBand.length - perBand + 1))
  return [...samples.filter(s => !drop.has(s)), sample]
}

/** Group samples into altitude bands and vector-average each band.
 *  Sorted high → low. The band nearest the current altitude is 'current'. */
export function computeBands(
  samples: WindreaderSample[],
  bandFt: number,
  currentAltMSLft: number | null,
  perBand = WINDREADER_SAMPLES_PER_BAND,
): WindBand[] {
  const groups = new Map<number, WindreaderSample[]>()
  for (const s of samples) {
    const b = bandOf(s.altMSLft, bandFt)
    const g = groups.get(b)
    if (g) g.push(s)
    else groups.set(b, [s])
  }

  const bands: Omit<WindBand, 'relation'>[] = []
  for (const [alt, group] of groups) {
    const recent = group.slice(-perBand)
    // Vector average: east/north components of each drift vector
    let e = 0, n = 0
    for (const s of recent) {
      const r = (s.trackDeg * Math.PI) / 180
      e += s.speedKts * Math.sin(r)
      n += s.speedKts * Math.cos(r)
    }
    e /= recent.length
    n /= recent.length
    const speedKts = Math.hypot(e, n)
    const trackDeg = speedKts < CALM_KTS ? 0 : ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360
    bands.push({
      altMSLft: alt,
      trackDeg,
      speedKts: speedKts < CALM_KTS ? 0 : speedKts,
      count: recent.length,
      lastTs: recent[recent.length - 1].ts,
    })
  }

  bands.sort((a, b) => b.altMSLft - a.altMSLft)

  let currentIdx = -1
  if (currentAltMSLft !== null && bands.length > 0) {
    let best = Infinity
    bands.forEach((b, i) => {
      const d = Math.abs(b.altMSLft - currentAltMSLft)
      if (d < best) { best = d; currentIdx = i }
    })
  }

  return bands.map((b, i) => ({
    ...b,
    relation: i === currentIdx ? 'current' : currentAltMSLft !== null && b.altMSLft > currentAltMSLft ? 'above' : 'below',
  }))
}

export function convertSpeed(kts: number, units: WindreaderUnits): number {
  if (units === 'mph') return kts * 1.150779
  if (units === 'kmh') return kts * 1.852
  return kts
}

export const WINDREADER_UNIT_LABELS: Record<WindreaderUnits, string> = {
  kt: 'kt',
  mph: 'mph',
  kmh: 'km/h',
}

/** Whole minutes since a band's newest sample. */
export function ageMinutes(lastTs: number, nowTs: number): number {
  return Math.max(0, Math.floor((nowTs - lastTs) / 60_000))
}

/** Distance (nm) covered in `minutes` at `speedKts` — the length of a map wind line. */
export function windLineLengthNM(speedKts: number, minutes: number): number {
  return speedKts * (minutes / 60)
}

/** Wind at the current altitude from the windreader, as a meteorological
 *  "wind FROM" direction (drift track + 180°) — feeds the WIND instruments in LTA. */
export function windAtCurrentLevel(bands: WindBand[]): { dirDeg: number; speedKts: number } | null {
  const cur = bands.find(b => b.relation === 'current')
  if (!cur) return null
  return { dirDeg: (cur.trackDeg + 180) % 360, speedKts: cur.speedKts }
}
