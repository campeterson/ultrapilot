import type { InstrumentId } from '../models'
import { haversineNM, bearing, computeAGLft, msToKnots, metersToFeet, formatDeg, formatNM } from './gps-logic'

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
  maxAGLft: number
): InstrumentValues {
  const agl = computeAGLft(pos.altMSL, originAltMSLm)
  return {
    gs: msToKnots(pos.speed),
    agl,
    msl: metersToFeet(pos.altMSL),
    vs: vsFpm,
    hdg: pos.heading,
    dist: haversineNM(pos.lat, pos.lon, originLat, originLon),
    brg: bearing(pos.lat, pos.lon, originLat, originLon),
    etime: flightStartMs !== null ? pos.ts - flightStartMs : 0,
    sess: pos.ts - sessionStartMs,
    maxalt: Math.max(maxAGLft, agl),
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
