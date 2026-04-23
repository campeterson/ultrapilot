import { create } from 'zustand'
import { listTilesets, putTileset, getTileset, deleteTileset } from '../data/db'
import { TILESET_CATALOG } from '../data/logic/tilesets-catalog'
import { downloadTilesetBlob, type DownloadProgress } from '../data/logic/tileset-download'
import { registerArchive, unregisterArchive } from '../ui/pages/map/pmtiles-protocol'
import type { Tileset, TilesetCatalogEntry, Bbox } from '../data/models'

/** Download status per catalog id. */
export type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; progress: DownloadProgress }
  | { phase: 'error'; message: string }

/** Only the metadata for a downloaded archive lives in Zustand — the Blob
 *  itself stays in IndexedDB and, once registered, inside the PMTiles
 *  Protocol registry. */
export interface TilesetMeta {
  id: string
  name: string
  bbox: Bbox
  sizeBytes: number
  downloadedAt: string
  sourceUrl: string
}

interface TilesetsStore {
  catalog: TilesetCatalogEntry[]
  downloaded: TilesetMeta[]
  downloads: Record<string, DownloadState>
  initialized: boolean

  init: () => Promise<void>
  download: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

function metaFrom(t: Tileset): TilesetMeta {
  return {
    id: t.id, name: t.name, bbox: t.bbox,
    sizeBytes: t.sizeBytes, downloadedAt: t.downloadedAt, sourceUrl: t.sourceUrl,
  }
}

export const useTilesetsStore = create<TilesetsStore>((set, get) => ({
  catalog: TILESET_CATALOG,
  downloaded: [],
  downloads: {},
  initialized: false,

  init: async () => {
    if (get().initialized) return
    const stored = await listTilesets()
    for (const t of stored) registerArchive(t.id, t.blob)
    set({ downloaded: stored.map(metaFrom), initialized: true })
  },

  download: async (id) => {
    const entry = get().catalog.find(c => c.id === id)
    if (!entry) throw new Error(`No catalog entry: ${id}`)
    if (get().downloaded.some(d => d.id === id)) return

    set(s => ({ downloads: { ...s.downloads, [id]: {
      phase: 'downloading',
      progress: { receivedBytes: 0, totalBytes: entry.estimatedSizeBytes, fractionComplete: 0 },
    }}}))

    try {
      const tileset = await downloadTilesetBlob(entry, (progress) => {
        set(s => ({ downloads: { ...s.downloads, [id]: { phase: 'downloading', progress } }}))
      })
      await putTileset(tileset)
      registerArchive(tileset.id, tileset.blob)
      set(s => ({
        downloaded: [metaFrom(tileset), ...s.downloaded.filter(d => d.id !== id)],
        downloads: { ...s.downloads, [id]: { phase: 'idle' } },
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set(s => ({ downloads: { ...s.downloads, [id]: { phase: 'error', message } }}))
    }
  },

  remove: async (id) => {
    const existing = await getTileset(id)
    if (!existing) return
    unregisterArchive(id)
    await deleteTileset(id)
    set(s => ({ downloaded: s.downloaded.filter(d => d.id !== id) }))
  },
}))
