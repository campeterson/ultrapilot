import { create } from 'zustand'
import {
  coverArea, groupTracker, trafficBackoff, trafficPoints, trafficState, withoutOwn, normalizeHex, TRAFFIC_DROP_S,
  type TrafficReason, type TrafficTarget,
} from '../data/logic/traffic-logic'
import { fetchTraffic } from '../data/traffic-api'
import { useSessionStore } from './session-store'
import { useLiveGroupStore } from './live-group-store'
import { useGPSStore } from './gps-store'
import { trackEvent } from '../lib/analytics'

/**
 * ADS-B traffic (docs/10-TRAFFIC.md). Fetched every 5 s only while this phone is
 * active: its session is running or Traffic is switched on, or a group member is
 * tracking. Otherwise nothing is requested at all.
 */
interface TrafficStore {
  /** The Traffic switch: null = automatic (on while a session runs). Resets to automatic when a session starts or ends. */
  manual: boolean | null
  active: boolean
  tracking: boolean
  reason: TrafficReason
  /** Callsign of the group member who turned it on for everyone. */
  groupBy: string | null
  targets: TrafficTarget[]
  /** Date.now() when `targets` arrived. */
  receivedAt: number
  error: string | null

  /** Start watching session / group / GPS (once, from the app shell). */
  init: () => void
  /** Map button / Live Group switch: flip what's happening now. */
  toggle: () => void
  setVisible: (visible: boolean) => void
}

let started = false
let timer: ReturnType<typeof setTimeout> | null = null
let gen = 0
let fails = 0
let visible = true

export const useTrafficStore = create<TrafficStore>((set, get) => {
  const serverNow = () => Date.now() + useLiveGroupStore.getState().offset

  function evaluate() {
    const live = useLiveGroupStore.getState()
    const by = groupTracker(live.members, serverNow())
    const s = trafficState(get().manual, useSessionStore.getState().sessionStatus === 'active', by)
    const wasActive = get().active
    set({ active: s.active, tracking: s.tracking, reason: s.reason, groupBy: by })
    live.setTracking(s.tracking)
    if (s.active && !wasActive) { fails = 0; schedule(0) }
    if (!s.active && wasActive) { stop(); set({ targets: [], error: null }) }
  }

  function stop() {
    gen++
    if (timer) clearTimeout(timer)
    timer = null
  }

  function schedule(ms: number) {
    stop()
    const g = gen
    timer = setTimeout(() => { if (g === gen) void poll() }, ms)
  }

  async function poll() {
    const g = gen
    if (!get().active) return
    if (visible) {
      const live = useLiveGroupStore.getState()
      const pos = useGPSStore.getState().position
      const pts = trafficPoints(pos ? { lat: pos.lat, lon: pos.lon } : null, live.members, serverNow())
      if (pts.length) {
        try {
          const all = await fetchTraffic(coverArea(pts))
          if (g !== gen) return
          const myHex = normalizeHex(live.profile?.hex)
          set({ targets: withoutOwn(all, myHex, live.members, serverNow()), receivedAt: Date.now(), error: null })
          fails = 0
        } catch (e) {
          if (g !== gen) return
          fails++
          set({ error: (e as Error).message })
          // Keep showing targets a little while, then drop them — old traffic misleads
          if ((Date.now() - get().receivedAt) / 1000 > TRAFFIC_DROP_S) set({ targets: [] })
        }
      }
    }
    if (g === gen) schedule(trafficBackoff(fails))
  }

  return {
    manual: null,
    active: false,
    tracking: false,
    reason: 'off',
    groupBy: null,
    targets: [],
    receivedAt: 0,
    error: null,

    init: () => {
      if (started) return
      started = true
      // A session starting or ending puts the switch back to automatic
      useSessionStore.subscribe((s, p) => {
        if (s.sessionStatus !== p.sessionStatus) { set({ manual: null }); evaluate() }
      })
      useLiveGroupStore.subscribe((s, p) => { if (s.members !== p.members) evaluate() })
      evaluate()
    },

    toggle: () => {
      const on = !get().active
      set({ manual: on })
      evaluate()
      trackEvent(on ? 'traffic_on' : 'traffic_off')
    },

    setVisible: (v) => {
      const was = visible
      visible = v
      if (v && !was && get().active) schedule(0)
    },
  }
})
