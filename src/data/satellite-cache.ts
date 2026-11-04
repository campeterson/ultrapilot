// Pre-download satellite tiles into the same Cache Storage the service worker
// serves imagery from, and check what's there. Side-effecting I/O (fetch +
// Cache API), like db.ts — called only from the state layer.
import { SATELLITE_CACHE, type SatelliteSource } from './logic/basemap-logic'
import { tileUrl, type TileXYZ } from './logic/tile-logic'

/** The {z}/{x}/{y} URL template for a source (MapTiler publishes it via TileJSON). */
export async function resolveTemplate(src: SatelliteSource, signal?: AbortSignal): Promise<string> {
  if (src.tiles?.[0]) return src.tiles[0]
  if (!src.url) throw new Error('Imagery source has no tile URL')
  const res = await fetch(src.url, { signal })
  if (!res.ok) throw new Error(`Imagery TileJSON failed (${res.status})`)
  const json = await res.json() as { tiles?: string[] }
  if (!json.tiles?.[0]) throw new Error('Imagery TileJSON has no tiles')
  return json.tiles[0]
}

export interface TileDownloadProgress { done: number; total: number; failed: number; skipped: number; bytes: number }

/** Fetch every tile not already cached, a few at a time. */
export async function downloadTiles(
  template: string, tiles: TileXYZ[], onProgress: (p: TileDownloadProgress) => void, signal: AbortSignal, concurrency = 6,
): Promise<TileDownloadProgress> {
  const cache = await caches.open(SATELLITE_CACHE)
  const p: TileDownloadProgress = { done: 0, total: tiles.length, failed: 0, skipped: 0, bytes: 0 }
  let next = 0
  async function worker() {
    while (next < tiles.length && !signal.aborted) {
      const url = tileUrl(template, tiles[next++])
      try {
        if (await cache.match(url)) p.skipped++
        else {
          const res = await fetch(url, { mode: 'cors', signal })
          if (!res.ok) throw new Error(String(res.status))
          const blob = await res.blob()
          await cache.put(url, new Response(blob, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg' } }))
          p.bytes += blob.size
        }
      } catch {
        if (signal.aborted) return
        p.failed++
      }
      p.done++
      onProgress({ ...p })
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return p
}

/** How many of these tiles are in the cache. */
export async function countCached(template: string, tiles: TileXYZ[]): Promise<number> {
  const cache = await caches.open(SATELLITE_CACHE)
  const keys = new Set((await cache.keys()).map(r => r.url))
  return tiles.filter(t => keys.has(new URL(tileUrl(template, t)).href)).length
}

export async function cachedTileCount(): Promise<number> {
  if (!('caches' in self)) return 0
  return (await (await caches.open(SATELLITE_CACHE)).keys()).length
}

export async function clearSatelliteCache(): Promise<void> {
  await caches.delete(SATELLITE_CACHE)
}

/** Ask the browser not to evict our storage. Returns whether it's persistent. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false
  return { usage, quota, persisted }
}
