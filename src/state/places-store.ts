import { create } from 'zustand'
import { listPlaces, putPlaces, deletePlaces } from '../data/db'
import { downloadText, parsePlaceFile, placesToGeoJSON, placesToKml } from '../data/place-io'
import { launchSitesFrom, newPlaceId, placeAnchor, zonesFrom } from '../data/logic/place-logic'
import { DRAWN_SOURCE, MIN_ZONE_POINTS } from '../data/logic/zone-logic'
import type { LaunchSite, Place, PlaceCategory, Zone, ZoneRating } from '../data/models'
import { useFlightPlanStore } from './flight-plan-store'
import { trackEvent } from '../lib/analytics'

const SETTINGS_KEY = 'ultrapilot_placeSettings'
const LEGACY_ZONE_SETTINGS_KEY = 'ultrapilot_zoneSettings'
export const ADDED_SOURCE = 'Added'

interface Settings {
  /** Draw places on the flying map as well as the plan and places maps. */
  showOnFlightMap: boolean
  /** Category for imported areas whose name/color doesn't say. */
  defaultRating: ZoneRating
}

function loadSettings(): Settings {
  const d: Settings = { showOnFlightMap: true, defaultRating: 'caution' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_ZONE_SETTINGS_KEY)
    if (raw) return { ...d, ...JSON.parse(raw) }
  } catch {}
  return d
}

/** A point being created from a map tap, with suggestions (e.g. an airport's elevation). */
export interface PendingPlace {
  lat: number
  lon: number
  name?: string
  elevFt?: number | null
  category?: PlaceCategory
}

export type PlaceFormat = 'geojson' | 'kml'

interface PlacesStore extends Settings {
  places: Place[]
  /** Launch-category places as flight-plan launch sites. */
  launchSites: LaunchSite[]
  /** Rated areas as zones. */
  zones: Zone[]
  loaded: boolean
  pending: PendingPlace | null

  load: () => Promise<void>
  addPoint: (name: string, category: PlaceCategory, lat: number, lon: number, elevFt: number | null) => Promise<Place>
  /** false if fewer than 3 corners. */
  addArea: (name: string, category: PlaceCategory, points: [number, number][]) => Promise<boolean>
  update: (id: string, patch: { name?: string; category?: PlaceCategory; elevFt?: number | null; lat?: number; lon?: number }) => Promise<void>
  remove: (id: string) => Promise<void>
  removeSource: (source: string) => Promise<void>
  importFile: (file: File) => Promise<string>
  exportPlaces: (format: PlaceFormat, places: Place[], name: string) => void
  setPending: (p: PendingPlace | null) => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

/** Flight-plan side effects when a launch site goes away or moves. */
function forgetForPlan(id: string, deselect: boolean) {
  const plan = useFlightPlanStore.getState()
  if (deselect) plan.deselectSite(id)
  plan.dropForecast(id)
}

export const usePlacesStore = create<PlacesStore>((set, get) => {
  async function reload() {
    const places = await listPlaces()
    set({ places, launchSites: launchSitesFrom(places), zones: zonesFrom(places) })
  }

  return {
    ...loadSettings(),
    places: [],
    launchSites: [],
    zones: [],
    loaded: false,
    pending: null,

    load: async () => {
      if (get().loaded) return
      await reload()
      set({ loaded: true })
    },

    addPoint: async (name, category, lat, lon, elevFt) => {
      const place: Place = { id: newPlaceId(), name, category, geometry: { type: 'Point', coordinates: [lon, lat] },
        elevFt, note: null, source: ADDED_SOURCE, createdAt: new Date().toISOString() }
      await putPlaces([place])
      await reload()
      set({ pending: null })
      // A new launch site joins the plan if there's room
      if (category === 'launch') useFlightPlanStore.getState().toggleSite(place.id)
      trackEvent('place_added')
      return place
    },

    addArea: async (name, category, points) => {
      if (points.length < MIN_ZONE_POINTS) return false
      const place: Place = { id: newPlaceId(), name, category, geometry: { type: 'MultiPolygon', coordinates: [[[...points, points[0]]]] },
        elevFt: null, note: null, source: DRAWN_SOURCE, createdAt: new Date().toISOString() }
      await putPlaces([place])
      await reload()
      if (category === 'launch') useFlightPlanStore.getState().toggleSite(place.id)
      trackEvent('place_drawn')
      return true
    },

    update: async (id, patch) => {
      const p = get().places.find(x => x.id === id)
      if (!p) return
      const next: Place = { ...p }
      if (patch.name !== undefined) next.name = patch.name
      if (patch.category !== undefined) next.category = patch.category
      if (patch.elevFt !== undefined) next.elevFt = patch.elevFt
      if (patch.lat !== undefined && patch.lon !== undefined && p.geometry.type === 'Point') {
        next.geometry = { type: 'Point', coordinates: [patch.lon, patch.lat] }
      }
      await putPlaces([next])
      await reload()
      const [lon0, lat0] = placeAnchor(p), [lon1, lat1] = placeAnchor(next)
      const moved = lon0 !== lon1 || lat0 !== lat1 || p.elevFt !== next.elevFt
      if (p.category === 'launch' && next.category !== 'launch') forgetForPlan(id, true)
      else if (moved) forgetForPlan(id, false)
    },

    remove: async (id) => {
      await deletePlaces([id])
      await reload()
      forgetForPlan(id, true)
    },

    removeSource: async (source) => {
      const ids = get().places.filter(p => p.source === source).map(p => p.id)
      await deletePlaces(ids)
      await reload()
      ids.forEach(id => forgetForPlan(id, true))
    },

    importFile: async (file) => {
      try {
        const { places, skipped } = await parsePlaceFile(file.name, await file.arrayBuffer(), get().defaultRating)
        const have = new Set(get().places.map(p => p.id))
        const fresh = places.filter(p => !have.has(p.id))
        const dupes = places.length - fresh.length
        if (fresh.length) await putPlaces(fresh)
        await reload()
        trackEvent('places_imported')
        const pts = fresh.filter(p => p.geometry.type === 'Point').length
        const parts = [`Imported ${pts} point${pts === 1 ? '' : 's'}, ${fresh.length - pts} area${fresh.length - pts === 1 ? '' : 's'}`]
        if (dupes) parts.push(`${dupes} already here`)
        if (skipped) parts.push(`${skipped} line/other feature${skipped === 1 ? '' : 's'} skipped`)
        return parts.join(' · ')
      } catch (e) {
        return `Import failed: ${(e as Error).message}`
      }
    },

    exportPlaces: (format, places, name) => {
      const date = new Date().toISOString().slice(0, 10)
      const safe = name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'places'
      if (format === 'kml') downloadText(placesToKml(places, name), `${safe}_${date}.kml`, 'application/vnd.google-earth.kml+xml')
      else downloadText(placesToGeoJSON(places), `${safe}_${date}.geojson`, 'application/geo+json')
      trackEvent(`places_export_${format}`)
    },

    setPending: (pending) => set({ pending }),

    setSetting: (key, value) => {
      set({ [key]: value } as Partial<PlacesStore>)
      const { showOnFlightMap, defaultRating } = get()
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showOnFlightMap, defaultRating })) } catch {}
    },
  }
})
