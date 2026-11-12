// Direction line (track vector): where you'll be in N minutes at the current
// groundspeed, with a tick at each step. Time-based, like the Garmin / ForeFlight
// track vector (Garmin default 60 s; choices 30 s – 20 min). Pure.
import type { FlightMode } from '../models'
import { destinationPoint } from './gps-logic'

export type LineMinutes = number

/**
 * Look-ahead choices by flight mode.
 * Powered: 1–10 min — at 25–30 kt that's ~0.5–5 nm, the range for picking a field.
 * LTA: 10–60 min — a balloon at 5–10 kt needs a long look ahead for landing sites.
 */
export const LINE_MINUTES: Record<FlightMode, LineMinutes[]> = {
  powered: [1, 2, 5, 10],
  lta: [10, 30, 60],
}

export const DEFAULT_LINE_MINUTES: Record<FlightMode, LineMinutes> = { powered: 2, lta: 30 }

/** A saved value that's not one of the choices (old settings) falls back to the default. */
export function validLineMinutes(mode: FlightMode, m: unknown): LineMinutes {
  return typeof m === 'number' && LINE_MINUTES[mode].includes(m) ? m : DEFAULT_LINE_MINUTES[mode]
}

/** Minutes between ticks: every minute when powered; every 10 for balloons (every 5 on the shortest). */
export function tickEveryMinutes(mode: FlightMode, minutes: LineMinutes): number {
  if (mode === 'powered') return 1
  return minutes <= 10 ? 5 : 10
}

export interface DirectionLine {
  /** [lon, lat] start and end — GeoJSON order. */
  coords: [number, number][]
  /** [lon, lat] of each tick, not counting the end. */
  ticks: [number, number][]
}

/**
 * The line from (lat, lon) along `trackDeg`, `minutes` ahead at `speedKt`,
 * starting `gapNM` ahead (clear of the ownship icon). null when not moving.
 */
export function directionLine(
  lat: number, lon: number, trackDeg: number, speedKt: number,
  minutes: LineMinutes, tickEvery: number, gapNM = 0,
): DirectionLine | null {
  if (!(speedKt > 0)) return null
  const at = (nm: number) => { const [la, lo] = destinationPoint(lat, lon, trackDeg, nm); return [lo, la] as [number, number] }
  const lengthNM = speedKt * minutes / 60
  const ticks: [number, number][] = []
  for (let t = tickEvery; t < minutes - 1e-9; t += tickEvery) ticks.push(at(speedKt * t / 60))
  return { coords: [at(Math.min(gapNM, lengthNM)), at(lengthNM)], ticks }
}
