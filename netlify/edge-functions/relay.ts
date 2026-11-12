// Live Group location relay (docs/09-LIVE_GROUP.md). Stateless; never sees plaintext.
import { createRelay } from './lib/relay-core.ts'
import { blobsStore } from './lib/blobs-store.ts'

const relay = createRelay(blobsStore)

export default (req: Request) => relay.handle(req)

// cache: "manual" — without it the CDN cache headers on /api/locs are ignored.
// /api/traffic is a Netlify Function (netlify/functions/traffic.mts), not the relay.
export const config = { path: '/api/*', excludedPath: ['/api/traffic'], cache: 'manual' }
