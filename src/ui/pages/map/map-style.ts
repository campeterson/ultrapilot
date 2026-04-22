import type { StyleSpecification } from 'maplibre-gl'
import { layers, namedTheme } from 'protomaps-themes-base'

// Protomaps hosted basemap — vector tiles served from a single PMTiles archive.
// The key is a client-side token; restrict allowed referrers on the Protomaps
// dashboard to prevent misuse.
const PROTOMAPS_KEY = '0e7717528a551f65'
const PROTOMAPS_PMTILES_URL = `https://api.protomaps.com/tiles/v4.pmtiles?key=${PROTOMAPS_KEY}`

const PROTOMAPS_ATTRIBUTION =
  '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>'

// Protomaps hosts matching fonts and sprite sets on GitHub Pages.
const PROTOMAPS_GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'
const PROTOMAPS_SPRITE = 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark'

function buildStyle(flavor: 'dark' | 'light'): StyleSpecification {
  const theme = namedTheme(flavor)
  return {
    version: 8,
    glyphs: PROTOMAPS_GLYPHS,
    sprite: flavor === 'dark'
      ? PROTOMAPS_SPRITE
      : 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${PROTOMAPS_PMTILES_URL}`,
        attribution: PROTOMAPS_ATTRIBUTION,
      },
    },
    layers: layers('protomaps', theme, { lang: 'en' }),
  }
}

export const PROTOMAPS_STYLE_DARK = buildStyle('dark')
export const PROTOMAPS_STYLE_LIGHT = buildStyle('light')
