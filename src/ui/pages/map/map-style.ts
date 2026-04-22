// Protomaps hosted basemap styles. MapLibre accepts a URL string as `style`
// and fetches the style JSON itself, which in turn points at the MVT tile
// endpoint (https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=...).
//
// The key is a client-side token; restrict allowed referrers on the Protomaps
// dashboard to prevent misuse.
const PROTOMAPS_KEY = '0e7717528a551f65'

export const PROTOMAPS_STYLE_LIGHT =
  `https://api.protomaps.com/styles/v5/light/en.json?key=${PROTOMAPS_KEY}`
export const PROTOMAPS_STYLE_DARK =
  `https://api.protomaps.com/styles/v5/dark/en.json?key=${PROTOMAPS_KEY}`
