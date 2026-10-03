// Session file import — parses GPX, OADS and UltraPilot JSON into session
// payloads. Pure parsing only; writing to IndexedDB happens in session-store.
import type { Session, StampEvent, StampEventType, TrackPoint } from './models'
import type { OADSEnvelope } from './export'
import { computeTrackDistanceNM } from './logic/session-logic'
import { bearing, haversineNM } from './logic/gps-logic'

export type SessionImportPayload = {
  session: Session
  trackPoints: TrackPoint[]
  events: StampEvent[]
}

export type ImportStats = {
  imported: number
  replaced: number
  skippedDuplicates: number
  skippedInvalid: number
}

const STAMP_EVENT_TYPES: StampEventType[] = [
  'session_start', 'session_end', 'takeoff', 'landing', 'engine_start', 'engine_shutdown',
  'checklist_complete', 'wing_layout', 'weather', 'waypoint', 'preflight', 'maneuver', 'custom',
  'cold_inflation', 'hot_inflation', 'deflation', 'pibal', 'fuel_switch',
]

function isStampEventType(value: unknown): value is StampEventType {
  return typeof value === 'string' && STAMP_EVENT_TYPES.includes(value as StampEventType)
}

function coerceFinite(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeSession(input: unknown): Session | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.startTime !== 'string') return null
  return {
    id: s.id,
    startTime: s.startTime,
    endTime: typeof s.endTime === 'string' ? s.endTime : null,
    originLat: coerceFinite(s.originLat),
    originLon: coerceFinite(s.originLon),
    originAltMSL: coerceFinite(s.originAltMSL),
    maxAGL: coerceFinite(s.maxAGL),
    totalDistanceNM: coerceFinite(s.totalDistanceNM),
    deviceInfo: typeof s.deviceInfo === 'string' ? s.deviceInfo : 'imported',
    deletedAt: null,
  }
}

function normalizeTrackPoints(input: unknown, sessionId: string): TrackPoint[] {
  if (!Array.isArray(input)) return []
  return input
    .map((pt) => {
      if (!pt || typeof pt !== 'object') return null
      const p = pt as Record<string, unknown>
      const lat = coerceFinite(p.lat, NaN)
      const lon = coerceFinite(p.lon, NaN)
      const ts = coerceFinite(p.ts, NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(ts)) return null
      return {
        sessionId,
        ts,
        lat,
        lon,
        altMSL: coerceFinite(p.altMSL),
        speed: coerceFinite(p.speed),
        heading: coerceFinite(p.heading),
        accuracy: coerceFinite(p.accuracy),
      }
    })
    .filter((pt): pt is TrackPoint => !!pt)
    .sort((a, b) => a.ts - b.ts)
}

function normalizeEvents(input: unknown, sessionId: string): StampEvent[] {
  if (!Array.isArray(input)) return []
  return input
    .map((ev, index) => {
      if (!ev || typeof ev !== 'object') return null
      const e = ev as Record<string, unknown>
      const lat = coerceFinite(e.lat, NaN)
      const lon = coerceFinite(e.lon, NaN)
      const ts = coerceFinite(e.ts, NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(ts)) return null
      const type = isStampEventType(e.type) ? e.type : 'custom'
      const id = typeof e.id === 'string' ? e.id : `${sessionId}-event-${ts}-${index}`
      return {
        id,
        sessionId,
        ts,
        type,
        lat,
        lon,
        altMSL: coerceFinite(e.altMSL),
        altAGL: coerceFinite(e.altAGL),
        speed: coerceFinite(e.speed),
        note: typeof e.note === 'string' ? e.note : null,
      }
    })
    .filter((ev): ev is StampEvent => !!ev)
    .sort((a, b) => a.ts - b.ts)
}

