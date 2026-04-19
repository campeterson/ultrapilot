import { create } from 'zustand'
import { listWaypoints, putWaypoint, deleteWaypoint } from '../data/db'
import type { Waypoint } from '../data/models'
import { useSessionStore } from './session-store'
import { useTimelineStore } from './timeline-store'
import { trackEvent } from '../lib/analytics'
import { buildRouteBundle, downloadBundle } from '../data/logic/route-io'

interface WaypointStore {
  waypoints: Waypoint[]
  loading: boolean
  load: () => Promise<void>
  save: (w: Waypoint) => Promise<void>
  remove: (id: string) => Promise<void>
  shareWaypoint: (id: string) => void
  shareAllWaypoints: () => void
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

  shareWaypoint: (id) => {
    const wp = useWaypointStore.getState().waypoints.find(w => w.id === id)
    if (!wp) return
    const bundle = buildRouteBundle([], [wp])
    const safeName = wp.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    downloadBundle(bundle, `${safeName}.json`)
  },

  shareAllWaypoints: () => {
    const { waypoints } = useWaypointStore.getState()
    const bundle = buildRouteBundle([], waypoints)
    const date = new Date().toISOString().slice(0, 10)
    downloadBundle(bundle, `ultrapilot_waypoints_${date}.json`)
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
