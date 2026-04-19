import { create } from 'zustand'
import type { Route, Waypoint } from '../data/models'
import { listRoutes, putRoute, deleteRoute as dbDeleteRoute, importBundle } from '../data/db'
import { useDirectToStore } from './direct-to-store'
import { useWaypointStore } from './waypoint-store'
import { buildRouteBundle, downloadBundle, parseBundle } from '../data/logic/route-io'

const AUTO_ADVANCE_NM = 0.1
const LS_KEY = 'ultrapilot_activeRoute'

interface ActiveRoute {
  routeId: string
  legIndex: number
  /** DTE seen on a previous tick > AUTO_ADVANCE_NM — prevents instant-skip at start */
  hadDistance: boolean
}

function saveActive(a: ActiveRoute | null) {
  if (a) localStorage.setItem(LS_KEY, JSON.stringify(a))
  else localStorage.removeItem(LS_KEY)
}

function loadActive(): ActiveRoute | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function newId() {
  return `rt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

interface RouteStore {
  routes: Route[]
  loading: boolean
  active: ActiveRoute | null
  previewRouteId: string | null

  load: () => Promise<void>
  createRoute: (name: string, waypointIds: string[]) => Promise<Route>
  updateRoute: (id: string, name: string, waypointIds: string[]) => Promise<void>
  removeRoute: (id: string) => Promise<void>

  setPreview: (id: string | null) => void
  activateRoute: (routeId: string, fromLat: number, fromLon: number) => void
  deactivateRoute: () => void
  nextLeg: (fromLat: number, fromLon: number) => void
  prevLeg: (fromLat: number, fromLon: number) => void
  checkAutoAdvance: (dteNM: number | null, fromLat: number, fromLon: number) => void
  jumpToLeg: (routeId: string, legIndex: number, fromLat: number, fromLon: number) => void

  /** Returns ordered Waypoint[] for a given routeId, or [] */
  waypointsForRoute: (routeId: string) => Waypoint[]
  activeRoute: () => Route | null
  activeLeg: () => Waypoint | null

  /** Download this route + its waypoints as a shareable JSON file */
  shareRoute: (routeId: string) => void
  /** Download all routes + all waypoints as a shareable JSON file */
  shareAll: () => void
  /** Read a .json file and import any routes/waypoints not already present. Returns a summary string. */
  importFile: (file: File) => Promise<string>
}

function pushDirectTo(wp: Waypoint, fromLat: number, fromLon: number) {
  useDirectToStore.getState().setTarget({
    lat: wp.lat,
    lon: wp.lon,
    name: wp.name,
    fromLat,
    fromLon,
  })
}

export const useRouteStore = create<RouteStore>((set, get) => ({
  routes: [],
  loading: false,
  active: loadActive(),
  previewRouteId: null,

  load: async () => {
    set({ loading: true })
    const routes = await listRoutes()
    set({ routes, loading: false })
  },

  createRoute: async (name, waypointIds) => {
    const now = new Date().toISOString()
    const route: Route = { id: newId(), name, waypointIds, createdAt: now, updatedAt: now }
    await putRoute(route)
    set(s => ({ routes: [route, ...s.routes] }))
    return route
  },

  updateRoute: async (id, name, waypointIds) => {
    const updatedAt = new Date().toISOString()
    set(s => {
      const routes = s.routes.map(r => r.id === id ? { ...r, name, waypointIds, updatedAt } : r)
      putRoute(routes.find(r => r.id === id)!)
      return { routes }
    })
  },

  removeRoute: async (id) => {
    await dbDeleteRoute(id)
    set(s => {
      const active = s.active?.routeId === id ? null : s.active
      if (!active) saveActive(null)
      return { routes: s.routes.filter(r => r.id !== id), active }
    })
  },

  setPreview: (id) => set({ previewRouteId: id }),

  activateRoute: (routeId, fromLat, fromLon) => {
    const { routes } = get()
    const route = routes.find(r => r.id === routeId)
    if (!route || route.waypointIds.length === 0) return
    const wps = useWaypointStore.getState().waypoints
    const firstWp = wps.find(w => w.id === route.waypointIds[0])
    if (!firstWp) return
    const active: ActiveRoute = { routeId, legIndex: 0, hadDistance: false }
    saveActive(active)
    set({ active, previewRouteId: null })
    pushDirectTo(firstWp, fromLat, fromLon)
  },

  deactivateRoute: () => {
    saveActive(null)
    set({ active: null })
    useDirectToStore.getState().clearTarget()
  },

  nextLeg: (fromLat, fromLon) => {
    const { active, routes } = get()
    if (!active) return
    const route = routes.find(r => r.id === active.routeId)
    if (!route) return
    const nextIndex = active.legIndex + 1
    if (nextIndex >= route.waypointIds.length) {
      get().deactivateRoute()
      return
    }
    const wp = useWaypointStore.getState().waypoints.find(w => w.id === route.waypointIds[nextIndex])
    if (!wp) return
    const next: ActiveRoute = { routeId: active.routeId, legIndex: nextIndex, hadDistance: false }
    saveActive(next)
    set({ active: next })
    pushDirectTo(wp, fromLat, fromLon)
  },

  prevLeg: (fromLat, fromLon) => {
    const { active, routes } = get()
    if (!active) return
    const route = routes.find(r => r.id === active.routeId)
    if (!route) return
    const prevIndex = Math.max(0, active.legIndex - 1)
    const wp = useWaypointStore.getState().waypoints.find(w => w.id === route.waypointIds[prevIndex])
    if (!wp) return
    const prev: ActiveRoute = { routeId: active.routeId, legIndex: prevIndex, hadDistance: false }
    saveActive(prev)
    set({ active: prev })
    pushDirectTo(wp, fromLat, fromLon)
  },

  jumpToLeg: (routeId, legIndex, fromLat, fromLon) => {
    const { routes } = get()
    const route = routes.find(r => r.id === routeId)
    if (!route || legIndex >= route.waypointIds.length) return
    const wp = useWaypointStore.getState().waypoints.find(w => w.id === route.waypointIds[legIndex])
    if (!wp) return
    const active: ActiveRoute = { routeId, legIndex, hadDistance: false }
    saveActive(active)
    set({ active, previewRouteId: null })
    pushDirectTo(wp, fromLat, fromLon)
  },

  checkAutoAdvance: (dteNM, fromLat, fromLon) => {
    const { active } = get()
    if (!active || dteNM === null) return
    if (!active.hadDistance && dteNM > AUTO_ADVANCE_NM) {
      // Mark that we've seen distance — now eligible to auto-advance
      const updated = { ...active, hadDistance: true }
      saveActive(updated)
      set({ active: updated })
      return
    }
    if (active.hadDistance && dteNM <= AUTO_ADVANCE_NM) {
      get().nextLeg(fromLat, fromLon)
    }
  },

  waypointsForRoute: (routeId) => {
    const { routes } = get()
    const route = routes.find(r => r.id === routeId)
    if (!route) return []
    const wps = useWaypointStore.getState().waypoints
    return route.waypointIds
      .map(id => wps.find(w => w.id === id))
      .filter((w): w is Waypoint => !!w)
  },

  activeRoute: () => {
    const { active, routes } = get()
    return active ? (routes.find(r => r.id === active.routeId) ?? null) : null
  },

  activeLeg: () => {
    const { active } = get()
    if (!active) return null
    const wps = get().waypointsForRoute(active.routeId)
    return wps[active.legIndex] ?? null
  },

  shareRoute: (routeId) => {
    const { routes } = get()
    const route = routes.find(r => r.id === routeId)
    if (!route) return
    const allWps = useWaypointStore.getState().waypoints
    const routeWps = route.waypointIds
      .map(id => allWps.find(w => w.id === id))
      .filter((w): w is Waypoint => !!w)
    const bundle = buildRouteBundle([route], routeWps)
    const safeName = route.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    downloadBundle(bundle, `${safeName}.json`)
  },

  shareAll: () => {
    const { routes } = get()
    const allWps = useWaypointStore.getState().waypoints
    const bundle = buildRouteBundle(routes, allWps)
    const date = new Date().toISOString().slice(0, 10)
    downloadBundle(bundle, `ultrapilot_routes_${date}.json`)
  },

  importFile: async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const raw = JSON.parse(e.target?.result as string)
          const result = parseBundle(raw)
          if (!result.ok) { resolve(`Import failed: ${result.error}`); return }
          const { waypointsAdded, routesAdded } = await importBundle(
            result.bundle.waypoints,
            result.bundle.routes,
          )
          // Reload both stores so UI reflects new data
          await get().load()
          await useWaypointStore.getState().load()
          const parts: string[] = []
          if (routesAdded > 0) parts.push(`${routesAdded} route${routesAdded === 1 ? '' : 's'}`)
          if (waypointsAdded > 0) parts.push(`${waypointsAdded} waypoint${waypointsAdded === 1 ? '' : 's'}`)
          if (parts.length === 0) resolve('Nothing new — all items already exist.')
          else resolve(`Imported ${parts.join(' and ')}.`)
        } catch {
          resolve('Import failed: invalid JSON file.')
        }
      }
      reader.readAsText(file)
    })
  },
}))
