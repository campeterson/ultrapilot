// Parse zone areas from KML, KMZ, or GeoJSON. Only areas (Polygon /
// MultiPolygon) become zones; points and lines are counted and skipped.
// Each area's rating is guessed from its name/properties, then its
// style color, else the default the user picked for the import.
import type { Zone, ZoneRating } from './models'
import { kmzToKml } from './import'
import { isZip } from './zip'
import { parseHexColor, parseKmlColor, ratingFromColor, ratingFromText } from './logic/zone-logic'

export interface ZoneImportResult {
  zones: Zone[]
  /** Points/lines that aren't areas. */
  skipped: number
}

type Ring = [number, number][]
type Polygon = Ring[]
interface RawArea { name: string | null; note: string | null; polygons: Polygon[]; rating: ZoneRating | null }

function newId(i: number) {
  return `zone-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`
}

function closeRing(ring: Ring): Ring | null {
  const pts = ring.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (pts.length < 3) return null
  const [a, b] = [pts[0], pts[pts.length - 1]]
  return a[0] === b[0] && a[1] === b[1] ? pts : [...pts, a]
}

// ─── KML ─────────────────────────────────────────────────────────────────────

function kmlRing(el: Element | undefined): Ring | null {
  const text = el?.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent ?? ''
  const pts = text.trim().split(/\s+/).map(t => t.split(',').map(Number)).map(([lon, lat]) => [lon, lat] as [number, number])
  return closeRing(pts)
}

function kmlPolygon(poly: Element): Polygon | null {
  const outerEl = Array.from(poly.children).find(c => c.localName === 'outerBoundaryIs')
  const outer = kmlRing(outerEl)
  if (!outer) return null
  const holes = Array.from(poly.children).filter(c => c.localName === 'innerBoundaryIs')
    .map(kmlRing).filter((r): r is Ring => !!r)
  return [outer, ...holes]
}

/** Resolve a Placemark's polygon color: inline Style, or styleUrl → Style /
 *  StyleMap(normal) → Style. PolyStyle color first, then LineStyle. */
function kmlColor(doc: Document, pm: Element): [number, number, number] | null {
  const byId = (id: string) => Array.from(doc.getElementsByTagNameNS('*', '*')).find(e => e.getAttribute('id') === id)
  const colorOf = (style: Element | undefined | null): [number, number, number] | null => {
    if (!style) return null
    for (const kind of ['PolyStyle', 'LineStyle']) {
      const c = style.getElementsByTagNameNS('*', kind)[0]?.getElementsByTagNameNS('*', 'color')[0]?.textContent
      const rgb = parseKmlColor(c)
      if (rgb) return rgb
    }
    return null
  }
  const inline = colorOf(Array.from(pm.children).find(c => c.localName === 'Style'))
  if (inline) return inline
  const url = Array.from(pm.children).find(c => c.localName === 'styleUrl')?.textContent?.trim()
  if (!url?.startsWith('#')) return null
  let style = byId(url.slice(1))
  if (style?.localName === 'StyleMap') {
    const pair = Array.from(style.getElementsByTagNameNS('*', 'Pair'))
      .find(p => p.getElementsByTagNameNS('*', 'key')[0]?.textContent?.trim() === 'normal')
    const inner = pair?.getElementsByTagNameNS('*', 'styleUrl')[0]?.textContent?.trim()
    style = inner?.startsWith('#') ? byId(inner.slice(1)) : pair?.getElementsByTagNameNS('*', 'Style')[0]
  }
  return colorOf(style)
}

function parseKml(text: string): { areas: RawArea[]; skipped: number } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Invalid KML XML')
  const areas: RawArea[] = []
  let skipped = 0
  for (const pm of Array.from(doc.getElementsByTagNameNS('*', 'Placemark'))) {
    const polygons = Array.from(pm.getElementsByTagNameNS('*', 'Polygon')).map(kmlPolygon).filter((p): p is Polygon => !!p)
    if (polygons.length === 0) { skipped++; continue }
    const child = (n: string) => Array.from(pm.children).find(c => c.localName === n)?.textContent?.trim() || null
    const name = child('name')
    const note = child('description')?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null
    const rgb = kmlColor(doc, pm)
    areas.push({ name, note, polygons, rating: ratingFromText(name) ?? ratingFromText(note) ?? (rgb ? ratingFromColor(...rgb) : null) })
  }
  return { areas, skipped }
}

