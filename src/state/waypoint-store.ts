import { create } from 'zustand'
import { listWaypoints, putWaypoint, deleteWaypoint } from '../data/db'
import type { Waypoint } from '../data/models'

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
  },

  remove: async (id) => {
    await deleteWaypoint(id)
    const waypoints = await listWaypoints()
    set({ waypoints })
  },
}))
