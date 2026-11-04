// Places ⇄ files. Export to GeoJSON or KML; import KML, KMZ or GeoJSON
// points and areas (lines are skipped). Our own exports carry category,
// elevation and id, so they round-trip exactly; for other files the category
// is guessed from names/properties, then style color, else a default.
import type { Place, PlaceCategory, PlaceGeometry, ZoneRating } from './models'
import { kmzToKml } from './import'
import { isZip } from './zip'
import { categoryFromText, isPlaceCategory, newPlaceId, PLACE_CATEGORIES } from './logic/place-logic'
import { parseHexColor, parseKmlColor, ratingFromColor } from './logic/zone-logic'

type Ring = [number, number][]
type Polygon = Ring[]

// ═══ Export ══════════════════════════════════════════════════════════════════

const CATEGORY_HEX: Record<PlaceCategory, string> = {
  launch: '#c0392b', good: '#2ecc71', caution: '#f1c40f', nogo: '#e74c3c', poi: '#3498db',
}

export function placesToGeoJSON(places: Place[]): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: places.map(p => ({
      type: 'Feature',
      id: p.id,
      properties: {
        id: p.id, name: p.name, category: p.category, elevFt: p.elevFt, note: p.note,
        // simplestyle, so other apps color it sensibly
        ...(p.geometry.type === 'Point'
          ? { 'marker-color': CATEGORY_HEX[p.category] }
          : { fill: CATEGORY_HEX[p.category], 'fill-opacity': 0.25, stroke: CATEGORY_HEX[p.category] }),
      },
      geometry: p.geometry,
    })),
  }, null, 2)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** "#rrggbb" + alpha → KML "aabbggrr". */
function kmlColor(hex: string, alpha: number): string {
  const h = hex.slice(1)
  return `${alpha.toString(16).padStart(2, '0')}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`
}

const coordText = (ring: Ring) => ring.map(([lon, lat]) => `${lon},${lat}`).join(' ')

