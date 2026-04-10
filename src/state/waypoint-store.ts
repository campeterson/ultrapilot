import { create } from 'zustand'
import { listWaypoints, putWaypoint, deleteWaypoint } from '../data/db'
import type { Waypoint } from '../data/models'
import { useSessionStore } from './session-store'
import { useTimelineStore } from './timeline-store'
import { trackEvent } from '../lib/analytics'

interface WaypointStore {
  waypoints: Waypoint[]
  loading: boolean
  load: () => Promise<void>
  save: (w: Waypoint) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useWaypointStore = create<WaypointStore>((set) => ({
  waypoints: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const waypoints = await listWaypoints()
    set({ waypoints, loading: false })
  },

  save: async (w) => {
    await putWaypoint(w)
    const waypoints = await listWaypoints()
    set({ waypoints })
    stampWaypoint(w)
    trackEvent('waypoint_created')
  },

  remove: async (id) => {
    await deleteWaypoint(id)
    const waypoints = await listWaypoints()
    set({ waypoints })
  },
}))

function stampWaypoint(w: Waypoint) {
  const { session } = useSessionStore.getState()
  if (!session) return
  useTimelineStore.getState().addStamp({
    sessionId: session.id,
    ts: Date.now(),
    type: 'waypoint',
    lat: w.lat,
    lon: w.lon,
    altMSL: 0,
    altAGL: 0,
    speed: 0,
    note: w.name,
  })
}
