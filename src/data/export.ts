import type { Session, TrackPoint, StampEvent } from './models'
import { metersToFeet } from './logic/gps-logic'

interface OADSReference {
  type: string
  id: string
}

export interface OADSEnvelope {
  oads: '1.0'
  id: string
  type: string
  created: string
  modified: string
  source: {
    app: string
    version: string
    platform: string
  }
  references: OADSReference[]
  tags: string[]
  data: Record<string, unknown>
  extensions: Record<string, unknown>
}

function toIso(ts: number): string {
  return new Date(ts).toISOString()
}

export function toOADSSession(session: Session, trackPoints: TrackPoint[], events: StampEvent[]): OADSEnvelope[] {
  const trackId = `${session.id}:track`
  const eventId = `${session.id}:events`
  const startMs = Date.parse(session.startTime)
  const endMs = session.endTime ? Date.parse(session.endTime) : Date.now()

  const trackEnvelope: OADSEnvelope = {
    oads: '1.0',
    id: trackId,
    type: 'track_log',
    created: session.startTime,
    modified: session.endTime ?? new Date().toISOString(),
    source: { app: 'UltraPilot', version: 'web', platform: 'web' },
    references: [{ type: 'flight_event_log', id: eventId }],
    tags: ['ultrapilot', 'session'],
    data: {
      flight_date: session.startTime.slice(0, 10),
      track: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: trackPoints.map(p => [p.lon, p.lat, p.altMSL]),
        },
        properties: {
          timestamps: trackPoints.map(p => toIso(p.ts)),
          ground_speed_kts: trackPoints.map(p => p.speed * 1.94384),
          altitude_msl_ft: trackPoints.map(p => metersToFeet(p.altMSL)),
          heading_magnetic: trackPoints.map(p => p.heading),
        },
      },
    },
    extensions: {
      ultrapilot: {
        sessionId: session.id,
        summary: {
          duration_s: Math.max(0, Math.round((endMs - startMs) / 1000)),
          total_distance_nm: session.totalDistanceNM,
          max_agl_m: session.maxAGL,
        },
        session,
      },
    },
  }

  const eventEnvelope: OADSEnvelope = {
    oads: '1.0',
    id: eventId,
    type: 'flight_event_log',
    created: session.startTime,
    modified: session.endTime ?? new Date().toISOString(),
    source: { app: 'UltraPilot', version: 'web', platform: 'web' },
    references: [{ type: 'track_log', id: trackId }],
    tags: ['ultrapilot', 'session'],
    data: {
      flight_date: session.startTime.slice(0, 10),
      events: events.map(e => ({
        id: e.id,
        timestamp: toIso(e.ts),
        event_type: e.type,
        label: e.type.replace(/_/g, ' '),
        location: { type: 'Point', coordinates: [e.lon, e.lat, e.altMSL] },
        altitude_msl_ft: metersToFeet(e.altMSL),
        heading_magnetic: null,
        notes: e.note,
        metadata: {
          alt_agl_m: e.altAGL,
          speed_m_s: e.speed,
        },
      })),
    },
    extensions: {
      ultrapilot: {
        sessionId: session.id,
      },
    },
  }

  return [trackEnvelope, eventEnvelope]
}

export function toOADSAll(entries: Array<{ session: Session; trackPoints: TrackPoint[]; events: StampEvent[] }>): OADSEnvelope[] {
  return entries.flatMap(entry => toOADSSession(entry.session, entry.trackPoints, entry.events))
}

/** Generate a GPX 1.1 string from session data */
export function toGPX(session: Session, trackPoints: TrackPoint[], events: StampEvent[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const trkpts = trackPoints.map(p =>
    `    <trkpt lat="${p.lat}" lon="${p.lon}">
      <ele>${p.altMSL.toFixed(1)}</ele>
      <time>${new Date(p.ts).toISOString()}</time>
      <extensions><speed>${p.speed.toFixed(2)}</speed><course>${p.heading.toFixed(1)}</course></extensions>
    </trkpt>`
  ).join('\n')

  const wpts = events
    .filter(e => e.type !== 'session_start' && e.type !== 'session_end')
    .map(e =>
      `  <wpt lat="${e.lat}" lon="${e.lon}">
    <ele>${e.altMSL.toFixed(1)}</ele>
    <time>${new Date(e.ts).toISOString()}</time>
    <name>${esc(e.type.replace(/_/g, ' ').toUpperCase())}</name>
    ${e.note ? `<desc>${esc(e.note)}</desc>` : ''}
  </wpt>`
    ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="UltraPilot" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>UltraPilot Flight ${session.startTime}</name>
    <time>${session.startTime}</time>
  </metadata>
${wpts}
  <trk>
    <name>Flight Track</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}

/** Generate a full-fidelity JSON export */
export function toJSON(session: Session, trackPoints: TrackPoint[], events: StampEvent[]): string {
  return JSON.stringify({ session, trackPoints, events }, null, 2)
}

/** Trigger a browser download */
export function downloadString(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function utcStamp(): string {
  return String(Math.floor(Date.now() / 1000))
}

/** Format a session start time as a filename-safe string */
export function sessionFilename(session: Session, ext: string): string {
  const d = new Date(session.startTime)
  const dateStr = d.toISOString().slice(0, 10)
  return `ultrapilot-${dateStr}-${utcStamp()}.${ext}`
}

/** AGL conversion helper for export summaries */
export { metersToFeet }
