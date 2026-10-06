import type { WindreaderSample, WindBand, WindreaderUnits } from '../models'
import { haversineNM, bearing, metersToFeet } from './gps-logic'

/** Samples kept per altitude band — matches Balloon Navigator's "last 20". */
export const WINDREADER_SAMPLES_PER_BAND = 20

/** A reading is only recorded once a level has been held this long —
 *  climbing or descending through a level blends several levels' winds. */
export const WINDREADER_HOLD_MS = 15_000
/** While holding, a new reading (over the trailing hold window) every step.
 *  The window is also split into pieces of at least this length for the
 *  steadiness checks — well above GPS position jitter even at 1–2 kt. */
export const WINDREADER_STEP_MS = 5_000
/** A gap between fixes longer than this (GPS dropout, app backgrounded)
 *  restarts the hold. */
export const WINDREADER_MAX_GAP_MS = 15_000

/** Highest minus lowest altitude allowed across the hold window. */
const HOLD_MAX_ALT_SPREAD_FT = 50
/** Overall drift speed ÷ mean piece speed. 1 = every piece in the same
 *  direction; 0.9 ≈ ±25° of spread. */
const HOLD_MIN_DIRECTION_STEADINESS = 0.9
/** Each piece's speed must be within the larger of these of the mean. */
const HOLD_SPEED_TOL_KTS = 1.5
const HOLD_SPEED_TOL_FRAC = 0.3
/** Below this, GPS jitter makes direction random — only speed is checked,
 *  so calm layers still get recorded. */
const LIGHT_KTS = 1.5

/** Below this the track direction is noise; the sample is kept as calm (0 kt). */
const CALM_KTS = 0.3

export interface WindreaderFix {
  lat: number
  lon: number
  altMSL: number  // meters
  ts: number
}

function driftKts(a: WindreaderFix, b: WindreaderFix): number {
  return haversineNM(a.lat, a.lon, b.lat, b.lon) / ((b.ts - a.ts) / 3_600_000)
}

/** Add a fix to the rolling hold buffer. Out-of-order fixes and dropouts
 *  restart the buffer; fixes older than one hold window (plus a gap) are dropped. */
export function pushFix(fixes: WindreaderFix[], fix: WindreaderFix): WindreaderFix[] {
  const last = fixes[fixes.length - 1]
  if (!last || fix.ts <= last.ts || fix.ts - last.ts > WINDREADER_MAX_GAP_MS) return [fix]
  const cutoff = fix.ts - WINDREADER_HOLD_MS - WINDREADER_MAX_GAP_MS
  return [...fixes.filter(f => f.ts >= cutoff), fix]
}

/** A drift reading over the last WINDREADER_HOLD_MS of fixes, or null unless
 *  the level was held (altitude spread ≤ 50 ft) with steady drift direction
 *  and speed throughout. Fixes must be sorted and gap-free (see pushFix). */
export function holdSample(fixes: WindreaderFix[]): WindreaderSample | null {
  const cur = fixes[fixes.length - 1]
  if (!cur) return null
  let startIdx = -1
  for (let i = fixes.length - 1; i >= 0; i--) {
    if (fixes[i].ts <= cur.ts - WINDREADER_HOLD_MS) { startIdx = i; break }
  }
  if (startIdx < 0) return null
  const window = fixes.slice(startIdx)

  // Altitude held
  const altsFt = window.map(f => metersToFeet(f.altMSL))
  if (Math.max(...altsFt) - Math.min(...altsFt) > HOLD_MAX_ALT_SPREAD_FT) return null

  // Split into ≥ step-long pieces for the steadiness checks
  const pieceSpeeds: number[] = []
  let anchor = window[0]
  for (const f of window) {
    if (f.ts - anchor.ts >= WINDREADER_STEP_MS) { pieceSpeeds.push(driftKts(anchor, f)); anchor = f }
  }
  if (pieceSpeeds.length < 2) return null

  const start = window[0]
  const speedKts = driftKts(start, cur)
  const meanPieceKts = pieceSpeeds.reduce((a, b) => a + b, 0) / pieceSpeeds.length
  const tol = Math.max(HOLD_SPEED_TOL_KTS, meanPieceKts * HOLD_SPEED_TOL_FRAC)
  if (pieceSpeeds.some(v => Math.abs(v - meanPieceKts) > tol)) return null
  if (meanPieceKts >= LIGHT_KTS && speedKts / meanPieceKts < HOLD_MIN_DIRECTION_STEADINESS) return null

  const calm = speedKts < CALM_KTS
  return {
    ts: cur.ts,
    altMSLft: altsFt.reduce((a, b) => a + b, 0) / altsFt.length,
    trackDeg: calm ? 0 : bearing(start.lat, start.lon, cur.lat, cur.lon),
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
    relation: currentAltMSLft === null ? 'none' : i === currentIdx ? 'current' : b.altMSLft > currentAltMSLft ? 'above' : 'below',
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

/** Rebuild windreader samples from a recorded track (for replay), with the
 *  same hold rules as live sampling. Sorted by ts. */
export function buildWindSamples(fixes: WindreaderFix[]): WindreaderSample[] {
  const out: WindreaderSample[] = []
  let buffer: WindreaderFix[] = []
  let lastSampleTs = -Infinity
  for (const fix of fixes) {
    buffer = pushFix(buffer, fix)
    if (buffer.length === 1) lastSampleTs = -Infinity
    if (fix.ts - lastSampleTs < WINDREADER_STEP_MS) continue
    const sample = holdSample(buffer)
    if (sample) { out.push(sample); lastSampleTs = fix.ts }
  }
  return out
}

/** Samples recorded at or before t (samples sorted by ts). */
export function samplesUpTo(samples: WindreaderSample[], t: number): WindreaderSample[] {
  let lo = 0, hi = samples.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].ts <= t) lo = mid + 1
    else hi = mid
  }
  return samples.slice(0, lo)
}
