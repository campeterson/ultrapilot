import { create } from 'zustand'
import { listLaunchSites, putLaunchSite, deleteLaunchSite } from '../data/db'
import type { LaunchSite } from '../data/models'
import { trackEvent } from '../lib/analytics'
import { useFlightPlanStore } from './flight-plan-store'

interface LaunchSiteStore {
  sites: LaunchSite[]
  loaded: boolean
  /** Coordinates waiting to be named — set from a map tap, cleared on save/cancel. */
  pending: { lat: number; lon: number } | null
  load: () => Promise<void>
  /** Saves and returns the site. */
  add: (name: string, lat: number, lon: number, elevFt: number | null) => Promise<LaunchSite>
  update: (site: LaunchSite) => Promise<void>
  remove: (id: string) => Promise<void>
  setPending: (p: { lat: number; lon: number } | null) => void
}

function newId() {
  return `ls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export const useLaunchSiteStore = create<LaunchSiteStore>((set, get) => ({
  sites: [],
  loaded: false,
  pending: null,

  load: async () => {
    if (get().loaded) return
    set({ sites: await listLaunchSites(), loaded: true })
  },

  add: async (name, lat, lon, elevFt) => {
    const site: LaunchSite = { id: newId(), name, lat, lon, elevFt, createdAt: new Date().toISOString() }
    await putLaunchSite(site)
    set({ sites: await listLaunchSites(), pending: null })
    trackEvent('launch_site_created')
    return site
  },

  update: async (site) => {
    await putLaunchSite(site)
    useFlightPlanStore.getState().dropForecast(site.id)
    set({ sites: await listLaunchSites() })
  },

  remove: async (id) => {
    await deleteLaunchSite(id)
    useFlightPlanStore.getState().deselectSite(id)
    useFlightPlanStore.getState().dropForecast(id)
    set({ sites: await listLaunchSites() })
  },

  setPending: (pending) => set({ pending }),
}))
