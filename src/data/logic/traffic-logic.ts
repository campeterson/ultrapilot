// ADS-B traffic: when to fetch it, which area to ask for, which targets are us,
// and how to label them. Pure. See docs/10-TRAFFIC.md.
import { haversineNM } from './gps-logic'
import { FLAG_TRACKING, type LiveFix } from './live-codec'

/** One aircraft from /api/traffic (netlify/lib/traffic-core.ts). Altitudes ft; `alt` baro, `altGeom` GPS. */
export interface TrafficTarget {
  hex: string
  cs: string | null
  reg: string | null
  type: string | null
  lat: number
  lon: number
  alt: number | null
  altGeom: number | null
  gs: number | null
  trk: number | null
  vs: number | null
  /** Seconds old when received (upstream age + server-to-phone skew). */
  age: number
  src: string | null
}

export interface TrafficArea { lat: number; lon: number; nm: number }

export const TRAFFIC_POLL_MS = 5_000
export const TRAFFIC_MAX_BACKOFF_MS = 30_000
/** A member counts toward "group is active" while their last fix is this fresh. */
export const GROUP_ACTIVE_MS = 60_000
/** Targets fade after this, and are dropped after TRAFFIC_DROP_S (e.g. when polling fails). */
export const TRAFFIC_FADE_S = 10
export const TRAFFIC_DROP_S = 30

/** Retry delay after `fails` failures in a row: doubles, capped at 30 s. */
export function trafficBackoff(fails: number, base = TRAFFIC_POLL_MS): number {
  return fails ? Math.min(TRAFFIC_MAX_BACKOFF_MS, base * 2 ** Math.min(fails, 4)) : base
}

/**
 * The area that covers everyone: centre of the points, rounded to 0.05°, radius to the
 * farthest point + 10 nm, rounded up to a multiple of 5 in 15–100. Must always pass the
 * server's canonicalArea() — lat/lon are sent with toFixed(2).
 */
export function coverArea(pts: { lat: number; lon: number }[]): TrafficArea {
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length
  const far = Math.max(...pts.map(p => haversineNM(lat, lon, p.lat, p.lon)))
  const nm = Math.min(100, Math.max(15, Math.ceil((far + 10) / 5) * 5))
  return { lat: Math.round(lat * 20) / 20, lon: Math.round(lon * 20) / 20, nm }
}

export function areaQuery(a: TrafficArea): string {
  return `lat=${a.lat.toFixed(2)}&lon=${a.lon.toFixed(2)}&nm=${a.nm}`
}

// ─── on / off ────────────────────────────────────────────────────────────────

/** Why traffic is on or off for this phone. */
export type TrafficReason = 'session' | 'manual' | 'group' | 'manual-off' | 'off'

export interface TrafficState {
  /** I'm "tracking": tell the group (a flag in my shared fix) so they fetch traffic too. */
  tracking: boolean
  /** This phone fetches traffic. */
  active: boolean
  reason: TrafficReason
}

/**
 * `manual`: the Traffic switch — null = automatic (on while a session runs).
 * `groupTracker`: callsign of a group member who is tracking, if any.
 * A balloon flies too slowly for speed-based "flying" detection, so a running
 * session is the automatic trigger. Switching off wins over the group.
 */
export function trafficState(manual: boolean | null, sessionActive: boolean, groupTracker: string | null): TrafficState {
  const tracking = manual === true || (manual === null && sessionActive)
  if (manual === false) return { tracking: false, active: false, reason: 'manual-off' }
  if (tracking) return { tracking, active: true, reason: manual ? 'manual' : 'session' }
  if (groupTracker) return { tracking: false, active: true, reason: 'group' }
  return { tracking: false, active: false, reason: 'off' }
}

export function trafficReasonText(s: TrafficState, groupTracker: string | null): string {
  switch (s.reason) {
    case 'session': return 'On — your session is running'
    case 'manual': return 'On — you switched it on'
    case 'group': return `On — ${groupTracker ?? 'someone in your group'} is flying`
    case 'manual-off': return 'Off — you switched it off'
    default: return 'Off — comes on when you start a session'
  }
}

interface MemberLike { isMe: boolean; callsign: string; fix: LiveFix | null; hex?: string | null }

