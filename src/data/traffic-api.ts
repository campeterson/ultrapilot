// ADS-B traffic client: GET /api/traffic (netlify/functions/traffic.mts).
// Side-effecting I/O, called only from the state layer — like live-api.ts.
import { areaQuery, type TrafficArea, type TrafficTarget } from './logic/traffic-logic'

export class TrafficError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Aircraft in the area, ages corrected for the server→phone delay. */
export async function fetchTraffic(area: TrafficArea): Promise<TrafficTarget[]> {
  let res: Response
  try {
    res = await fetch(`/api/traffic?${areaQuery(area)}`, { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new TrafficError(0, 'No connection')
  }
  const body = await res.json().catch(() => null) as { t?: number; aircraft?: TrafficTarget[]; error?: string } | null
  if (!res.ok || !body?.aircraft) {
    throw new TrafficError(res.status, res.status === 503 ? 'Traffic source busy' : body?.error ?? (body ? `Traffic failed (${res.status})` : 'Traffic server not on this site'))
  }
  // The response may come from the CDN cache: add the time since the server built it
  const skew = Math.max(0, (Date.now() - (body.t ?? Date.now())) / 1000)
  return body.aircraft.map(a => ({ ...a, age: a.age + skew }))
}
