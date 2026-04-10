import type { Airport } from '../models'
import { haversineNM, bearing, formatDeg } from './gps-logic'

export interface NearbyAirport extends Airport {
  distNM: number
  bearingDeg: number
  bearingLabel: string
}

/** Return up to `limit` airports sorted by distance from (lat, lon) */
export function nearestAirports(
  airports: Airport[],
  lat: number,
  lon: number,
  limit = 20
): NearbyAirport[] {
  return airports
    .map(ap => {
      const distNM = haversineNM(lat, lon, ap.lat, ap.lon)
      const bearingDeg = bearing(lat, lon, ap.lat, ap.lon)
      return { ...ap, distNM, bearingDeg, bearingLabel: formatDeg(bearingDeg) }
    })
    .sort((a, b) => a.distNM - b.distNM)
    .slice(0, limit)
}