/** First other member whose fresh fix says they're tracking. */
export function groupTracker(members: MemberLike[], serverNow: number): string | null {
  const m = members.find(x => !x.isMe && x.fix && (x.fix.flags & FLAG_TRACKING) && serverNow - x.fix.ts <= GROUP_ACTIVE_MS)
  return m ? m.callsign : null
}

/** Where the group is: my position plus every other member's recent fix. */
export function trafficPoints(me: { lat: number; lon: number } | null, members: MemberLike[], serverNow: number): { lat: number; lon: number }[] {
  const pts = members.filter(m => !m.isMe && m.fix && serverNow - m.fix.ts <= GROUP_ACTIVE_MS).map(m => ({ lat: m.fix!.lat, lon: m.fix!.lon }))
  if (me) pts.push(me)
  return pts
}

// ─── who is "us" ─────────────────────────────────────────────────────────────

const HEX = /^[0-9a-f]{6}$/

/** An ICAO 24-bit address as 6 lowercase hex digits, or null. */
export function normalizeHex(s: string | null | undefined): string | null {
  const h = (s ?? '').trim().toLowerCase().replace(/^0x/, '')
  return HEX.test(h) ? h : null
}

/** Within this of a group member (fresh fix) a target is taken to be that member. */
export const SAME_AS_MEMBER_NM = 0.05
export const SAME_AS_MEMBER_FT = 300
const MEMBER_FRESH_MS = 15_000

/**
 * Drop targets that are us: my own hex, any member's hex, and — for members
 * whose hex we don't know — a target sitting right on a member's fresh fix.
 * Never by distance from me: an aircraft that close to me is exactly what traffic is for.
 */
export function withoutOwn(targets: TrafficTarget[], myHex: string | null, members: MemberLike[], serverNow: number): TrafficTarget[] {
  const hexes = new Set([myHex, ...members.map(m => m.hex ?? null)].filter((h): h is string => !!h))
  const near = members.filter(m => !m.isMe && !m.hex && m.fix && m.fix.altM != null && serverNow - m.fix.ts <= MEMBER_FRESH_MS)
  return targets.filter(t => {
    if (hexes.has(t.hex)) return false
    const tAlt = t.altGeom ?? t.alt
    return !near.some(m => haversineNM(m.fix!.lat, m.fix!.lon, t.lat, t.lon) <= SAME_AS_MEMBER_NM &&
      (tAlt == null || Math.abs(tAlt - m.fix!.altM! * 3.28084) <= SAME_AS_MEMBER_FT))
  })
}

// ─── display ─────────────────────────────────────────────────────────────────

export interface TrafficView {
  name: string
  ageS: number
  faded: boolean
  /** Feet above (+) or below (−) me, to the nearest 100; null without both altitudes. */
  relFt: number | null
  /** ↑ climbing / ↓ descending (≥ 500 fpm), else ''. */
  trend: '↑' | '↓' | ''
}

export function trafficView(t: TrafficTarget, myAltFt: number | null, secondsSinceReceived: number): TrafficView {
  const ageS = t.age + Math.max(0, secondsSinceReceived)
  // GPS altitude (geom) compares with my GPS altitude; pressure altitude is the fallback
  const tAlt = t.altGeom ?? t.alt
  return {
    name: t.cs || t.reg || t.hex.toUpperCase(),
    ageS,
    faded: ageS > TRAFFIC_FADE_S,
    relFt: tAlt != null && myAltFt != null ? Math.round((tAlt - myAltFt) / 100) * 100 : null,
    trend: t.vs != null && t.vs >= 500 ? '↑' : t.vs != null && t.vs <= -500 ? '↓' : '',
  }
}

/** "+300 ft ↑", "−1,200 ft", "1,000 ft" (no reference: the target's own altitude). */
export function relAltText(v: TrafficView, t: TrafficTarget): string {
  if (v.relFt != null) return `${v.relFt > 0 ? '+' : v.relFt < 0 ? '−' : '±'}${Math.abs(v.relFt).toLocaleString('en-US')} ft${v.trend ? ' ' + v.trend : ''}`
  const a = t.altGeom ?? t.alt
  return a != null ? `${Math.round(a).toLocaleString('en-US')} ft${v.trend ? ' ' + v.trend : ''}` : ''
}