// ─── GeoJSON ─────────────────────────────────────────────────────────────────

interface GeoFeature { type: string; geometry?: { type: string; coordinates: unknown; geometries?: unknown[] } | null; properties?: Record<string, unknown> | null }

function geoPolygons(geom: GeoFeature['geometry']): Polygon[] | null {
  if (!geom) return null
  const toPoly = (rings: unknown): Polygon | null => {
    if (!Array.isArray(rings)) return null
    const closed = rings.map(r => closeRing((r as number[][]).map(([lon, lat]) => [lon, lat] as [number, number])))
    return closed[0] ? closed.filter((r): r is Ring => !!r) : null
  }
  if (geom.type === 'Polygon') { const p = toPoly(geom.coordinates); return p ? [p] : null }
  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    const ps = geom.coordinates.map(toPoly).filter((p): p is Polygon => !!p)
    return ps.length ? ps : null
  }
  if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    const ps = (geom.geometries as GeoFeature['geometry'][]).flatMap(g => geoPolygons(g) ?? [])
    return ps.length ? ps : null
  }
  return null
}

function geoRating(props: Record<string, unknown>): ZoneRating | null {
  const str = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : null)
  for (const k of ['rating', 'zone', 'type', 'category', 'status', 'class']) {
    const r = ratingFromText(str(k))
    if (r) return r
  }
  const r = ratingFromText(str('name') ?? str('Name') ?? str('title'))
  if (r) return r
  for (const k of ['fill', 'fill-color', 'fillColor', 'color', 'stroke']) {
    const rgb = parseHexColor(str(k))
    if (rgb) return ratingFromColor(...rgb)
  }
  return null
}

function parseGeoJson(text: string): { areas: RawArea[]; skipped: number } {
  const json = JSON.parse(text) as { type?: string; features?: GeoFeature[] } & GeoFeature
  const features: GeoFeature[] = json.type === 'FeatureCollection' ? json.features ?? []
    : json.type === 'Feature' ? [json]
    : [{ type: 'Feature', geometry: json as GeoFeature['geometry'], properties: {} }]
  const areas: RawArea[] = []
  let skipped = 0
  for (const f of features) {
    const polygons = geoPolygons(f.geometry)
    if (!polygons) { skipped++; continue }
    const props = f.properties ?? {}
    const pick = (...keys: string[]) => keys.map(k => props[k]).find(v => typeof v === 'string' && v.trim()) as string | undefined
    areas.push({
      name: pick('name', 'Name', 'title', 'NAME') ?? null,
      note: pick('description', 'desc', 'note') ?? null,
      polygons,
      rating: geoRating(props),
    })
  }
  return { areas, skipped }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function parseZoneFile(fileName: string, bytes: ArrayBuffer, defaultRating: ZoneRating): Promise<ZoneImportResult> {
  const lower = fileName.toLowerCase()
  let parsed: { areas: RawArea[]; skipped: number }
  if (lower.endsWith('.kmz') || isZip(bytes)) parsed = parseKml(await kmzToKml(bytes))
  else {
    const text = new TextDecoder().decode(bytes)
    parsed = /<kml[\s>]/.test(text.slice(0, 2000)) || lower.endsWith('.kml') ? parseKml(text) : parseGeoJson(text)
  }
  const base = fileName.replace(/\.[^.]+$/, '')
  const now = new Date().toISOString()
  const zones: Zone[] = parsed.areas.map((a, i) => ({
    id: newId(i),
    name: a.name ?? `${base} ${i + 1}`,
    rating: a.rating ?? defaultRating,
    polygons: a.polygons,
    source: fileName,
    note: a.note,
    createdAt: now,
  }))
  return { zones, skipped: parsed.skipped }
}
