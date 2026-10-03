import { create } from 'zustand'
import { getTrackPoints } from '../data/db'
import { prepareReplay, skipGap, type ReplayTrack, type ReplaySpeed } from '../data/logic/replay-logic'
import type { Session } from '../data/models'

interface ReplayStore {
  sessionId: string | null
  originAltMSL: number
  track: ReplayTrack | null
  loading: boolean

  /** True once the user has started or scrubbed a replay (map dims the full track). */
  active: boolean
  playing: boolean
  t: number
  speed: ReplaySpeed

  load: (session: Session) => Promise<void>
  unload: () => void
  play: () => void
  pause: () => void
  stop: () => void
  seek: (t: number) => void
  setSpeed: (s: ReplaySpeed) => void
  /** Advance the clock by real elapsed ms × speed. Called by the UI frame loop. */
  tick: (realDtMs: number) => void
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  sessionId: null,
  originAltMSL: 0,
  track: null,
  loading: false,
  active: false,
  playing: false,
  t: 0,
  speed: 30,

  load: async (session) => {
    set({ sessionId: session.id, originAltMSL: session.originAltMSL, track: null, loading: true, active: false, playing: false })
    const points = await getTrackPoints(session.id)
    if (get().sessionId !== session.id) return  // user moved on
    const track = prepareReplay(points)
    set({ track, loading: false, t: track?.startTs ?? 0 })
  },

  unload: () => set({ sessionId: null, track: null, active: false, playing: false, t: 0 }),

  play: () => {
    const { track, t } = get()
    if (!track) return
    // Restart from the top if we're parked at the end
    const start = t >= track.endTs ? track.startTs : t
    set({ active: true, playing: true, t: start })
  },

  pause: () => set({ playing: false }),

  stop: () => set({ active: false, playing: false, t: get().track?.startTs ?? 0 }),

  seek: (t) => {
    const { track } = get()
    if (!track) return
    set({ active: true, t: Math.min(Math.max(t, track.startTs), track.endTs) })
  },

  setSpeed: (speed) => set({ speed }),

  tick: (realDtMs) => {
    const { track, t, speed, playing } = get()
    if (!track || !playing) return
    let next = skipGap(track, t + realDtMs * speed)
    if (next >= track.endTs) {
      next = track.endTs
      set({ t: next, playing: false })
      return
    }
    set({ t: next })
  },
}))
