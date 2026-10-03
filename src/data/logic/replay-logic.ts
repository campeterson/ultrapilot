import type { StampEvent, TrackPoint } from '../models'
import { bearing, haversineNM, metersToFeet } from './gps-logic'

/** Speed/track/VS are measured over at least this span so 1 Hz GPX noise
 *  doesn't make the readouts flicker. Our own recordings are already 5 s. */
const RATE_WINDOW_MS = 5_000
/** Recording gaps longer than this (app backgrounded, GPS lost) are skipped
 *  during playback instead of showing a frozen aircraft. */
export const REPLAY_GAP_MS = 60_000
/** Below this the track direction is noise — hold the previous one. */
const MIN_TRACK_KTS = 1

export interface ReplayTrack {
  points: TrackPoint[]      // sorted by ts, unique timestamps
  gsKts: number[]           // per segment i (points[i] → points[i+1])
  vsFpm: number[]
  trackDeg: number[]
  startTs: number
  endTs: number
}

export interface ReplayFrame {
  ts: number
  index: number             // segment start index
  lat: number
  lon: number
  altMSLft: number
  aglFt: number
  gsKts: number
  vsFpm: number
  trackDeg: number
}

export function prepareReplay(raw: TrackPoint[]): ReplayTrack | null {
  const sorted = [...raw].sort((a, b) => a.ts - b.ts)
  const points = sorted.filter((p, i) => i === 0 || p.ts !== sorted[i - 1].ts)
  if (points.length < 2) return null

  const n = points.length - 1
  const gsKts = new Array<number>(n)
  const vsFpm = new Array<number>(n)
  const trackDeg = new Array<number>(n)
  let lastTrack = 0
  let j = 1
  for (let i = 0; i < n; i++) {
    // Window end: first point ≥ RATE_WINDOW_MS after points[i] (sliding)
    if (j <= i) j = i + 1
    while (j < points.length - 1 && points[j].ts - points[i].ts < RATE_WINDOW_MS) j++
    const a = points[i], b = points[j]
    const dtMs = b.ts - a.ts
    const gs = dtMs > 0 ? haversineNM(a.lat, a.lon, b.lat, b.lon) / (dtMs / 3_600_000) : 0
    gsKts[i] = gs
    vsFpm[i] = dtMs > 0 ? metersToFeet(b.altMSL - a.altMSL) / (dtMs / 60_000) : 0
    if (gs >= MIN_TRACK_KTS) lastTrack = bearing(a.lat, a.lon, b.lat, b.lon)
    trackDeg[i] = lastTrack
  }
  // Back-fill track for a stationary start so the arrow points where it goes
  const firstMoving = gsKts.findIndex(v => v >= MIN_TRACK_KTS)
  if (firstMoving > 0) for (let i = 0; i < firstMoving; i++) trackDeg[i] = trackDeg[firstMoving]

  return { points, gsKts, vsFpm, trackDeg, startTs: points[0].ts, endTs: points[n].ts }
}

/** Index i such that points[i].ts ≤ t < points[i+1].ts (clamped). */
function segmentAt(track: ReplayTrack, t: number): number {
  const p = track.points
  if (t <= p[0].ts) return 0
  if (t >= p[p.length - 1].ts) return p.length - 2
  let lo = 0, hi = p.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (p[mid].ts <= t) lo = mid
    else hi = mid
  }
  return lo
}

export function frameAt(track: ReplayTrack, t: number, originAltMSLm: number): ReplayFrame {
  const i = segmentAt(track, t)
  const a = track.points[i], b = track.points[i + 1]
  const f = Math.min(1, Math.max(0, (t - a.ts) / (b.ts - a.ts)))
  const altMSL = a.altMSL + (b.altMSL - a.altMSL) * f
  return {
    ts: Math.min(Math.max(t, track.startTs), track.endTs),
    index: i,
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    altMSLft: metersToFeet(altMSL),
    aglFt: metersToFeet(altMSL - originAltMSLm),
    gsKts: track.gsKts[i],
    vsFpm: track.vsFpm[i],
    trackDeg: track.trackDeg[i],
  }
}

/** If t sits inside a recording gap, jump to the far side of it. */
export function skipGap(track: ReplayTrack, t: number): number {
  const i = segmentAt(track, t)
  const a = track.points[i], b = track.points[i + 1]
  return b.ts - a.ts > REPLAY_GAP_MS && t > a.ts ? b.ts : t
}

/** [lon, lat] coordinates flown so far, ending at the current frame. */
export function trailCoords(track: ReplayTrack, frame: ReplayFrame): [number, number][] {
  const coords: [number, number][] = []
  for (let k = 0; k <= frame.index; k++) coords.push([track.points[k].lon, track.points[k].lat])
  coords.push([frame.lon, frame.lat])
  return coords
}

/** Index of the last event at or before t, or -1. Events must be sorted. */
export function lastEventIndexAt(events: StampEvent[], t: number): number {
  let idx = -1
  for (let k = 0; k < events.length; k++) {
    if (events[k].ts <= t) idx = k
    else break
  }
  return idx
}

export const REPLAY_SPEEDS = [1, 10, 30, 60, 120] as const
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]

export function nextReplaySpeed(s: ReplaySpeed): ReplaySpeed {
  const i = REPLAY_SPEEDS.indexOf(s)
  return REPLAY_SPEEDS[(i + 1) % REPLAY_SPEEDS.length]
}
