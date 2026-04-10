import type { Session, StampEvent } from '../models'

/** Create a new Session record from a GPS fix */
export function createSession(
  lat: number,
  lon: number,
  altMSLm: number
): Session {
  const now = new Date().toISOString()
  return {
    id: now,
    startTime: now,
    endTime: null,
    originLat: lat,
    originLon: lon,
    originAltMSL: altMSLm,
    maxAGL: 0,
    totalDistanceNM: 0,
    deviceInfo: navigator.userAgent.slice(0, 120),
  }
}

/** Return an updated session with end time and final stats */
export function endSession(
  session: Session,
  maxAGLft: number,
  totalDistanceNM: number
): Session {
  return {
    ...session,
    endTime: new Date().toISOString(),
    maxAGL: maxAGLft,
    totalDistanceNM,
  }
}

/** Duration of a session in ms. Returns null if session is still open. */
export function sessionDurationMs(session: Session): number | null {
  if (!session.endTime) return null
  return new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
}

/** Find takeoff and landing events to compute flight time */
export function computeFlightTimeMs(events: StampEvent[]): number {
  const takeoffs = events.filter(e => e.type === 'takeoff').map(e => e.ts)
  const landings = events.filter(e => e.type === 'landing').map(e => e.ts)

  if (takeoffs.length === 0) return 0

  let total = 0
  for (let i = 0; i < takeoffs.length; i++) {
    const start = takeoffs[i]
    const end = landings[i] ?? Date.now()
    total += Math.max(0, end - start)
  }
  return total
}
