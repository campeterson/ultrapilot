import type { FlightMode, InstrumentId, UnitPrefs } from '../models'
import { haversineNM, bearing, computeAGLft, msToKnots, metersToFeet, formatDeg, crossTrackErrorNM, estimatedTimeEnrouteMin, estimateWind, type WindSample } from './gps-logic'
import {
  formatAltitude, formatDistance, formatSpeed, formatVerticalSpeed,
  ALTITUDE_LABELS, DISTANCE_LABELS, SPEED_LABELS, VERTICAL_LABELS,
} from './units-logic'

export interface DirectToTarget {
  lat: number
  lon: number
  fromLat: number  // position when D→ was activated (for XTK reference track)
  fromLon: number
}

export interface InstrumentValues {
  gs: number        // knots
  agl: number       // feet
  msl: number       // feet
  vs: number        // fpm
  hdg: number       // degrees
  dist: number      // nm
  brg: number       // degrees
  etime: number     // ms (elapsed flight time)
  sess: number      // ms (elapsed session time)
  tod: number       // ms (unix timestamp of position fix)
  maxalt: number    // feet (max AGL this session)
  avgs: number      // knots (rolling avg)
  avgvs: number     // fpm (rolling avg)
  wdir: number | null  // degrees (wind from; null when unresolvable)
  wspd: number | null  // knots
  dtk: number | null   // degrees (null when no direct-to)
  dte: number | null   // nm
  xtk: number | null   // nm (signed)
  ete: number | null   // minutes
}

export interface RollingStats {
  avgGSKts: number
  avgVSFpm: number
  windSamples: WindSample[]
}

export interface RawPosition {
  lat: number
  lon: number
  altMSL: number   // meters
  speed: number    // m/s
  heading: number  // degrees
  ts: number       // unix ms
}

/** Derive instrument values from current GPS position + session context */
export function deriveInstruments(
  pos: RawPosition,
  originLat: number,
  originLon: number,
  originAltMSLm: number,
  vsFpm: number,
  sessionStartMs: number,
  flightStartMs: number | null,
  maxAGLft: number,
  rolling: RollingStats,
  directTo?: DirectToTarget | null,
): InstrumentValues {
  const agl = computeAGLft(pos.altMSL, originAltMSLm)
  const gs = msToKnots(pos.speed)

  let dtk: number | null = null
  let dte: number | null = null
  let xtk: number | null = null
  let ete: number | null = null

  if (directTo) {
    dtk = bearing(pos.lat, pos.lon, directTo.lat, directTo.lon)
    dte = haversineNM(pos.lat, pos.lon, directTo.lat, directTo.lon)
    xtk = crossTrackErrorNM(pos.lat, pos.lon, directTo.fromLat, directTo.fromLon, directTo.lat, directTo.lon)
    ete = estimatedTimeEnrouteMin(dte, gs)
  }

  const wind = estimateWind(rolling.windSamples)

  return {
    gs,
    agl,
    msl: metersToFeet(pos.altMSL),
    vs: vsFpm,
    hdg: pos.heading,
    dist: haversineNM(pos.lat, pos.lon, originLat, originLon),
    brg: bearing(pos.lat, pos.lon, originLat, originLon),
    etime: flightStartMs !== null ? pos.ts - flightStartMs : 0,
    sess: pos.ts - sessionStartMs,
    tod: pos.ts,
    maxalt: Math.max(maxAGLft, agl),
    avgs: rolling.avgGSKts,
    avgvs: rolling.avgVSFpm,
    wdir: wind ? wind.dirDeg : null,
    wspd: wind ? wind.speedKts : null,
    dtk,
    dte,
    xtk,
    ete,
  }
}

// Color constants — must stay in sync with theme.ts
const CREAM  = '#FDF6E3'
const GREEN  = '#27ae60'
const AMBER  = '#e67e22'
const RED    = '#C0392B'

/** Course-flying instruments a balloon can't use — hidden in LTA mode. */
const HIDDEN_IN_MODE: Record<FlightMode, InstrumentId[]> = {
  powered: [],
  lta: ['hsi', 'xtk', 'ete'],
}

export function isInstrumentAvailable(id: InstrumentId, mode: FlightMode): boolean {
  return !HIDDEN_IN_MODE[mode].includes(id)
}

/** Return a color string for an instrument value based on aviation-standard ranges.
 *  Returns cream (normal) for instruments with no meaningful range coloring. */
