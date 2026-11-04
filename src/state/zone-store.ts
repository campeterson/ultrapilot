import { create } from 'zustand'
import { listZones, putZones, deleteZones } from '../data/db'
import { parseZoneFile } from '../data/zone-import'
import type { Zone, ZoneRating } from '../data/models'
import { zoneFromPoints } from '../data/logic/zone-logic'
import { trackEvent } from '../lib/analytics'

const SETTINGS_KEY = 'ultrapilot_zoneSettings'

interface Settings {
  /** Draw zones on the main (flying) map as well as the plan map. */
  showOnFlightMap: boolean
  /** Rating for imported areas whose name/color doesn't say. */
  defaultRating: ZoneRating
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { showOnFlightMap: true, defaultRating: 'caution', ...JSON.parse(raw) }
  } catch {}
  return { showOnFlightMap: true, defaultRating: 'caution' }
}

interface ZoneStore extends Settings {
  zones: Zone[]
  loaded: boolean
  load: () => Promise<void>
  /** Returns a status message for the UI. */
  importFile: (file: File) => Promise<string>
  /** Save a zone drawn on the map. false if it has fewer than 3 corners. */
  addDrawn: (name: string, rating: ZoneRating, points: [number, number][]) => Promise<boolean>
  setRating: (id: string, rating: ZoneRating) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  removeSource: (source: string) => Promise<void>
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export const useZoneStore = create<ZoneStore>((set, get) => {
  async function update(id: string, patch: Partial<Zone>) {
    const z = get().zones.find(x => x.id === id)
    if (!z) return
    await putZones([{ ...z, ...patch }])
    set({ zones: await listZones() })
  }

  return {
    ...loadSettings(),
    zones: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return
      set({ zones: await listZones(), loaded: true })
    },

    importFile: async (file) => {
      try {
        const { zones, skipped } = await parseZoneFile(file.name, await file.arrayBuffer(), get().defaultRating)
        if (zones.length === 0) return skipped ? `No areas found — ${skipped} point/line feature${skipped === 1 ? '' : 's'} skipped` : 'No areas found in file'
        await putZones(zones)
        set({ zones: await listZones() })
        trackEvent('zones_imported')
        const extra = skipped ? ` (${skipped} point/line feature${skipped === 1 ? '' : 's'} skipped)` : ''
        return `Imported ${zones.length} zone${zones.length === 1 ? '' : 's'}${extra}`
      } catch (e) {
        return `Import failed: ${(e as Error).message}`
      }
    },

    addDrawn: async (name, rating, points) => {
      const id = `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const zone = zoneFromPoints(id, name, rating, points, new Date().toISOString())
      if (!zone) return false
      await putZones([zone])
      set({ zones: await listZones() })
      trackEvent('zone_drawn')
      return true
    },

    setRating: (id, rating) => update(id, { rating }),
    rename: (id, name) => update(id, { name }),

    remove: async (id) => {
      await deleteZones([id])
      set({ zones: await listZones() })
    },

    removeSource: async (source) => {
      await deleteZones(get().zones.filter(z => z.source === source).map(z => z.id))
      set({ zones: await listZones() })
    },

    setSetting: (key, value) => {
      set({ [key]: value } as Partial<ZoneStore>)
      const { showOnFlightMap, defaultRating } = get()
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showOnFlightMap, defaultRating })) } catch {}
    },
  }
})
