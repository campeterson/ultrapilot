// Demo members: pretend Live Group members that move realistically around you,
// so the group features can be shown without a second phone. Pure — the store
// calls demoFixes() once a second. Never sent to the relay. See docs/09 §10.
import type { LiveRole } from './live-logic'
import type { LiveFix } from './live-codec'
import { destinationPoint } from './gps-logic'

/** Demo pubIds start with this, so they can never collide with real members. */
export const DEMO_ID_PREFIX = 'demo-'

export const isDemoId = (pubId: string) => pubId.startsWith(DEMO_ID_PREFIX)

/**
 * One demo member flies (or drives) a circle around you at constant speed.
 * The circle follows you, so they stay nearby however far you go, and each
 * has its own radius, so they never sit on you or on each other.
 */
export interface DemoMember {
  pubId: string
  callsign: string
  role: LiveRole
  radiusM: number
  speedMs: number
  /** +1 clockwise, −1 counter-clockwise. */
  dir: 1 | -1
  /** Starting angle on the circle, degrees. */
  phaseDeg: number
  /** Height above the demo ground; 0 for ground roles. */
  aglM: number
  /** Slow climb/descent swing around aglM (± m). */
  swingM: number
}

const NM = 1852

/** What demoCast() gives you, in words. */
export function demoBlurb(myRole: LiveRole): string {
  if (myRole === 'balloon') return 'a chase vehicle driving around you and a second balloon drifting nearby'
  if (myRole === 'chase' || myRole === 'ground') return 'a balloon drifting near you and a PPC flying the area'
  return 'two other aircraft flying around you at different heights'
}

/** Who shows up, by my role: a balloon gets a chase car; a chase crew gets a balloon; aircraft get traffic. */
export function demoCast(myRole: LiveRole): DemoMember[] {
  const id = (n: number) => `${DEMO_ID_PREFIX}${n}`
  if (myRole === 'balloon') return [
    // Chase vehicle working the roads near the balloon, ~25 mph
    { pubId: id(1), callsign: 'Chase (demo)', role: 'chase', radiusM: 1300, speedMs: 11, dir: 1, phaseDeg: 0, aglM: 0, swingM: 0 },
    // A second balloon drifting a slow, wide arc, ~8 kt
    { pubId: id(2), callsign: 'Balloon 2 (demo)', role: 'balloon', radiusM: 2800, speedMs: 4, dir: -1, phaseDeg: 120, aglM: 450, swingM: 150 },
  ]
  if (myRole === 'chase' || myRole === 'ground') return [
    // The balloon being chased, drifting ahead
    { pubId: id(1), callsign: 'Balloon (demo)', role: 'balloon', radiusM: 2400, speedMs: 4.5, dir: 1, phaseDeg: 240, aglM: 400, swingM: 150 },
    // A PPC flying around the field
    { pubId: id(2), callsign: 'PPC (demo)', role: 'ppc', radiusM: 1300, speedMs: 14, dir: -1, phaseDeg: 30, aglM: 200, swingM: 60 },
  ]
  return [
    // Two aircraft around me at different heights and directions
    { pubId: id(1), callsign: 'PPC 2 (demo)', role: 'ppc', radiusM: 1300, speedMs: 13, dir: 1, phaseDeg: 270, aglM: 150, swingM: 50 },
    { pubId: id(2), callsign: 'Trike (demo)', role: 'aircraft', radiusM: 2600, speedMs: 20, dir: -1, phaseDeg: 60, aglM: 300, swingM: 80 },
  ]
}

/**
 * Where a demo member is at time `t` (ms since the demo started), around my
 * position `me` with the demo ground at `groundM` MSL. `ts` is stamped as
 * the fix time so it reads "now".
 */
export function demoFix(m: DemoMember, me: { lat: number; lon: number }, groundM: number, t: number, ts: number): LiveFix {
  const s = t / 1000
  const angle = m.phaseDeg + m.dir * (m.speedMs * s / m.radiusM) * 180 / Math.PI
  const brg = ((angle % 360) + 360) % 360
  const [lat, lon] = destinationPoint(me.lat, me.lon, brg, m.radiusM / NM)
  const trackDeg = ((brg + m.dir * 90) % 360 + 360) % 360
  // A climb/descent cycle every ~4 minutes
  const altM = groundM + m.aglM + m.swingM * Math.sin(2 * Math.PI * s / 240 + m.phaseDeg)
  return { lat, lon, altM, accM: 5, speedMs: m.speedMs, trackDeg, ts: Math.round(ts / 1000) * 1000, flags: 0 }
}
