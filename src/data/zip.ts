// Minimal ZIP reader for KMZ import. Reads the central directory and inflates
// with the browser's DecompressionStream — no dependency. Supports stored (0)
// and deflate (8) entries, which is everything KMZ writers produce.

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

export type ZipEntry = {
  name: string
  method: number
  compressedSize: number
  localOffset: number
}

export function isZip(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false
  return new DataView(bytes).getUint32(0, true) === LOCAL_SIG
}

export function listZipEntries(bytes: ArrayBuffer): ZipEntry[] {
  const view = new DataView(bytes)
  // End-of-central-directory record sits in the last 22 bytes + up to 64 KB comment
  let eocd = -1
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP/KMZ file')

  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIG) throw new Error('Corrupt ZIP directory')
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    entries.push({
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
      name: decoder.decode(new Uint8Array(bytes, offset + 46, nameLen)),
    })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

export async function readZipEntry(bytes: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes)
  if (view.getUint32(entry.localOffset, true) !== LOCAL_SIG) throw new Error('Corrupt ZIP entry')
  const nameLen = view.getUint16(entry.localOffset + 26, true)
  const extraLen = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLen + extraLen
  const data = new Uint8Array(bytes, start, entry.compressedSize)

  if (entry.method === 0) return data
  if (entry.method !== 8) throw new Error(`Unsupported ZIP compression (method ${entry.method})`)
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser can\'t open KMZ files — unzip it and import the .kml')
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