export function parseSessionOADS(raw: unknown): SessionImportPayload[] {
  const envelopes: OADSEnvelope[] = Array.isArray(raw)
    ? (raw as OADSEnvelope[])
    : [raw as OADSEnvelope]

  const valid = envelopes.filter(env => env && typeof env === 'object' && (env as { oads?: unknown }).oads === '1.0')
  if (valid.length === 0) throw new Error('No OADS envelopes found')

  const groups = new Map<string, { track?: OADSEnvelope; events?: OADSEnvelope }>()
  for (const env of valid) {
    const ext = ((env.extensions ?? {}) as { ultrapilot?: { sessionId?: string; session?: Session } }).ultrapilot
    const sessionId = ext?.sessionId ?? ext?.session?.id
    if (!sessionId) continue
    const g = groups.get(sessionId) ?? {}
    if (env.type === 'track_log') g.track = env
    if (env.type === 'flight_event_log') g.events = env
    groups.set(sessionId, g)
  }

  const payloads: SessionImportPayload[] = []
  for (const [sessionId, group] of groups.entries()) {
    const trackExt = ((group.track?.extensions ?? {}) as { ultrapilot?: { session?: Session } }).ultrapilot
    const session = trackExt?.session
    if (!session) continue

    const trackCoordinates = (((group.track?.data ?? {}) as { track?: { geometry?: { coordinates?: unknown[] } } }).track?.geometry?.coordinates ?? []) as unknown[]
    const timestamps = ((((group.track?.data ?? {}) as { track?: { properties?: { timestamps?: unknown[] } } }).track?.properties?.timestamps) ?? []) as unknown[]
    const speedsKts = ((((group.track?.data ?? {}) as { track?: { properties?: { ground_speed_kts?: unknown[] } } }).track?.properties?.ground_speed_kts) ?? []) as unknown[]
    const headings = ((((group.track?.data ?? {}) as { track?: { properties?: { heading_magnetic?: unknown[] } } }).track?.properties?.heading_magnetic) ?? []) as unknown[]

    const trackPoints: TrackPoint[] = trackCoordinates
      .map((coord, i) => {
        if (!Array.isArray(coord) || coord.length < 2) return null
        const lon = coerceFinite(coord[0], NaN)
        const lat = coerceFinite(coord[1], NaN)
        const altMSL = coerceFinite(coord[2])
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const tsRaw = typeof timestamps[i] === 'string' ? Date.parse(timestamps[i] as string) : NaN
        return {
          sessionId,
          ts: Number.isFinite(tsRaw) ? tsRaw : Date.now() + i,
          lat,
          lon,
          altMSL,
          speed: coerceFinite(speedsKts[i]) / 1.94384,
          heading: coerceFinite(headings[i]),
          accuracy: 0,
        }
      })
      .filter((pt): pt is TrackPoint => !!pt)

    const rawEvents = (((group.events?.data ?? {}) as { events?: unknown[] }).events ?? []) as unknown[]
    const events: StampEvent[] = rawEvents
      .map((ev, idx): StampEvent | null => {
        if (!ev || typeof ev !== 'object') return null
        const e = ev as Record<string, unknown>
        const loc = e.location as { coordinates?: unknown[] } | undefined
        const coords = Array.isArray(loc?.coordinates) ? loc?.coordinates : []
        if (coords.length < 2) return null
        const lon = coerceFinite(coords[0], NaN)
        const lat = coerceFinite(coords[1], NaN)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const tsRaw = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
        return {
          id: typeof e.id === 'string' ? e.id : `${sessionId}-oads-${idx}`,
          sessionId,
          ts: Number.isFinite(tsRaw) ? tsRaw : Date.now() + idx,
          type: isStampEventType(e.event_type) ? e.event_type : 'custom',
          lat,
          lon,
          altMSL: coerceFinite(coords[2]),
          altAGL: 0,
          speed: 0,
          note: typeof e.notes === 'string' ? e.notes : null,
        }
      })
      .filter((ev): ev is StampEvent => !!ev)

    if (trackPoints.length > 1) {
      session.totalDistanceNM = computeTrackDistanceNM(trackPoints)
    }

    payloads.push({ session: { ...session, deletedAt: null }, trackPoints, events })
  }

  if (payloads.length === 0) throw new Error('No UltraPilot session records found in OADS file')
  return payloads
}