export function getInstrumentColor(id: InstrumentId, values: InstrumentValues, mode: FlightMode = 'powered'): string {
  if (mode === 'lta') return getLTAColor(id, values)
  switch (id) {
    case 'agl': {
      const v = values.agl
      if (v < 50)  return RED
      if (v < 150) return AMBER
      return CREAM
    }
    case 'vs': {
      const v = values.vs
      if (v < -1200) return RED
      if (v < -500)  return AMBER
      if (v > 200)   return GREEN
      return CREAM
    }
    case 'gs': {
      const v = values.gs
      if (v > 45) return RED
      if (v > 30) return AMBER
      return CREAM
    }
    case 'xtk': {
      if (values.xtk === null) return CREAM
      const v = Math.abs(values.xtk)
      if (v > 0.3) return RED
      if (v > 0.1) return AMBER
      return CREAM
    }
    case 'dte': {
      if (values.dte === null) return CREAM
      if (values.dte < 0.1) return GREEN  // nearly arrived
      return CREAM
    }
    default:
      return CREAM
  }
}

/** Balloons fly low and slow on purpose, so AGL and GS carry no warning
 *  colors. Only a fast descent is flagged; climbs are left neutral. */
function getLTAColor(id: InstrumentId, values: InstrumentValues): string {
  if (id === 'vs') {
    if (values.vs < -800) return RED
    if (values.vs < -500) return AMBER
  }
  if (id === 'dte' && values.dte !== null && values.dte < 0.1) return GREEN
  return CREAM
}

/** Unit label shown under an instrument value, in the chosen display units. */
export function instrumentUnit(id: InstrumentId, units: UnitPrefs): string {
  switch (id) {
    case 'gs': case 'avgs': case 'wspd':
      return SPEED_LABELS[units.speed]
    case 'agl': case 'msl': case 'maxalt':
      return ALTITUDE_LABELS[units.altitude]
    case 'vs': case 'avgvs':
      return VERTICAL_LABELS[units.vertical]
    case 'dist': case 'dte': case 'xtk':
      return DISTANCE_LABELS[units.distance]
    case 'hdg': case 'brg': case 'wdir': case 'dtk':
      return '°'
    case 'ete':
      return 'min'
    default:
      return ''
  }
}

/** Format an instrument value for display, in the chosen display units.
 *  Values themselves are always ft / kt / nm / fpm. */
export function formatInstrumentValue(id: InstrumentId, values: InstrumentValues, units: UnitPrefs): string {
  switch (id) {
    case 'gs':
      return formatSpeed(values.gs, units.speed)
    case 'agl':
      return formatAltitude(values.agl, units.altitude)
    case 'msl':
      return formatAltitude(values.msl, units.altitude)
    case 'vs':
      return formatVerticalSpeed(values.vs, units.vertical)
    case 'hdg':
      return formatDeg(values.hdg)
    case 'dist':
      return formatDistance(values.dist, units.distance)
    case 'brg':
      return formatDeg(values.brg)
    case 'etime':
      return formatElapsed(values.etime)
    case 'sess':
      return formatElapsed(values.sess)
    case 'tod':
      return formatClock(values.tod)
    case 'maxalt':
      return formatAltitude(values.maxalt, units.altitude)
    case 'avgs':
      return formatSpeed(values.avgs, units.speed)
    case 'avgvs':
      return formatVerticalSpeed(values.avgvs, units.vertical)
    case 'wdir':
      return values.wdir !== null ? formatDeg(values.wdir) : '---'
    case 'wspd':
      return values.wspd !== null ? formatSpeed(values.wspd, units.speed) : '---'
    case 'dtk':
      return values.dtk !== null ? formatDeg(values.dtk) : '---'
    case 'dtk_arrow': {
      if (values.dtk === null) return '---'
      const rel = ((values.dtk - values.hdg) + 360) % 360
      return formatDeg(rel)
    }
    case 'brg_arrow': {
      const rel = ((values.brg - values.hdg) + 360) % 360
      return formatDeg(rel)
    }
    case 'dte':
      return values.dte !== null ? formatDistance(values.dte, units.distance) : '---'
    case 'xtk':
      return values.xtk !== null ? formatDistance(values.xtk, units.distance, 2) : '---'
    case 'ete':
      return values.ete !== null ? Math.round(values.ete).toString() : '---'
    case 'hsi':
      return ''  // rendered as SVG, not text
  }
}

function formatClock(unixMs: number): string {
  if (!unixMs) return '--:--'
  const d = new Date(unixMs)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
