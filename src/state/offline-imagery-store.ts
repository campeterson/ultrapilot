import { create } from 'zustand'
import { satelliteSource } from '../data/logic/basemap-logic'
import { OFFLINE_MAX_ZOOM, OFFLINE_MIN_ZOOM, tilesAround, type TileXYZ } from '../data/logic/tile-logic'
import {
  cachedTileCount, clearSatelliteCache, countCached, downloadTiles, requestPersistentStorage, resolveTemplate,
  storageEstimate, type TileDownloadProgress,
} from '../data/satellite-cache'
import type { LaunchSite } from '../data/models'
import { useBasemapStore } from './basemap-store'
import { trackEvent } from '../lib/analytics'

export interface SiteCoverage { siteId: string; name: string; cached: number; total: number }

interface OfflineImageryStore {
  radiusNM: number
  downloading: boolean
  progress: TileDownloadProgress | null
  message: string | null
  coverage: SiteCoverage[] | null
  checking: boolean
  stats: { tiles: number; usage: number; quota: number; persisted: boolean } | null

  setRadius: (nm: number) => void
  download: (sites: LaunchSite[]) => Promise<void>
  cancel: () => void
  checkCoverage: (sites: LaunchSite[]) => Promise<void>
  refreshStats: () => Promise<void>
  clear: () => Promise<void>
}

let abort: AbortController | null = null

/** The current provider's source + zoom range, or an error message. */
function currentSource() {
  const { provider, keys } = useBasemapStore.getState()
  const src = satelliteSource(provider, provider === 'usgs' ? '' : keys[provider])
  if (!src) return { error: 'Add your satellite API key in Settings first' } as const
  return { src, zMax: Math.min(OFFLINE_MAX_ZOOM, src.maxzoom ?? OFFLINE_MAX_ZOOM) } as const
}

/** Tiles a download around these sites would cover, for the estimate. */
export function tilesForSites(sites: LaunchSite[], radiusNM: number): TileXYZ[] {
  const cur = currentSource()
  return tilesAround(sites, radiusNM, OFFLINE_MIN_ZOOM, 'error' in cur ? OFFLINE_MAX_ZOOM : cur.zMax)
}

export const useOfflineImageryStore = create<OfflineImageryStore>((set, get) => ({
  radiusNM: 5,
  downloading: false,
  progress: null,
  message: null,
  coverage: null,
  checking: false,
  stats: null,

  setRadius: (radiusNM) => set({ radiusNM, coverage: null }),

  download: async (sites) => {
    if (get().downloading || sites.length === 0) return
    const cur = currentSource()
    if ('error' in cur) { set({ message: cur.error ?? null }); return }
    abort = new AbortController()
    set({ downloading: true, message: null, progress: null, coverage: null })
    try {
      // Keep the browser from clearing these tiles under storage pressure
      await requestPersistentStorage()
      const template = await resolveTemplate(cur.src, abort.signal)
      const tiles = tilesAround(sites, get().radiusNM, OFFLINE_MIN_ZOOM, cur.zMax)
      const p = await downloadTiles(template, tiles, progress => set({ progress }), abort.signal)
      const cancelled = abort.signal.aborted
      set({
        downloading: false,
        message: cancelled ? 'Download cancelled — tiles saved so far are kept.'
          : p.failed ? `Done with ${p.failed} failed tile${p.failed === 1 ? '' : 's'} — run it again to retry them.`
          : 'Done — imagery for these areas is saved on this device.',
      })
      trackEvent('satellite_offline_download')
    } catch (e) {
      set({ downloading: false, message: abort?.signal.aborted ? 'Download cancelled.' : `Download failed: ${(e as Error).message}` })
    }
    abort = null
    await get().refreshStats()
    await get().checkCoverage(sites)
  },

  cancel: () => abort?.abort(),

  checkCoverage: async (sites) => {
    const cur = currentSource()
    if ('error' in cur) { set({ message: cur.error ?? null }); return }
    set({ checking: true })
    try {
      const template = await resolveTemplate(cur.src)
      const coverage: SiteCoverage[] = []
      for (const s of sites) {
        const tiles = tilesAround([s], get().radiusNM, OFFLINE_MIN_ZOOM, cur.zMax)
        coverage.push({ siteId: s.id, name: s.name, cached: await countCached(template, tiles), total: tiles.length })
      }
      set({ coverage, checking: false })
    } catch (e) {
      set({ checking: false, message: `Check failed: ${(e as Error).message}` })
    }
  },

  refreshStats: async () => {
    const [tiles, est] = await Promise.all([cachedTileCount(), storageEstimate()])
    set({ stats: { tiles, usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted: est?.persisted ?? false } })
  },

  clear: async () => {
    await clearSatelliteCache()
    set({ coverage: null, message: 'Satellite imagery cleared from this device.' })
    await get().refreshStats()
  },
}))
