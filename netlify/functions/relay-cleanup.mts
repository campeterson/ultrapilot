// Live Group relay cleanup, every 5 minutes: drop old position buckets and
// groups idle for 24 h. Bounded per run (docs/09-LIVE_GROUP.md §3).
import { createRelay } from '../edge-functions/lib/relay-core.ts'
import { blobsStore } from '../edge-functions/lib/blobs-store.ts'

export default async () => {
  const { deleted } = await createRelay(blobsStore).cleanup()
  console.log(`relay-cleanup: deleted ${deleted} keys`)
}

export const config = { schedule: '*/5 * * * *' }
