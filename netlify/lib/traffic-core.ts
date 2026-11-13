// ADS-B traffic proxy (docs/10-TRAFFIC.md). The browser can't call the ADS-B
// aggregators (no CORS headers), so this fetches one area and lets Netlify's CDN
// cache the answer for 5 s: phones at the same field ask for the same rounded
// area and share one upstream call.
//
// Only canonical areas are accepted — lat/lon multiples of 0.05°, nm a multiple
// of 5 in 15–100 — so odd coordinates can't bypass the cache and burn the
// upstream's 1 request/second limit.

/**
 * adsb.lol: open data (ODbL), no key, ADSBx v2 schema at /v2/point/{lat}/{lon}/{nm}.
 * (airplanes.live now answers 403 "please contact us" to unregistered API users.)
 * UPSTREAM_URL may list several, comma-separated: each is tried in turn when one fails.
 */
export const DEFAULT_UPSTREAM = 'https://api.adsb.lol/v2/point'
const MAX_ALT_FT = 18_000
const MAX_POS_AGE_S = 15

/** Upstream aircraft (ADSBx v2 schema). */
interface UpstreamAc {
  hex?: string; flight?: string; r?: string; t?: string
  lat?: number; lon?: number
  alt_baro?: number | 'ground'; alt_geom?: number
  gs?: number; track?: number; baro_rate?: number; geom_rate?: number
  seen_pos?: number; type?: string
}

/** What a phone gets per aircraft. Altitudes in ft (baro = pressure altitude, geom = GPS / WGS-84). */
export interface TrafficTarget {
  hex: string
  cs: string | null
  reg: string | null
  type: string | null
  lat: number
  lon: number
  alt: number | null
  altGeom: number | null
  gs: number | null
  trk: number | null
  vs: number | null
  /** Seconds old as of `t`. */
  age: number
  src: string | null
}

export interface TrafficResponse { t: number; area: { lat: number; lon: number; nm: number }; aircraft: TrafficTarget[] }

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** A multiple of 0.05 within range. The client's coverArea() must always pass this. */
export function canonicalCoord(x: number, min: number, max: number): boolean {
  return Number.isFinite(x) && x >= min && x <= max && Math.abs(x * 20 - Math.round(x * 20)) < 1e-6
}

export function canonicalArea(lat: number, lon: number, nm: number): boolean {
  return canonicalCoord(lat, -90, 90) && canonicalCoord(lon, -180, 180) &&
    Number.isInteger(nm) && nm % 5 === 0 && nm >= 15 && nm <= 100
}

/** Drop what isn't useful low-level traffic: no position, on the ground, above 18,000 ft, position older than 15 s. */
export function cleanTraffic(ac: UpstreamAc[]): TrafficTarget[] {
  return ac
    .filter(a => isNum(a.lat) && isNum(a.lon) && a.alt_baro !== 'ground' &&
      !(isNum(a.alt_baro) && a.alt_baro > MAX_ALT_FT) && (a.seen_pos ?? 0) <= MAX_POS_AGE_S)
    .map(a => ({
      hex: String(a.hex ?? '').toLowerCase(),
      cs: a.flight?.trim() || null,
      reg: a.r || null,
      type: a.t || null,
      lat: a.lat!,
      lon: a.lon!,
      alt: isNum(a.alt_baro) ? a.alt_baro : isNum(a.alt_geom) ? a.alt_geom : null,
      altGeom: isNum(a.alt_geom) ? a.alt_geom : null,
      gs: isNum(a.gs) ? a.gs : null,
      trk: isNum(a.track) ? a.track : null,
      vs: isNum(a.baro_rate) ? a.baro_rate : isNum(a.geom_rate) ? a.geom_rate : null,
      age: a.seen_pos ?? 0,
      src: a.type || null,
    }))
}

function json(obj: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } })
}

/** GET /api/traffic?lat=41.75&lon=-111.85&nm=20 */
export async function handleTraffic(req: Request, upstream: string, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405)
  const q = new URL(req.url).searchParams
  const lat = Number(q.get('lat')), lon = Number(q.get('lon')), nm = Number(q.get('nm'))
  if (!canonicalArea(lat, lon, nm)) return json({ error: 'area must be lat/lon rounded to 0.05 and nm a multiple of 5 (15-100)' }, 400)

  // Try each source in turn; the first good answer wins
  const failures: string[] = []
  let limited = false
  let data: { now?: number; ac?: UpstreamAc[] } | null = null
  for (const base of upstream.split(',').map(u => u.trim().replace(/\/+$/, '')).filter(Boolean)) {
    const host = base.replace(/^https?:\/\//, '').split('/')[0]
    try {
      const res = await fetchFn(`${base}/${lat}/${lon}/${nm}`, { headers: { 'User-Agent': 'UltraPilot-relay/1.0' }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) { limited ||= res.status === 429; failures.push(`${host} returned ${res.status}`); continue }
      const body = await res.json() as { now?: number; ac?: UpstreamAc[] }
      if (!Array.isArray(body?.ac)) { failures.push(`${host} sent bad data`); continue }
      data = body
      break
    } catch {
      failures.push(`${host} unreachable`)
    }
  }
  // 429 = upstream rate limit. Don't cache errors; tell the client to back off.
  if (!data) return json({ error: `traffic source: ${failures.join('; ') || 'none configured'}` }, limited ? 503 : 502, { 'Retry-After': '5' })
  const body: TrafficResponse = { t: data.now ?? Date.now(), area: { lat, lon, nm }, aircraft: cleanTraffic(data.ac ?? []) }
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      // Shared CDN cache (all edges via durable): 5 s fresh + 5 s stale-while-revalidate
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=5, stale-while-revalidate=5',
      'Netlify-Vary': 'query=lat|lon|nm',
      // Browsers must not cache it themselves
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