export function parseSessionJson(raw: unknown): SessionImportPayload[] {
  if (!raw || typeof raw !== 'object') throw new Error('Not a valid JSON object')
  const obj = raw as Record<string, unknown>

  const parseOne = (entry: unknown): SessionImportPayload | null => {
    if (!entry || typeof entry !== 'object') return null
    const rec = entry as Record<string, unknown>
    const session = normalizeSession(rec.session)
    if (!session) return null
    const trackPoints = normalizeTrackPoints(rec.trackPoints, session.id)
    const events = normalizeEvents(rec.events, session.id)
    if (trackPoints.length > 1) {
      session.totalDistanceNM = computeTrackDistanceNM(trackPoints)
    }
    return { session, trackPoints, events }
  }

  if (obj.session && obj.trackPoints && obj.events) {
    const one = parseOne(obj)
    if (!one) throw new Error('Invalid session file structure')
    return [one]
  }

  if (Array.isArray(obj.sessions)) {
    const parsed = obj.sessions
      .map(parseOne)
      .filter((item): item is SessionImportPayload => !!item)
    if (parsed.length === 0) throw new Error('No valid sessions found in file')
    return parsed
  }

  throw new Error('Unsupported session file format')
}

function parseGpxEventType(name: string): StampEventType {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, '_')
  return isStampEventType(normalized) ? normalized : 'custom'
}

/** First descendant with this local name, in any XML namespace. Third-party
 *  GPX often puts speed/course in extensions (gpxtpx:speed, ns3:course…). */
function childText(node: Element, localName: string): string | null {
  return node.getElementsByTagNameNS('*', localName)[0]?.textContent ?? null
}

/** Below this, speed between fixes is GPS jitter — keep the previous track. */
const GPX_MIN_TRACK_SPEED_MS = 0.5

