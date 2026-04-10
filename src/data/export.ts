import type { Session, TrackPoint, StampEvent } from './models'
import { metersToFeet } from './logic/gps-logic'

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

/** Format a session start time as a filename-safe string */
export function sessionFilename(session: Session, ext: string): string {
  const d = new Date(session.startTime)
  const dateStr = d.toISOString().slice(0, 10)
  return `ultrapilot-${dateStr}.${ext}`
}

/** AGL conversion helper for export summaries */
export { metersToFeet }
