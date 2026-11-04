// Landing zones: ratings, rating guesses for imported areas, and
// point-in-zone lookups (used to say where a drift track ends up). Pure.
import type { Zone, ZoneRating } from '../models'

export const ZONE_RATINGS: { id: ZoneRating; label: string; short: string }[] = [
  { id: 'good',    label: 'Good landing zone', short: 'Good' },
  { id: 'caution', label: 'Caution',           short: 'Caution' },
  { id: 'nogo',    label: 'Do not land',       short: 'No land' },
]

export function zoneRatingLabel(r: ZoneRating): string {
  return ZONE_RATINGS.find(x => x.id === r)?.label ?? r
}

/** Worst first — when zones overlap, the most restrictive one wins. */
const SEVERITY: Record<ZoneRating, number> = { nogo: 3, caution: 2, good: 1 }

// ─── Rating guesses ──────────────────────────────────────────────────────────

/** An explicit rating word in a property value ("red", "nogo", "LZ"…). */
export function ratingFromText(text: string | null | undefined): ZoneRating | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (/\b(no[\s_-]?go|no[\s_-]?land(ing)?|do not land|danger|avoid|prohibited|restricted|warning|red)\b/.test(t)) return 'nogo'
  if (/\b(caution|hazard|marginal|careful|yellow|amber|orange)\b/.test(t)) return 'caution'
  if (/\b(good|safe|lz|landing|land here|ok|green)\b/.test(t)) return 'good'
  return null
}

/** Rating from a fill/stroke color by hue: green → good, yellow/orange →
 *  caution, red → no-go. Gray and blue tell us nothing. */
export function ratingFromColor(r: number, g: number, b: number): ZoneRating | null {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === 0 || (max - min) / max < 0.25) return null   // too gray
  let h: number
  if (max === r) h = ((g - b) / (max - min)) * 60
  else if (max === g) h = (2 + (b - r) / (max - min)) * 60
  else h = (4 + (r - g) / (max - min)) * 60
  h = (h + 360) % 360
  if (h < 20 || h >= 330) return 'nogo'
  if (h < 70) return 'caution'
  if (h < 170) return 'good'
  return null
}

/** "#rrggbb" / "#rgb" → [r, g, b], or null. */
export function parseHexColor(text: string | null | undefined): [number, number, number] | null {
  const m = text?.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (!m) return null
  const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** KML colors are "aabbggrr". */
export function parseKmlColor(text: string | null | undefined): [number, number, number] | null {
  const m = text?.trim().match(/^[0-9a-f]{8}$/i)
  if (!m) return null
  const t = m[0]
  return [parseInt(t.slice(6, 8), 16), parseInt(t.slice(4, 6), 16), parseInt(t.slice(2, 4), 16)]
}

// ─── Geometry ────────────────────────────────────────────────────────────────

function inRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function zoneContains(zone: Zone, lon: number, lat: number): boolean {
  return zone.polygons.some(([outer, ...holes]) =>
    !!outer && inRing(lon, lat, outer) && !holes.some(h => inRing(lon, lat, h)))
}

/** The most restrictive zone containing the point, or null. */
export function zoneAt(zones: Zone[], lon: number, lat: number): Zone | null {
  let best: Zone | null = null
  for (const z of zones) {
    if (zoneContains(z, lon, lat) && (!best || SEVERITY[z.rating] > SEVERITY[best.rating])) best = z
  }
  return best
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

/** Source name for zones drawn in the app (groups them on the Zones page). */
export const DRAWN_SOURCE = 'Drawn on map'

export const MIN_ZONE_POINTS = 3

/** Build a zone from tapped corners ([lon, lat], unclosed). null if < 3 points. */
export function zoneFromPoints(
  id: string, name: string, rating: ZoneRating, points: [number, number][], createdAt: string,
): Zone | null {
  if (points.length < MIN_ZONE_POINTS) return null
  const ring: [number, number][] = [...points, points[0]]
  return { id, name, rating, polygons: [[ring]], source: DRAWN_SOURCE, note: null, createdAt }
}

/** [west, south, east, north] around every zone, or null. */
export function zonesExtent(zones: Zone[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const z of zones) for (const poly of z.polygons) for (const [lon, lat] of poly[0] ?? []) {
    w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat)
  }
  return Number.isFinite(w) ? [w, s, e, n] : null
}
