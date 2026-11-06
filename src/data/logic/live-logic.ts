// Live Group behaviour: roles, when to send a fix, how old a member looks,
// invite links, callsigns. Pure. See docs/09-LIVE_GROUP.md.
import type { FlightMode } from '../models'
import { FIX_EPOCH_MS, formatSeq } from './live-codec'
import { bearing, haversineNM } from './gps-logic'
import type { LiveFix } from './live-codec'

// ─── roles ───────────────────────────────────────────────────────────────────

export type LiveRole = 'balloon' | 'chase' | 'ppc' | 'ppg' | 'aircraft' | 'ground'

export const LIVE_ROLES: { id: LiveRole; label: string; char: string; airborne: boolean }[] = [
  { id: 'balloon',  label: 'Balloon',        char: 'b', airborne: true },
  { id: 'chase',    label: 'Chase vehicle',  char: 'c', airborne: false },
  { id: 'ppc',      label: 'PPC',            char: 'p', airborne: true },
  { id: 'ppg',      label: 'PPG',            char: 'g', airborne: true },
  { id: 'aircraft', label: 'Other aircraft', char: 'a', airborne: true },
  { id: 'ground',   label: 'Ground / Ops',   char: 'o', airborne: false },
]

export function roleLabel(r: LiveRole): string {
  return LIVE_ROLES.find(x => x.id === r)?.label ?? r
}

export function defaultRole(mode: FlightMode): LiveRole {
  return mode === 'lta' ? 'balloon' : 'ppc'
}

export const MAX_CALLSIGN = 24

/** Roster name plaintext: "<roleChar>:<callsign>", kept short enough for the relay. */
export function composeName(role: LiveRole, callsign: string): string {
  const char = LIVE_ROLES.find(r => r.id === role)?.char ?? 'a'
  let name = `${char}:${callsign.trim().slice(0, MAX_CALLSIGN)}`
  // Cipher must stay ≤ 100 chars → plaintext ≤ 45 UTF-8 bytes
  while (new TextEncoder().encode(name).length > 45) name = name.slice(0, -1)
  return name
}

export function parseName(name: string): { role: LiveRole; callsign: string } {
  const role = LIVE_ROLES.find(r => name.startsWith(r.char + ':'))
  return role ? { role: role.id, callsign: name.slice(2) || '?' } : { role: 'aircraft', callsign: name || '?' }
}

// ─── sending ─────────────────────────────────────────────────────────────────

/** Send rule (docs/09 §1): moved, turned, or heartbeat — never faster than the role's minimum gap. */
export const SEND_MOVED_M = 25
export const SEND_TURNED_DEG = 15
export const SEND_HEARTBEAT_MS = 15_000
export const MIN_GAP_AIRBORNE_MS = 3_000
export const MIN_GAP_GROUND_MS = 5_000

export function minGapMs(role: LiveRole): number {
  return LIVE_ROLES.find(r => r.id === role)?.airborne ? MIN_GAP_AIRBORNE_MS : MIN_GAP_GROUND_MS
}

export interface SentFix { lat: number; lon: number; trackDeg: number | null; at: number }

export function shouldSend(
  last: SentFix | null,
  cur: { lat: number; lon: number; trackDeg: number | null },
  now: number,
  role: LiveRole,
): boolean {
  if (!last) return true
  const dt = now - last.at
  if (dt < minGapMs(role)) return false
  if (dt >= SEND_HEARTBEAT_MS) return true
  if (haversineNM(last.lat, last.lon, cur.lat, cur.lon) * 1852 > SEND_MOVED_M) return true
  if (last.trackDeg != null && cur.trackDeg != null) {
    const d = Math.abs(((cur.trackDeg - last.trackDeg + 540) % 360) - 180)
    if (d > SEND_TURNED_DEG) return true
  }
  return false
}

/** Monotonic sequence from the server-corrected clock (tenths of a second since
 *  the fix epoch) — survives reloads without storing a counter. */
export function seqAt(serverMs: number): string {
  return formatSeq((serverMs - FIX_EPOCH_MS) / 100)
}

// ─── viewing ─────────────────────────────────────────────────────────────────

export const POLL_VISIBLE_MS = 2_000
export const POLL_HIDDEN_MS = 15_000
export const POLL_ERROR_MS = 10_000
export const FADE_AFTER_S = 30
export const GREY_AFTER_S = 60

export type Freshness = 'live' | 'fading' | 'stale'

export function freshness(ageS: number): Freshness {
  return ageS >= GREY_AFTER_S ? 'stale' : ageS >= FADE_AFTER_S ? 'fading' : 'live'
}

/** "now", "12 s", "3 min". */
export function ageText(ageS: number): string {
  if (ageS < 3) return 'now'
  if (ageS < 120) return `${Math.round(ageS)} s`
  return `${Math.round(ageS / 60)} min`
}

/** Callsigns shown in a group: duplicates get a short device tag ("CHASE ·k3"). */
export function displayCallsigns(members: { pubId: string; callsign: string }[]): Map<string, string> {
  const count = new Map<string, number>()
  for (const m of members) count.set(m.callsign.toUpperCase(), (count.get(m.callsign.toUpperCase()) ?? 0) + 1)
  return new Map(members.map(m => [m.pubId, (count.get(m.callsign.toUpperCase()) ?? 0) > 1 ? `${m.callsign} ·${m.pubId.slice(0, 2)}` : m.callsign]))
}

// ─── invites ─────────────────────────────────────────────────────────────────

const RE_SECRET = /^[A-Za-z0-9_-]{43}$/

/** The group secret from an invite link, a bare "#live=…" fragment, or the secret itself. */
export function parseInvite(text: string): string | null {
  const t = text.trim()
  const m = t.match(/[#&?]live=([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/)
  if (m) return m[1]
  return RE_SECRET.test(t) ? t : null
}

export function inviteLink(origin: string, groupSecret: string): string {
  return `${origin}/#live=${groupSecret}`
}

// ─── member display ──────────────────────────────────────────────────────────

export interface MemberView {
  ageS: number
  freshness: Freshness
  /** From my position, when both are known. */
  distNM: number | null
  bearingDeg: number | null
  altFt: number | null
}

export function memberView(fix: LiveFix, me: { lat: number; lon: number } | null, serverNow: number): MemberView {
  const ageS = Math.max(0, (serverNow - fix.ts) / 1000)
  return {
    ageS,
    freshness: freshness(ageS),
    distNM: me ? haversineNM(me.lat, me.lon, fix.lat, fix.lon) : null,
    bearingDeg: me ? bearing(me.lat, me.lon, fix.lat, fix.lon) : null,
    altFt: fix.altM == null ? null : fix.altM * 3.28084,
  }
}
