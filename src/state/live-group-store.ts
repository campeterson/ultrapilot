import { create } from 'zustand'
import {
  decryptFix, decryptName, deriveGroupKeys, encryptFix, encryptName, FLAG_STOPPED, FLAG_TRACKING, pubIdFor, randomKey,
  type GroupKeys, type LiveFix,
} from '../data/logic/live-codec'
import {
  composeName, defaultRole, parseInvite, parseName, POLL_ERROR_MS, POLL_HIDDEN_MS, POLL_VISIBLE_MS, seqAt, shouldSend,
  type LiveAltMode, type LiveRole, type SentFix,
} from '../data/logic/live-logic'
import { demoCast, demoFix, isDemoId } from '../data/logic/live-demo-logic'
import * as api from '../data/live-api'
import type { GPSPosition } from '../data/models'
import { useGPSStore } from './gps-store'
import { useFlightModeStore } from './flight-mode-store'
import { useDirectToStore } from './direct-to-store'
import { useSessionStore } from './session-store'
import { trackEvent } from '../lib/analytics'

const STORAGE_KEY = 'ultrapilot_liveGroup'

export interface LiveProfile {
  callsign: string
  role: LiveRole
  /** ICAO address (6 hex digits) if this aircraft has ADS-B Out — so the group drops it from traffic. */
  hex?: string | null
}

/** What this device keeps about its group. The secret is the invite. */
interface SavedGroup {
  secret: string
  memberKey: string
  /** Only on the device that created the group. */
  ownerKey: string | null
}

export interface LiveMember {
  pubId: string
  callsign: string
  role: LiveRole
  /** Latest position, or null when none in the last 1–2 minutes / stopped sharing. */
  fix: LiveFix | null
  isMe: boolean
  /** Their ICAO hex, if they gave one. */
  hex: string | null
}

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'offline'

/** How other members are drawn. */
export interface LiveDisplay {
  /** Line ahead of each moving member along its track. */
  lines: boolean
  /** MSL, or AGL with the chase crew as 0. */
  altMode: LiveAltMode
}

const DEFAULT_DISPLAY: LiveDisplay = { lines: true, altMode: 'msl' }

interface Persisted { profile: LiveProfile | null; group: SavedGroup | null; display: LiveDisplay }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) { const p = JSON.parse(raw); return { profile: null, group: null, ...p, display: { ...DEFAULT_DISPLAY, ...p.display } } }
  } catch {}
  return { profile: null, group: null, display: { ...DEFAULT_DISPLAY } }
}

interface LiveGroupStore extends Persisted {
  keys: GroupKeys | null
  pubId: string | null
  members: LiveMember[]
  status: LiveStatus
  error: string | null
  sharing: boolean
  busy: boolean
  /** Server-clock offset (ms) — server ≈ Date.now() + offset. */
  offset: number
  /** An invite opened from a link, waiting for the user to confirm. */
  pendingInvite: string | null

  /** Resume the saved group (watching, not sharing) on app start. */
  init: () => Promise<void>
  setProfile: (p: LiveProfile) => Promise<void>
  createGroup: () => Promise<void>
  joinGroup: (invite: string) => Promise<boolean>
  leaveGroup: () => Promise<void>
  endGroup: () => Promise<void>
  startSharing: () => void
  stopSharing: () => Promise<void>
  setPendingInvite: (secret: string | null) => void
  /** Ask the relay: is storage working, and does my group exist? Result in `serverCheck`. */
  checkServer: () => Promise<void>
  serverCheck: { at: number; lines: string[]; ok: boolean } | null
  /** From the UI: page visibility drives the poll rate and clock re-sync. */
  setVisible: (visible: boolean) => void
  setDisplay: (patch: Partial<LiveDisplay>) => void
  /** Direct-To a member; the target follows them while they share. */
  directToMember: (pubId: string) => void
  /** I'm tracking (traffic store decides): every fix I share carries FLAG_TRACKING. */
  tracking: boolean
  setTracking: (on: boolean) => void
  /** Pretend members moving around me, for demonstrating (never sent anywhere). Not saved. */
  demo: boolean
  setDemo: (on: boolean) => void
}

// ─── runtime (not reactive) ──────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollGen = 0
let etag: string | null = null
let errors = 0
let visible = true
let lastSent: SentFix | null = null
let sending = false
let unsubGPS: (() => void) | null = null
/** While sharing: re-check the send rule every second, so the heartbeat and the
 *  first fix go out even when the GPS reports no new position (stationary iOS). */
