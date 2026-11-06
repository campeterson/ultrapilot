// Netlify Blobs behind the relay's small store interface.
// A store is created per request: one cached at module scope holds a token that
// expires, which shows up as 401 "Token expired" in production (relay spec §11.1).
import { getStore } from '@netlify/blobs'
import type { RelayStore } from './relay-core.ts'

export function blobsStore(): RelayStore {
  const s = getStore({ name: 'loc-relay', consistency: 'strong' })
  return {
    async get(key) { return (await s.get(key, { type: 'text' })) ?? null },
    async set(key, value, opts = {}) {
      const r = await s.set(key, value, opts.onlyIfNew ? { onlyIfNew: true, metadata: opts.metadata } : { metadata: opts.metadata })
      return { modified: r.modified }
    },
    async getMetadata(key) { return (await s.getMetadata(key))?.metadata ?? null },
    async list(prefix, directories = false) {
      const r = await s.list({ prefix, directories })
      return { keys: r.blobs.map(b => b.key), directories: r.directories ?? [] }
    },
    async delete(key) { await s.delete(key) },
  }
}
