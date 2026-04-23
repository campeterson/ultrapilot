import type { TilesetCatalogEntry, Tileset } from '../models'

export interface DownloadProgress {
  receivedBytes: number
  totalBytes: number       // 0 if Content-Length absent — UI shows indeterminate
  fractionComplete: number // 0..1; 0 when totalBytes unknown
}

/** Fetch a PMTiles archive and stream it into a Blob, reporting progress as
 *  chunks arrive. Aborting the AbortSignal cancels the fetch. */
export async function downloadTilesetBlob(
  entry: TilesetCatalogEntry,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Tileset> {
  const res = await fetch(entry.url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${entry.url}`)
  if (!res.body) throw new Error('Response has no body (range requests unsupported?)')

  const headerLen = Number(res.headers.get('content-length') || '0')
  const total = headerLen > 0 ? headerLen : entry.estimatedSizeBytes

  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let received = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    // Slice the backing buffer to ArrayBuffer so TS's Blob types accept it
    // regardless of whether the reader hands us a SharedArrayBuffer-backed view.
    chunks.push(value.slice().buffer as ArrayBuffer)
    received += value.length
    onProgress({
      receivedBytes: received,
      totalBytes: headerLen,
      fractionComplete: total > 0 ? Math.min(1, received / total) : 0,
    })
  }

  const blob = new Blob(chunks, { type: 'application/octet-stream' })
  return {
    id: entry.id,
    name: entry.name,
    bbox: entry.bbox,
    blob,
    sizeBytes: blob.size,
    downloadedAt: new Date().toISOString(),
    sourceUrl: entry.url,
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