let shareTimer: ReturnType<typeof setInterval> | null = null
let clockSyncedAt = 0
const nameCache = new Map<string, { callsign: string; role: LiveRole; hex: string | null }>()
/** Members from the relay; `members` = these + demo members. */
let realMembers: LiveMember[] = []
let demoMembers: LiveMember[] = []
let demoTimer: ReturnType<typeof setInterval> | null = null
let demoStartedAt = 0
let demoGroundM: number | null = null

export const useLiveGroupStore = create<LiveGroupStore>((set, get) => {
  const persist = () => {
    const { profile, group, display } = get()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, group, display })) } catch {}
  }
  const serverNow = () => Date.now() + get().offset
  const profileOrDefault = (): LiveProfile => get().profile ?? { callsign: 'Pilot', role: defaultRole(useFlightModeStore.getState().mode) }

  /** Five /time samples, keep the lowest round trip (relay spec §7). */
  async function syncClock() {
    let best: { offset: number; rtt: number } | null = null
    for (let i = 0; i < 5; i++) {
      try {
        const t = Date.now()
        const { now, rtt } = await api.serverTime()
        const offset = now + rtt / 2 - (t + rtt)
        if (!best || rtt < best.rtt) best = { offset, rtt }
      } catch { break }
    }
    if (best) { set({ offset: best.offset }); clockSyncedAt = Date.now() }
  }

  async function announce(keys: GroupKeys, memberKey: string) {
    const p = profileOrDefault()
    const seq = seqAt(serverNow())
    const pubId = await pubIdFor(memberKey)
    const name = await encryptName(keys, pubId, seq, composeName(p.role, p.callsign, p.hex ?? null))
    return api.joinGroup(keys.g, keys.writeKey, memberKey, seq, name)
  }

  function schedulePoll(ms: number) {
    if (pollTimer) clearTimeout(pollTimer)
    const gen = pollGen
    pollTimer = setTimeout(() => { if (gen === pollGen) void poll() }, ms)
  }

  async function poll() {
    const { keys, pubId } = get()
    if (!keys) return
    const gen = pollGen
    try {
      if (Date.now() - clockSyncedAt > 5 * 60_000) await syncClock()
      const r = await api.fetchLocs(keys.g, Math.floor(serverNow() / 2000), etag)
      if (gen !== pollGen) return
      errors = 0
      if (r) {
        etag = r.etag
        const fixes = new Map(r.data.fixes.map(f => [f[0], f]))
        const members: LiveMember[] = []
        for (const [id, seq, nameCipher] of r.data.members) {
          const ck = `${id}|${seq}`
          let who = nameCache.get(ck)
          if (!who) {
            try { who = parseName(await decryptName(keys, id, seq, nameCipher)); nameCache.set(ck, who) } catch { continue }
          }
          let fix: LiveFix | null = null
          const f = fixes.get(id)
          if (f) {
            try { fix = await decryptFix(keys, id, f[1], f[2]) } catch { fix = null }
            if (fix && fix.flags & FLAG_STOPPED) fix = null
          }
          members.push({ pubId: id, callsign: who.callsign, role: who.role, hex: who.hex, fix, isMe: id === pubId })
        }
        if (gen === pollGen) {
          realMembers = members
          set({ members: [...realMembers, ...demoMembers], status: 'live', error: null })
          // A Direct-To on a member follows them
          for (const m of members) if (m.fix) useDirectToStore.getState().followMember(m.pubId, m.fix.lat, m.fix.lon)
        }
      } else set({ status: 'live', error: null })
    } catch (e) {
      errors++
      set({ status: 'offline', error: (e as Error).message })
    }
    if (gen === pollGen) schedulePoll(errors >= 3 ? POLL_ERROR_MS : visible ? POLL_VISIBLE_MS : POLL_HIDDEN_MS)
  }

  function startPolling() {
    pollGen++
    etag = null; errors = 0
    void poll()
  }

  function stopPolling() {
    pollGen++
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
  }

  /** With `flags` (STOPPED) it's sent now, past the send rule. */
  async function sendPosition(pos: GPSPosition, flags = 0) {
    const { keys, group, pubId } = get()
    if (!keys || !group || !pubId || sending) return
    const trackDeg = pos.speed > 0.5 ? pos.heading : null
    const now = serverNow()
    const force = flags !== 0
    if (!(flags & FLAG_STOPPED) && get().tracking) flags |= FLAG_TRACKING
    if (!force && !shouldSend(lastSent, { lat: pos.lat, lon: pos.lon, trackDeg }, now, profileOrDefault().role)) return
    sending = true
    try {
      const seq = seqAt(now)
      const cipher = await encryptFix(keys, pubId, seq, {
        lat: pos.lat, lon: pos.lon, altM: pos.altMSL, accM: pos.accuracy,
        speedMs: Number.isFinite(pos.speed) && pos.speed >= 0 ? pos.speed : null, trackDeg, ts: now, flags,
      })
      let ok = await api.sendFix(keys.g, keys.writeKey, group.memberKey, seq, cipher)
      if (!ok && flags & FLAG_STOPPED) {
        // "Stopped sharing" must get through: wait out the relay's 2 s per-member limit once
        await new Promise(r => setTimeout(r, 2100))
        const seq2 = seqAt(serverNow())
        const cipher2 = await encryptFix(keys, pubId, seq2, {
          lat: pos.lat, lon: pos.lon, altM: pos.altMSL, accM: pos.accuracy, speedMs: null, trackDeg: null, ts: serverNow(), flags,
        })
        ok = await api.sendFix(keys.g, keys.writeKey, group.memberKey, seq2, cipher2)
      }
      if (ok) lastSent = { lat: pos.lat, lon: pos.lon, trackDeg, at: now }
    } catch {
      // Offline: drop the fix — a stale position replayed later is misleading
    } finally {
      sending = false
    }
  }

  /** Move the demo members on; around my latest position. */
  function demoTick() {
    const pos = useGPSStore.getState().position
    if (!pos) return   // no GPS yet — nothing to place them around
    if (demoGroundM == null) demoGroundM = useSessionStore.getState().session?.originAltMSL ?? pos.altMSL
    const t = Date.now() - demoStartedAt
    demoMembers = demoCast(profileOrDefault().role).map(d => ({
      pubId: d.pubId, callsign: d.callsign, role: d.role, isMe: false, hex: null,
      fix: demoFix(d, pos, demoGroundM!, t, serverNow()),
    }))
    set({ members: [...realMembers, ...demoMembers] })
    for (const m of demoMembers) if (m.fix) useDirectToStore.getState().followMember(m.pubId, m.fix.lat, m.fix.lon)
  }

  async function enter(group: SavedGroup, keys: GroupKeys) {
    realMembers = []
    set({ keys, group, status: 'connecting', error: null, members: [...demoMembers] })
    persist()
    await syncClock()
    const pubId = await announce(keys, group.memberKey)
    set({ pubId })
    startPolling()
  }

  return {
    ...load(),
    keys: null,
    pubId: null,
    members: [],
    status: 'idle',
    error: null,
    sharing: false,
    busy: false,
    offset: 0,
    pendingInvite: null,
    serverCheck: null,
    demo: false,
    tracking: false,

    setTracking: (on) => {
      if (get().tracking === on) return
      set({ tracking: on })
      // Tell the group within a second (the share timer sends when nothing was sent), not at the next heartbeat
      lastSent = null
    },

    setDemo: (on) => {
      if (demoTimer) clearInterval(demoTimer)
      demoTimer = null
      demoMembers = []
      demoGroundM = null
      if (on) {
        demoStartedAt = Date.now()
        demoTimer = setInterval(demoTick, 1000)
        set({ demo: true })
        demoTick()
        trackEvent('live_demo_started')
      } else {
        const target = useDirectToStore.getState().target
        if (target?.memberId && isDemoId(target.memberId)) useDirectToStore.getState().clearTarget()
        set({ demo: false, members: [...realMembers] })
      }
    },

    init: async () => {
      const { group, keys } = get()
      if (!group || keys) return
      const k = await deriveGroupKeys(group.secret)
      set({ keys: k, status: 'connecting', pubId: await pubIdFor(group.memberKey) })
      await syncClock()
      startPolling()
    },

    setProfile: async (profile) => {
      set({ profile })
      persist()
      const { keys, group } = get()
      if (keys && group) { try { await announce(keys, group.memberKey) } catch {} }
    },

    createGroup: async () => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const secret = randomKey()
        const keys = await deriveGroupKeys(secret)
        const ownerKey = randomKey()
        await api.createGroup(keys.g, keys.wtag, ownerKey)
        await enter({ secret, memberKey: randomKey(), ownerKey }, keys)
        trackEvent('live_group_created')
      } catch (e) {
        set({ error: (e as Error).message, status: 'idle', keys: null, group: null })
        persist()
      } finally { set({ busy: false }) }
    },

    joinGroup: async (invite) => {
      const secret = parseInvite(invite)
      if (!secret) { set({ error: 'That isn’t a Live Group code — copy the whole code and paste it again' }); return false }
      if (get().busy) return false
      set({ busy: true, error: null })
      try {
        if (get().group) await get().leaveGroup()
        const keys = await deriveGroupKeys(secret)
        await enter({ secret, memberKey: randomKey(), ownerKey: null }, keys)
        set({ pendingInvite: null })
        trackEvent('live_group_joined')
        return true
      } catch (e) {
        const err = e as api.RelayError
        const msg = err.code === 'no-group'
          ? 'The server can’t find that group — it may have ended. Ask for a fresh code, or tap “Check server” below.'
          : err.code === 'no-route' || err.code === 'no-relay'
            ? 'The Live Group server isn’t running on this site (relay not deployed).'
            : err.message
        set({ error: msg, status: 'idle', keys: null, group: null })
        persist()
        return false
      } finally { set({ busy: false }) }
    },

    leaveGroup: async () => {
      if (get().sharing) await get().stopSharing()
      stopPolling()
      if (useDirectToStore.getState().target?.memberId) useDirectToStore.getState().clearTarget()
      nameCache.clear()
      realMembers = []
      set({ group: null, keys: null, pubId: null, members: [...demoMembers], status: 'idle', error: null })
      persist()
    },

    endGroup: async () => {
      const { keys, group } = get()
      if (!keys || !group?.ownerKey) return
      set({ busy: true })
      try {
        await api.endGroup(keys.g, group.ownerKey)
        await get().leaveGroup()
      } catch (e) { set({ error: (e as Error).message }) }
      finally { set({ busy: false }) }
    },

    startSharing: () => {
      if (get().sharing || !get().keys) return
      lastSent = null
      set({ sharing: true })
      unsubGPS = useGPSStore.subscribe((s, prev) => {
        if (s.position && s.position !== prev.position) void sendPosition(s.position)
      })
      const pos = useGPSStore.getState().position
      if (pos) void sendPosition(pos)
      shareTimer = setInterval(() => {
        const p = useGPSStore.getState().position
        if (p) void sendPosition(p)
      }, 1000)
      trackEvent('live_sharing_started')
    },

    stopSharing: async () => {
      unsubGPS?.(); unsubGPS = null
      if (shareTimer) clearInterval(shareTimer)
      shareTimer = null
      set({ sharing: false })
      // Tombstone so others drop this marker now rather than when it ages out
      const pos: GPSPosition | null = useGPSStore.getState().position
        ?? (lastSent ? { lat: lastSent.lat, lon: lastSent.lon, altMSL: 0, speed: 0, heading: 0, accuracy: 0, ts: Date.now() } : null)
      if (pos) { sending = false; await sendPosition(pos, FLAG_STOPPED) }
      lastSent = null
    },

    setPendingInvite: (pendingInvite) => set({ pendingInvite }),

    checkServer: async () => {
      const lines: string[] = []
      let ok = true
      try {
        const h = await api.relayHealth()
        lines.push(h.ok ? `Server storage: working (${h.ms ?? '?'} ms)` : `Server storage: NOT working${h.error ? ` — ${h.error}` : ''}`)
        ok = ok && h.ok
      } catch (e) {
        lines.push(`Server: not reachable — ${(e as Error).message}`); ok = false
      }
      const { keys } = get()
      if (keys) {
        try {
          const st = await api.groupExists(keys.g)
          lines.push(st.exists ? `Your group: found on the server${st.updatedAt ? ` (active ${Math.round((Date.now() - st.updatedAt) / 1000)} s ago)` : ''}` : 'Your group: NOT found on the server — create a new group and share the new code')
          ok = ok && st.exists
        } catch (e) { lines.push(`Your group: couldn’t check — ${(e as Error).message}`); ok = false }
      }
      set({ serverCheck: { at: Date.now(), lines, ok } })
    },

    setDisplay: (patch) => {
      set({ display: { ...get().display, ...patch } })
      persist()
    },

    directToMember: (pubId) => {
      const m = get().members.find(x => x.pubId === pubId)
      if (!m?.fix) return
      const pos = useGPSStore.getState().position
      useDirectToStore.getState().setTarget({
        lat: m.fix.lat, lon: m.fix.lon, name: m.callsign, memberId: pubId,
        fromLat: pos?.lat ?? m.fix.lat, fromLon: pos?.lon ?? m.fix.lon,
      })
      trackEvent('live_direct_to')
    },

    setVisible: (v) => {
      const was = visible
      visible = v
      if (v && !was && get().keys) { clockSyncedAt = 0; startPolling() }
    },
  }
})
