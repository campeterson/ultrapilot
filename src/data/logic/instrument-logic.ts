import type { InstrumentId } from '../models'
import { haversineNM, bearing, computeAGLft, msToKnots, metersToFeet, formatDeg, formatNM, crossTrackErrorNM, estimatedTimeEnrouteMin } from './gps-logic'

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
  maxalt: number    // feet (max AGL this session)
  dtk: number | null   // degrees (null when no direct-to)
  dte: number | null   // nm
  xtk: number | null   // nm (signed)
  ete: number | null   // minutes
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
    maxalt: Math.max(maxAGLft, agl),
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

/** Return a color string for an instrument value based on aviation-standard ranges.
 *  Returns cream (normal) for instruments with no meaningful range coloring. */
export function getInstrumentColor(id: InstrumentId, values: InstrumentValues): string {
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

/** Format an instrument value for display */
export function formatInstrumentValue(id: InstrumentId, values: InstrumentValues): string {
  switch (id) {
    case 'gs':
      return Math.round(values.gs).toString()
    case 'agl':
      return Math.round(values.agl).toString()
    case 'msl':
      return Math.round(values.msl).toString()
    case 'vs': {
      const v = Math.round(values.vs)
      return v > 0 ? `+${v}` : v.toString()
    }
    case 'hdg':
      return formatDeg(values.hdg)
    case 'dist':
      return formatNM(values.dist)
    case 'brg':
      return formatDeg(values.brg)
    case 'etime':
      return formatElapsed(values.etime)
    case 'sess':
      return formatElapsed(values.sess)
    case 'maxalt':
      return Math.round(values.maxalt).toString()
    case 'dtk':
      return values.dtk !== null ? formatDeg(values.dtk) : '---'
    case 'dtk_arrow':
      return values.dtk !== null ? formatDeg(values.dtk) : '---'
    case 'brg_arrow':
      return formatDeg(values.brg)
    case 'dte':
      return values.dte !== null ? formatNM(values.dte) : '---'
    case 'xtk':
      return values.xtk !== null ? values.xtk.toFixed(2) : '---'
    case 'ete':
      return values.ete !== null ? Math.round(values.ete).toString() : '---'
  }
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
