// GET /api/traffic — ADS-B traffic for one canonical area, CDN-cached 5 s.
// Logic in ../lib/traffic-core.ts; docs/10-TRAFFIC.md. Upstream swappable via UPSTREAM_URL.
import { DEFAULT_UPSTREAM, handleTraffic } from '../lib/traffic-core.ts'

export default (req: Request) => handleTraffic(req, process.env.UPSTREAM_URL || DEFAULT_UPSTREAM)

export const config = { path: '/api/traffic' }
