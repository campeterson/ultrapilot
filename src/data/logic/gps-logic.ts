// Pure GPS math functions — no side effects, no browser APIs

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const EARTH_RADIUS_NM = 3440.065

/** Haversine distance in nautical miles */
export function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD
  const dLon = (lon2 - lon1) * DEG_TO_RAD
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a))
}

/** Forward azimuth (bearing) in degrees (0–360) */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * DEG_TO_RAD
  const φ2 = lat2 * DEG_TO_RAD
  const Δλ = (lon2 - lon1) * DEG_TO_RAD
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360
}

/** AGL = current MSL minus origin MSL (both in meters), result in feet */
export function computeAGLft(currentMSLm: number, originMSLm: number): number {
  return metersToFeet(currentMSLm - originMSLm)
}

/** Vertical speed from 3-point smoothing window.
 *  Points must be sorted ascending by ts.
 *  Returns ft/min. Returns 0 if fewer than 2 points. */
export function verticalSpeedFpm(points: { altMSL: number; ts: number }[]): number {
  if (points.length < 2) return 0
  const n = points.length
  // Use last 3 points max for smoothing
  const window = points.slice(Math.max(0, n - 3))
  const first = window[0]
  const last = window[window.length - 1]
  const dtMin = (last.ts - first.ts) / 60_000
  if (dtMin === 0) return 0
  const dAltFt = metersToFeet(last.altMSL - first.altMSL)
  return dAltFt / dtMin
}

/** Convert m/s to knots */
export function msToKnots(ms: number): number {
  return ms * 1.94384
}

/** Convert meters to feet */
export function metersToFeet(m: number): number {
  return m * 3.28084
}

/** Convert feet to meters */
export function feetToMeters(ft: number): number {
  return ft / 3.28084
}

/** Format bearing/heading as "123°" */
export function formatDeg(deg: number): string {
  return `${Math.round(deg).toString().padStart(3, '0')}°`
}

/** Format distance in NM, 1 decimal */
export function formatNM(nm: number): string {
  return nm.toFixed(1)
}

/** Cross-track error in NM (signed: negative = left, positive = right).
 *  from→to defines the desired track; [lat,lon] is current position. */
export function crossTrackErrorNM(
  lat: number, lon: number,
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
): number {
  const d13 = haversineNM(fromLat, fromLon, lat, lon) / EARTH_RADIUS_NM
  const brg13 = bearing(fromLat, fromLon, lat, lon) * DEG_TO_RAD
  const brg12 = bearing(fromLat, fromLon, toLat, toLon) * DEG_TO_RAD
  return Math.asin(Math.sin(d13) * Math.sin(brg13 - brg12)) * EARTH_RADIUS_NM
}

/** Estimated time enroute in minutes given distance (NM) and speed (knots).
 *  Returns 0 when speed is too low to compute meaningfully. */
export function estimatedTimeEnrouteMin(distNM: number, speedKts: number): number {
  if (speedKts < 1) return 0
  return (distNM / speedKts) * 60
}

/** Compute destination point given start, bearing (degrees), and distance (NM).
 *  Returns [lat, lon] in decimal degrees. */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distNM: number): [number, number] {
  const d = distNM / EARTH_RADIUS_NM
  const brng = bearingDeg * DEG_TO_RAD
  const φ1 = lat * DEG_TO_RAD
  const λ1 = lon * DEG_TO_RAD
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brng))
  const λ2 = λ1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2))
  return [φ2 * RAD_TO_DEG, ((λ2 * RAD_TO_DEG) + 540) % 360 - 180]
}
