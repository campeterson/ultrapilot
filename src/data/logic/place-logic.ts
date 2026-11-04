// Places: points and areas a pilot saves, each with a category. Launch sites
// and rated zones are views of places, so the flight plan and zone checks keep
// working on their own simple types. Pure.
import type { LaunchSite, Place, PlaceCategory, Zone, ZoneRating } from '../models'
import { ratingFromText } from './zone-logic'

export const PLACE_CATEGORIES: { id: PlaceCategory; label: string; short: string }[] = [
  { id: 'launch',  label: 'Launch site',       short: 'Launch' },
  { id: 'good',    label: 'Good landing zone', short: 'Good' },
  { id: 'caution', label: 'Caution',           short: 'Caution' },
  { id: 'nogo',    label: 'Do not land',       short: 'No land' },
  { id: 'poi',     label: 'Point of interest', short: 'POI' },
]

export function categoryLabel(c: PlaceCategory): string {
  return PLACE_CATEGORIES.find(x => x.id === c)?.label ?? c
}

export function isPlaceCategory(v: unknown): v is PlaceCategory {
  return typeof v === 'string' && PLACE_CATEGORIES.some(c => c.id === v)
}

export const isArea = (p: Place) => p.geometry.type === 'MultiPolygon'
const isRating = (c: PlaceCategory): c is ZoneRating => c === 'good' || c === 'caution' || c === 'nogo'

/** A place's single position: the point, or an area's first corner. */
export function placeAnchor(p: Place): [number, number] {
  return p.geometry.type === 'Point' ? p.geometry.coordinates : p.geometry.coordinates[0][0][0]
}

export function launchSitesFrom(places: Place[]): LaunchSite[] {
  return places.filter(p => p.category === 'launch').map(p => {
    const [lon, lat] = placeAnchor(p)
    return { id: p.id, name: p.name, lat, lon, elevFt: p.elevFt, createdAt: p.createdAt }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/** Rated areas, for point-in-zone checks and zone drawing. */
export function zonesFrom(places: Place[]): Zone[] {
  const out: Zone[] = []
  for (const p of places) {
    if (p.geometry.type !== 'MultiPolygon' || !isRating(p.category)) continue
    out.push({ id: p.id, name: p.name, rating: p.category, polygons: p.geometry.coordinates, source: p.source, note: p.note, createdAt: p.createdAt })
  }
  return out
}

/** Category hinted by a name/description/property, or null. */
export function categoryFromText(text: string | null | undefined): PlaceCategory | null {
  if (!text) return null
  if (/\b(launch(\s*site)?|take[\s-]?off|lp)\b/i.test(text)) return 'launch'
  return ratingFromText(text)
}

// ─── Migration from the earlier separate stores ─────────────────────────────

export function placeFromLaunchSite(s: LaunchSite): Place {
  return { id: s.id, name: s.name, category: 'launch', geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    elevFt: s.elevFt, note: null, source: 'Added', createdAt: s.createdAt }
}

export function placeFromZone(z: Zone): Place {
  return { id: z.id, name: z.name, category: z.rating, geometry: { type: 'MultiPolygon', coordinates: z.polygons },
    elevFt: null, note: z.note, source: z.source, createdAt: z.createdAt }
}

/** [west, south, east, north] around every place's coordinates, or null. */
export function placesExtent(places: Place[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  const add = ([lon, lat]: [number, number]) => { w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat) }
  for (const p of places) {
    if (p.geometry.type === 'Point') add(p.geometry.coordinates)
    else for (const poly of p.geometry.coordinates) (poly[0] ?? []).forEach(add)
  }
  return Number.isFinite(w) ? [w, s, e, n] : null
}

export function newPlaceId(): string {
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