export function parseSessionGpx(text: string): SessionImportPayload {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid GPX XML')
  }

  // Track points from every <trk>/<trkseg>. Route-only files (<rtept>) have no
  // timestamps, so they can't become a flight.
  const trkpts = Array.from(doc.getElementsByTagNameNS('*', 'trkpt'))
  if (trkpts.length === 0) {
    throw new Error(doc.getElementsByTagNameNS('*', 'rtept').length > 0
      ? 'GPX contains a route, not a recorded track'
      : 'GPX has no track points')
  }

  let missingTime = 0
  const rawPoints = trkpts
    .map((node, index) => {
      const lat = coerceFinite(node.getAttribute('lat'), NaN)
      const lon = coerceFinite(node.getAttribute('lon'), NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      const timeText = childText(node, 'time')
      const parsedTime = timeText ? Date.parse(timeText) : NaN
      if (!Number.isFinite(parsedTime)) missingTime++
      const speedText = childText(node, 'speed')
      const courseText = childText(node, 'course')
      return {
        lat,
        lon,
        ts: Number.isFinite(parsedTime) ? parsedTime : index * 1000,
        altMSL: coerceFinite(childText(node, 'ele')),
        speed: speedText !== null ? coerceFinite(speedText, NaN) : NaN,     // m/s per GPX spec
        heading: courseText !== null ? coerceFinite(courseText, NaN) : NaN,
      }
    })
    .filter((pt): pt is NonNullable<typeof pt> => !!pt)

  if (rawPoints.length === 0) throw new Error('GPX track points are invalid')
  if (missingTime === rawPoints.length) {
    throw new Error('GPX track has no timestamps — it can\'t be replayed as a flight')
  }

  // Sort by time and drop exact-duplicate timestamps (common when merging segments)
  rawPoints.sort((a, b) => a.ts - b.ts)
  const pts = rawPoints.filter((p, i) => i === 0 || p.ts !== rawPoints[i - 1].ts)

  const startMs = pts[0].ts
  const endMs = pts[pts.length - 1].ts
  const sessionId = new Date(startMs).toISOString()

  // Fill missing speed / course from the points themselves
  let lastTrack = 0
  const trackPoints: TrackPoint[] = pts.map((pt, i) => {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const a = i > 0 ? prev : pt
    const b = i > 0 ? pt : next
    const dtS = (b.ts - a.ts) / 1000
    const derivedSpeed = dtS > 0 ? (haversineNM(a.lat, a.lon, b.lat, b.lon) * 1852) / dtS : 0
    const speed = Number.isFinite(pt.speed) ? pt.speed : derivedSpeed
    if (derivedSpeed > GPX_MIN_TRACK_SPEED_MS) lastTrack = bearing(a.lat, a.lon, b.lat, b.lon)
    const heading = Number.isFinite(pt.heading) ? pt.heading : lastTrack
    return { sessionId, ts: pt.ts, lat: pt.lat, lon: pt.lon, altMSL: pt.altMSL, speed, heading, accuracy: 0 }
  })

  const distanceNM = computeTrackDistanceNM(trackPoints)
  const originAlt = trackPoints[0].altMSL
  // AGL in this app = height above the origin (first point), not terrain
  const maxAGL = Math.max(0, ...trackPoints.map(p => p.altMSL - originAlt))

  const session: Session = {
    id: sessionId,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    originLat: trackPoints[0].lat,
    originLon: trackPoints[0].lon,
    originAltMSL: originAlt,
    maxAGL,
    totalDistanceNM: distanceNM,
    deviceInfo: 'imported-gpx',
    deletedAt: null,
  }

  const events: StampEvent[] = Array.from(doc.getElementsByTagNameNS('*', 'wpt'))
    .map((node, index): StampEvent | null => {
      const lat = coerceFinite(node.getAttribute('lat'), NaN)
      const lon = coerceFinite(node.getAttribute('lon'), NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      const name = childText(node, 'name') ?? 'custom'
      const type = parseGpxEventType(name)
      const desc = childText(node, 'desc')
      const timeText = childText(node, 'time')
      const parsedTime = timeText ? Date.parse(timeText) : NaN
      return {
        id: `${sessionId}-wpt-${index}`,
        sessionId,
        ts: Number.isFinite(parsedTime) ? parsedTime : startMs,
        type,
        lat,
        lon,
        altMSL: coerceFinite(childText(node, 'ele')),
        altAGL: 0,
        speed: 0,
        // Unknown waypoint names (other apps' POIs) keep their name as the note
        note: desc ?? (type === 'custom' && name !== 'custom' ? name : null),
      }
    })
    .filter((ev): ev is StampEvent => !!ev)

  return { session, trackPoints, events }
}

/** Parse any supported session file by name + contents. */
export function parseSessionFile(fileName: string, text: string): SessionImportPayload[] {
  if (fileName.toLowerCase().endsWith('.gpx') || text.trimStart().startsWith('<')) {
    return [parseSessionGpx(text)]
  }
  const rawJson = JSON.parse(text)
  try {
    return parseSessionOADS(rawJson)
  } catch {
    return parseSessionJson(rawJson)
  }
}

export function formatImportStats(stats: ImportStats): string {
  const parts = [`Imported ${stats.imported}`]
  if (stats.replaced > 0) parts.push(`replaced ${stats.replaced}`)
  if (stats.skippedDuplicates > 0) parts.push(`skipped duplicates ${stats.skippedDuplicates}`)
  if (stats.skippedInvalid > 0) parts.push(`skipped invalid ${stats.skippedInvalid}`)
  return parts.join(' · ')
}
