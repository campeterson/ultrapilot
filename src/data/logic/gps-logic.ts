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

export interface WindSample {
  trackDeg: number   // ground track
  speedKts: number   // ground speed
}

export interface WindEstimate {
  /** Direction wind is coming FROM, degrees */
  dirDeg: number
  /** Wind speed, knots */
  speedKts: number
}

/** Estimate wind from a set of (ground track, ground speed) samples.
 *  Uses algebraic circle fit in velocity space (Kasa method).
 *  Assumes constant true airspeed across samples (brief window).
 *  Returns null if track variation is too small to resolve wind. */
export function estimateWind(samples: WindSample[]): WindEstimate | null {
  if (samples.length < 8) return null
  // Convert to velocity components (east, north)
  const pts = samples.map(s => ({
    x: s.speedKts * Math.sin(s.trackDeg * DEG_TO_RAD),
    y: s.speedKts * Math.cos(s.trackDeg * DEG_TO_RAD),
  }))
  // Require track spread ≥ 60° for a meaningful fit
  const tracks = samples.map(s => s.trackDeg).sort((a, b) => a - b)
  let maxGap = tracks[0] + 360 - tracks[tracks.length - 1]
  for (let i = 1; i < tracks.length; i++) {
    maxGap = Math.max(maxGap, tracks[i] - tracks[i - 1])
  }
  const spread = 360 - maxGap
  if (spread < 60) return null
  // Kasa fit: minimize Σ(x² + y² + Dx + Ey + F)²
  // Solve normal equations for D, E, F
  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0
  let Sxz = 0, Syz = 0, Sz = 0
  const n = pts.length
  for (const p of pts) {
    const z = p.x * p.x + p.y * p.y
    Sx += p.x; Sy += p.y
    Sxx += p.x * p.x; Syy += p.y * p.y; Sxy += p.x * p.y
    Sxz += p.x * z; Syz += p.y * z; Sz += z
  }
  // Solve 3x3 system:
  // [Sxx Sxy Sx][D]   [-Sxz]
  // [Sxy Syy Sy][E] = [-Syz]
  // [Sx  Sy  n ][F]   [-Sz ]
  const a = [
    [Sxx, Sxy, Sx, -Sxz],
    [Sxy, Syy, Sy, -Syz],
    [Sx,  Sy,  n,  -Sz ],
  ]
  const sol = solve3(a)
  if (!sol) return null
  const [D, E] = sol
  const cx = -D / 2
  const cy = -E / 2
  // Wind blows TO (cx, cy) — direction it's going. Convert to "from" bearing.
  const toDeg = (Math.atan2(cx, cy) * RAD_TO_DEG + 360) % 360
  const fromDeg = (toDeg + 180) % 360
  const speed = Math.sqrt(cx * cx + cy * cy)
  if (!isFinite(speed) || speed > 100) return null
  return { dirDeg: fromDeg, speedKts: speed }
}

function solve3(m: number[][]): [number, number, number] | null {
  // Gaussian elimination with partial pivoting on 3x4 matrix
  const a = m.map(r => r.slice())
  for (let i = 0; i < 3; i++) {
    let maxRow = i
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) maxRow = k
    }
    if (Math.abs(a[maxRow][i]) < 1e-9) return null
    ;[a[i], a[maxRow]] = [a[maxRow], a[i]]
    for (let k = i + 1; k < 3; k++) {
      const f = a[k][i] / a[i][i]
      for (let j = i; j < 4; j++) a[k][j] -= f * a[i][j]
    }
  }
  const x = [0, 0, 0]
  for (let i = 2; i >= 0; i--) {
    let s = a[i][3]
    for (let j = i + 1; j < 3; j++) s -= a[i][j] * x[j]
    x[i] = s / a[i][i]
  }
  return [x[0], x[1], x[2]]
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
