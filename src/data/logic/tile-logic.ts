// Web-Mercator tile math for downloading satellite imagery ahead of time. Pure.

export interface TileXYZ { z: number; x: number; y: number }

const NM_TO_M = 1852
const EARTH_R = 6_378_137

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Every tile at zooms zMin…zMax covering a square of ±radiusNM around each
 *  center. Overlapping areas are de-duplicated. */
export function tilesAround(centers: { lat: number; lon: number }[], radiusNM: number, zMin: number, zMax: number): TileXYZ[] {
  const seen = new Set<string>()
  const out: TileXYZ[] = []
  for (const c of centers) {
    const dLat = (radiusNM * NM_TO_M) / EARTH_R * (180 / Math.PI)
    const dLon = dLat / Math.max(0.01, Math.cos((c.lat * Math.PI) / 180))
    for (let z = zMin; z <= zMax; z++) {
      const x0 = lonToTileX(c.lon - dLon, z), x1 = lonToTileX(c.lon + dLon, z)
      const y0 = latToTileY(Math.min(85, c.lat + dLat), z), y1 = latToTileY(Math.max(-85, c.lat - dLat), z)
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${z}/${x}/${y}`
        if (!seen.has(k)) { seen.add(k); out.push({ z, x, y }) }
      }
    }
  }
  return out
}

export function tileUrl(template: string, t: TileXYZ): string {
  return template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
}

/** Typical aerial JPEG tile size, for estimates before downloading. */
export const AVG_SAT_TILE_BYTES = 30_000

export const OFFLINE_RADIUS_OPTIONS_NM = [3, 5, 10] as const
/** Lowest zoom downloaded — wide enough to see the region on the way in. */
export const OFFLINE_MIN_ZOOM = 9
/** Highest zoom downloaded. USGS imagery stops at 16; keyed providers go
 *  deeper but each extra level is ~4× the tiles. */
export const OFFLINE_MAX_ZOOM = 16