function kmlGeometry(g: PlaceGeometry): string {
  if (g.type === 'Point') return `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}</coordinates></Point>`
  const polys = g.coordinates.map(([outer, ...holes]) =>
    `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordText(outer)}</coordinates></LinearRing></outerBoundaryIs>` +
    holes.map(h => `<innerBoundaryIs><LinearRing><coordinates>${coordText(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('') +
    `</Polygon>`)
  return polys.length === 1 ? polys[0] : `<MultiGeometry>${polys.join('')}</MultiGeometry>`
}

export function placesToKml(places: Place[], docName: string): string {
  const styles = PLACE_CATEGORIES.map(c => {
    const hex = CATEGORY_HEX[c.id]
    return `<Style id="${c.id}"><IconStyle><color>${kmlColor(hex, 255)}</color></IconStyle>` +
      `<LineStyle><color>${kmlColor(hex, 255)}</color><width>2</width></LineStyle>` +
      `<PolyStyle><color>${kmlColor(hex, 64)}</color></PolyStyle></Style>`
  }).join('\n')
  const marks = places.map(p => {
    const data = [['category', p.category], ['ultrapilotId', p.id], ...(p.elevFt != null ? [['elevFt', String(p.elevFt)]] : [])]
      .map(([k, v]) => `<Data name="${k}"><value>${esc(v)}</value></Data>`).join('')
    return `<Placemark><name>${esc(p.name)}</name>${p.note ? `<description>${esc(p.note)}</description>` : ''}` +
      `<styleUrl>#${p.category}</styleUrl><ExtendedData>${data}</ExtendedData>${kmlGeometry(p.geometry)}</Placemark>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(docName)}</name>\n${styles}\n${marks}\n</Document></kml>\n`
}

// ═══ Import ══════════════════════════════════════════════════════════════════

interface RawPlace {
  id: string | null
  name: string | null
  note: string | null
  geometry: PlaceGeometry
  category: PlaceCategory | null
  elevFt: number | null
}

export interface PlaceImportResult {
  places: Place[]
  /** Lines and anything else that isn't a point or an area. */
  skipped: number
}

function closeRing(ring: Ring): Ring | null {
  const pts = ring.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (pts.length < 3) return null
  const [a, b] = [pts[0], pts[pts.length - 1]]
  return a[0] === b[0] && a[1] === b[1] ? pts : [...pts, a]
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

// ─── KML ─────────────────────────────────────────────────────────────────────

const kids = (el: Element, name: string) => Array.from(el.children).filter(c => c.localName === name)

function kmlRing(el: Element | undefined): Ring | null {
  const text = el?.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent ?? ''
  return closeRing(text.trim().split(/\s+/).map(t => t.split(',').map(Number)).map(([lon, lat]) => [lon, lat] as [number, number]))
}

function kmlPolygon(poly: Element): Polygon | null {
  const outer = kmlRing(kids(poly, 'outerBoundaryIs')[0])
  if (!outer) return null
  return [outer, ...kids(poly, 'innerBoundaryIs').map(kmlRing).filter((r): r is Ring => !!r)]
}

/** Polygon fill (or line) color from inline Style or styleUrl → Style / StyleMap. */
function kmlStyleColor(doc: Document, pm: Element): [number, number, number] | null {
  const byId = (id: string) => Array.from(doc.getElementsByTagNameNS('*', '*')).find(e => e.getAttribute('id') === id)
  const colorOf = (style: Element | undefined | null): [number, number, number] | null => {
    if (!style) return null
    for (const kind of ['PolyStyle', 'LineStyle', 'IconStyle']) {
      const rgb = parseKmlColor(style.getElementsByTagNameNS('*', kind)[0]?.getElementsByTagNameNS('*', 'color')[0]?.textContent)
      if (rgb) return rgb
    }
    return null
  }
  const inline = colorOf(kids(pm, 'Style')[0])
  if (inline) return inline
  const url = kids(pm, 'styleUrl')[0]?.textContent?.trim()
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

function parseKml(text: string): { raw: RawPlace[]; skipped: number } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Invalid KML XML')
  const raw: RawPlace[] = []
  let skipped = 0
  for (const pm of Array.from(doc.getElementsByTagNameNS('*', 'Placemark'))) {
    const text1 = (n: string) => kids(pm, n)[0]?.textContent?.trim() || null
    const name = text1('name')
    const note = text1('description')?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null
    const data: Record<string, string> = {}
    for (const d of Array.from(pm.getElementsByTagNameNS('*', 'Data'))) {
      data[d.getAttribute('name') ?? ''] = d.getElementsByTagNameNS('*', 'value')[0]?.textContent?.trim() ?? ''
    }
    const polygons = Array.from(pm.getElementsByTagNameNS('*', 'Polygon')).map(kmlPolygon).filter((p): p is Polygon => !!p)
    let geometry: PlaceGeometry | null = null
    if (polygons.length) geometry = { type: 'MultiPolygon', coordinates: polygons }
    else {
      const pt = pm.getElementsByTagNameNS('*', 'Point')[0]
      const [lon, lat] = (pt?.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent ?? '').trim().split(',').map(Number)
      if (pt && Number.isFinite(lon) && Number.isFinite(lat)) geometry = { type: 'Point', coordinates: [lon, lat] }
    }
    if (!geometry) { skipped++; continue }
    const rgb = kmlStyleColor(doc, pm)
    const category = isPlaceCategory(data.category) ? data.category
      : categoryFromText(name) ?? categoryFromText(note)
      ?? (geometry.type === 'MultiPolygon' && rgb ? ratingFromColor(...rgb) : null)
    raw.push({ id: data.ultrapilotId || null, name, note, geometry, category, elevFt: num(data.elevFt) })
  }
  return { raw, skipped }
}

// ─── GeoJSON ─────────────────────────────────────────────────────────────────

interface GeoGeom { type: string; coordinates?: unknown; geometries?: GeoGeom[] }
interface GeoFeature { type: string; id?: unknown; geometry?: GeoGeom | null; properties?: Record<string, unknown> | null }

function toPolygon(rings: unknown): Polygon | null {
  if (!Array.isArray(rings)) return null
  const closed = rings.map(r => closeRing((r as number[][]).map(([lon, lat]) => [lon, lat] as [number, number])))
  return closed[0] ? closed.filter((r): r is Ring => !!r) : null
}

/** One feature's geometry → places' geometries (MultiPoint gives several points). */
function geoGeometries(g: GeoGeom | null | undefined): PlaceGeometry[] {
  if (!g) return []
  const c = g.coordinates as number[] & number[][] & unknown[]
  switch (g.type) {
    case 'Point': return Number.isFinite(c?.[0]) ? [{ type: 'Point', coordinates: [c[0] as number, c[1] as number] }] : []
    case 'MultiPoint': return (c as number[][]).map(p => ({ type: 'Point' as const, coordinates: [p[0], p[1]] as [number, number] }))
    case 'Polygon': { const p = toPolygon(c); return p ? [{ type: 'MultiPolygon', coordinates: [p] }] : [] }
    case 'MultiPolygon': {
      const ps = (c as unknown[]).map(toPolygon).filter((p): p is Polygon => !!p)
      return ps.length ? [{ type: 'MultiPolygon', coordinates: ps }] : []
    }
    case 'GeometryCollection': {
      const all = (g.geometries ?? []).flatMap(geoGeometries)
      const polys = all.flatMap(x => (x.type === 'MultiPolygon' ? x.coordinates : []))
      return polys.length ? [{ type: 'MultiPolygon', coordinates: polys }] : all
    }
    default: return []
  }
}

function geoCategory(props: Record<string, unknown>, isArea: boolean): PlaceCategory | null {
  if (isPlaceCategory(props.category)) return props.category
  const str = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : null)
  for (const k of ['category', 'type', 'rating', 'zone', 'status', 'class', 'name', 'Name', 'title']) {
    const c = categoryFromText(str(k))
    if (c) return c
  }
  if (!isArea) return null
  for (const k of ['fill', 'fill-color', 'fillColor', 'color', 'stroke']) {
    const rgb = parseHexColor(str(k))
    if (rgb) return ratingFromColor(...rgb)
  }
  return null
}

function parseGeoJson(text: string): { raw: RawPlace[]; skipped: number } {
  const json = JSON.parse(text) as GeoFeature & { features?: GeoFeature[] }
  const features: GeoFeature[] = json.type === 'FeatureCollection' ? json.features ?? []
    : json.type === 'Feature' ? [json]
    : [{ type: 'Feature', geometry: json as GeoGeom, properties: {} }]
  const raw: RawPlace[] = []
  let skipped = 0
  for (const f of features) {
    const geoms = geoGeometries(f.geometry)
    if (!geoms.length) { skipped++; continue }
    const props = f.properties ?? {}
    const pick = (...keys: string[]) => keys.map(k => props[k]).find(v => typeof v === 'string' && v.trim()) as string | undefined
    const id = pick('id') ?? (typeof f.id === 'string' ? f.id : null)
    geoms.forEach((geometry, i) => raw.push({
      id: id && geoms.length === 1 ? id : id ? `${id}-${i}` : null,
      name: pick('name', 'Name', 'title', 'NAME') ?? null,
      note: pick('note', 'description', 'desc') ?? null,
      geometry,
      category: geoCategory(props, geometry.type === 'MultiPolygon'),
      elevFt: num(props.elevFt) ?? (num(props.elevation_m) != null ? num(props.elevation_m)! * 3.28084 : null),
    }))
  }
  return { raw, skipped }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Unrated areas get `defaultRating`; points with no hint become points of interest. */
export async function parsePlaceFile(fileName: string, bytes: ArrayBuffer, defaultRating: ZoneRating): Promise<PlaceImportResult> {
  const lower = fileName.toLowerCase()
  let parsed: { raw: RawPlace[]; skipped: number }
  if (lower.endsWith('.kmz') || isZip(bytes)) parsed = parseKml(await kmzToKml(bytes))
  else {
    const text = new TextDecoder().decode(bytes)
    parsed = lower.endsWith('.kml') || /<kml[\s>]/.test(text.slice(0, 2000)) ? parseKml(text) : parseGeoJson(text)
  }
  const base = fileName.replace(/\.[^.]+$/, '')
  const now = new Date().toISOString()
  const places = parsed.raw.map((r, i): Place => ({
    id: r.id ?? newPlaceId() + i,
    name: r.name ?? `${base} ${i + 1}`,
    category: r.category ?? (r.geometry.type === 'MultiPolygon' ? defaultRating : 'poi'),
    geometry: r.geometry,
    elevFt: r.elevFt != null ? Math.round(r.elevFt) : null,
    note: r.note,
    source: fileName,
    createdAt: now,
  }))
  return { places, skipped: parsed.skipped }
}

/** Save text as a file via a temporary link (same approach as route export). */
export function downloadText(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
