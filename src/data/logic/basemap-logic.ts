// Satellite imagery providers for the raster layer drawn over the street
// basemap. Pure: builds tile source descriptions, no map or fetch.

export type SatelliteProvider = 'usgs' | 'esri' | 'maptiler'
/** The app's maps, each with its own Map / Satellite choice. */
export type MapView = 'flight' | 'plan' | 'zones'

export interface SatelliteProviderInfo {
  id: SatelliteProvider
  label: string
  note: string
  needsKey: boolean
}

export const SATELLITE_PROVIDERS: SatelliteProviderInfo[] = [
  { id: 'usgs', label: 'USGS', note: 'US only · NAIP aerial photos · free, no key', needsKey: false },
  { id: 'esri', label: 'Esri', note: 'Worldwide · needs a free ArcGIS developer API key', needsKey: true },
  { id: 'maptiler', label: 'MapTiler', note: 'Worldwide · needs a free MapTiler API key', needsKey: true },
]

export interface SatelliteSource {
  /** Tile URL templates, or a TileJSON url. */
  tiles?: string[]
  url?: string
  tileSize: number
  maxzoom?: number
  attribution: string
}

/** Tile source for a provider, or null when it needs a key that isn't set. */
export function satelliteSource(provider: SatelliteProvider, key: string): SatelliteSource | null {
  const k = key.trim()
  switch (provider) {
    case 'usgs':
      return {
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256, maxzoom: 16,
        attribution: 'USDA, USGS The National Map: Orthoimagery',
      }
    case 'esri':
      if (!k) return null
      return {
        tiles: [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(k)}`],
        tileSize: 256, maxzoom: 19,
        attribution: 'Powered by Esri · Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      }
    case 'maptiler':
      if (!k) return null
      return {
        url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${encodeURIComponent(k)}`,
        tileSize: 512,
        attribution: '© MapTiler © OpenStreetMap contributors',
      }
  }
}
