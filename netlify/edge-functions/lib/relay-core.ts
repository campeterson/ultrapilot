// Live Group location relay — the logic, independent of Netlify.
//
// A thin, stateless mailbox in front of a key-value store (Netlify Blobs in
// production, an in-memory map in tests). It never sees plaintext: positions
// and names arrive encrypted and are stored inside key names, so one list()
// returns every member's latest fix. See docs/09-LIVE_GROUP.md and the
// Location Relay Spec.
//
// Runs in Deno (Edge Function) and Node (tests): Web APIs only.

export interface RelayStore {
  /** Text value, or null when missing. */
  get(key: string): Promise<string | null>
  set(key: string, value: string, opts?: { onlyIfNew?: boolean; metadata?: Record<string, unknown> }): Promise<{ modified: boolean }>
  getMetadata(key: string): Promise<Record<string, unknown> | null>
  /** Keys under a prefix; with `directories`, also the next-level "folders". */
  list(prefix: string, directories?: boolean): Promise<{ keys: string[]; directories: string[] }>
  delete(key: string): Promise<void>
}

export const BUCKET_SEC = 60
/** Fixes from one member closer together than this are dropped (429). */
export const MIN_FIX_GAP_MS = 2000
const LOCS_MEMO_MS = 1000
const META_MEMO_MS = 5 * 60_000
const TOUCH_EVERY_MS = 60_000
const GROUP_IDLE_MS = 24 * 3600_000
const MAX_CLEANUP_DELETES = 5000

const RE_G = /^[A-Za-z0-9_-]{43}$/
const RE_SEQ = /^[0-9a-z]{7}$/
const RE_B64 = /^[A-Za-z0-9_-]+$/
const CIPHER_LEN = 70
const MAX_NAME_CIPHER = 100
const MAX_BODY = 1024

// ─── helpers ─────────────────────────────────────────────────────────────────

const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256b64(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))))
}

/** Same derivations as the client (src/data/logic/live-codec.ts). */
export async function pubIdFor(memberKey: string): Promise<string> {
  return (await sha256b64('pid|' + memberKey)).slice(0, 16)
}
async function wtagFor(writeKey: string): Promise<string> {
  return (await sha256b64(writeKey)).slice(0, 16)
}
async function ownerTagFor(ownerKey: string): Promise<string> {
  return sha256b64(ownerKey)
}

/** FNV-1a, for body ETags (the local Blobs sandbox gives none). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })
const empty = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
const bad = (msg: string) => json(400, { error: msg })

class StorageError extends Error {}

// ─── relay ───────────────────────────────────────────────────────────────────

interface Meta { wtag: string; ownerTag: string; created: number }

export function createRelay(store: () => RelayStore, now: () => number = Date.now) {
  // Per-isolate memos — opportunistic only; isolates are not shared and die anytime.
  const metaMemo = new Map<string, { meta: Meta | null; at: number }>()
  const touchMemo = new Map<string, number>()
  const lastFix = new Map<string, number>()
  const locsMemo = new Map<string, { at: number; body: string; etag: string }>()

  const bucketOf = (ms: number) => Math.floor(ms / 1000 / BUCKET_SEC)

  async function guard<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn() } catch (e) { throw new StorageError(String(e)) }
  }

  async function readMeta(s: RelayStore, g: string): Promise<Meta | null> {
    const m = metaMemo.get(g)
    if (m && now() - m.at < META_MEMO_MS) return m.meta
    const raw = await guard(() => s.get(`grp/${g}/meta`))
    const meta = raw ? (JSON.parse(raw) as Meta) : null
    metaMemo.set(g, { meta, at: now() })
    return meta
  }

  /** Write gate: the caller must hold the invite's writeKey. */
  async function checkWrite(s: RelayStore, g: string, writeKey: unknown): Promise<Meta | Response> {
    if (typeof writeKey !== 'string' || !RE_B64.test(writeKey) || writeKey.length > 64) return bad('writeKey')
    const meta = await readMeta(s, g)
    if (!meta) return json(404, { error: 'No such group' })
    if ((await wtagFor(writeKey)) !== meta.wtag) return json(403, { error: 'Not a member of this group' })
    return meta
  }

  /** Keep the group alive for cleanup: bump meta.updatedAt at most once a minute. */
  async function touch(s: RelayStore, g: string, meta: Meta) {
    const last = touchMemo.get(g) ?? 0
    if (now() - last < TOUCH_EVERY_MS) return
    touchMemo.set(g, now())
    await guard(() => s.set(`grp/${g}/meta`, JSON.stringify(meta), { metadata: { updatedAt: now() } }))
  }

  async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
    const text = await req.text()
    if (text.length > MAX_BODY) return json(413, { error: 'Body too large' })
    try {
      const v = JSON.parse(text)
      return v && typeof v === 'object' ? v : bad('JSON object expected')
    } catch { return bad('Invalid JSON') }
  }

  const validG = (g: unknown): g is string => typeof g === 'string' && RE_G.test(g)
  const validKey = (k: unknown): k is string => typeof k === 'string' && RE_B64.test(k) && k.length >= 32 && k.length <= 64

  // ─── routes ────────────────────────────────────────────────────────────────

  async function createGroup(req: Request): Promise<Response> {
    const b = await readBody(req); if (b instanceof Response) return b
    const { g, wtag, ownerKey } = b
    if (!validG(g) || typeof wtag !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(wtag) || !validKey(ownerKey)) return bad('g, wtag, ownerKey')
    const meta: Meta = { wtag, ownerTag: await ownerTagFor(ownerKey), created: now() }
    const s = store()
    const r = await guard(() => s.set(`grp/${g}/meta`, JSON.stringify(meta), { onlyIfNew: true, metadata: { updatedAt: now() } }))
    if (!r.modified) return json(409, { error: 'Group exists' })
    metaMemo.set(g, { meta, at: now() })
    return json(201, { ok: true })
  }

  async function join(req: Request): Promise<Response> {
    const b = await readBody(req); if (b instanceof Response) return b
    const { g, writeKey, memberKey, seq, nameCipher } = b
    if (!validG(g) || !validKey(memberKey) || typeof seq !== 'string' || !RE_SEQ.test(seq)
      || typeof nameCipher !== 'string' || !RE_B64.test(nameCipher) || nameCipher.length > MAX_NAME_CIPHER) return bad('g, memberKey, seq, nameCipher')
    const s = store()
    const meta = await checkWrite(s, g, writeKey); if (meta instanceof Response) return meta
    const pubId = await pubIdFor(memberKey)
    const prefix = `grp/${g}/m/${pubId}~`
    const old = await guard(() => s.list(prefix))
    await guard(() => s.set(`${prefix}${seq}~${nameCipher}`, ''))
    for (const k of old.keys) if (k !== `${prefix}${seq}~${nameCipher}`) await guard(() => s.delete(k))
    await touch(s, g, meta)
    locsMemo.delete(g)
    return json(200, { pubId })
  }

  async function fix(req: Request): Promise<Response> {
    const b = await readBody(req); if (b instanceof Response) return b
    const { g, writeKey, memberKey, seq, cipher } = b
    if (!validG(g) || !validKey(memberKey) || typeof seq !== 'string' || !RE_SEQ.test(seq)
      || typeof cipher !== 'string' || cipher.length !== CIPHER_LEN || !RE_B64.test(cipher)) return bad('g, memberKey, seq, cipher')
    const s = store()
    const meta = await checkWrite(s, g, writeKey); if (meta instanceof Response) return meta
    const pubId = await pubIdFor(memberKey)
    const key = `${g}|${pubId}`
    const prev = lastFix.get(key) ?? 0
    if (now() - prev < MIN_FIX_GAP_MS) return empty(429, { 'Retry-After': '2' })
    lastFix.set(key, now())
    await guard(() => s.set(`grp/${g}/l/${bucketOf(now())}/${pubId}~${seq}~${cipher}`, ''))
    await touch(s, g, meta)
    return empty(204)
  }

  async function locs(req: Request, url: URL): Promise<Response> {
    const g = url.searchParams.get('g')
    if (!validG(g)) return bad('g')
    const cacheHeaders = {
      'Cache-Control': 'no-cache',
      'Netlify-CDN-Cache-Control': 'public, max-age=2',
      'Netlify-Vary': 'query=g|t',
    }
    let memo = locsMemo.get(g)
    if (!memo || now() - memo.at > LOCS_MEMO_MS) {
      const s = store()
      const b = bucketOf(now())
      const [cur, prev, roster] = await guard(() => Promise.all([
        s.list(`grp/${g}/l/${b}/`), s.list(`grp/${g}/l/${b - 1}/`), s.list(`grp/${g}/m/`),
      ]))
      // Newest fix per member, chosen from key names (no decryption needed)
      const newest = new Map<string, [string, string, string]>()
      for (const k of [...prev.keys, ...cur.keys]) {
        const [pubId, seq, cipher] = k.slice(k.lastIndexOf('/') + 1).split('~')
        if (!pubId || !seq || !cipher) continue
        const have = newest.get(pubId)
        if (!have || seq > have[1]) newest.set(pubId, [pubId, seq, cipher])
      }
      const names = new Map<string, [string, string, string]>()
      for (const k of roster.keys) {
        const [pubId, seq, nameCipher] = k.slice(k.lastIndexOf('/') + 1).split('~')
        if (!pubId || !seq || !nameCipher) continue
        const have = names.get(pubId)
        if (!have || seq > have[1]) names.set(pubId, [pubId, seq, nameCipher])
      }
      const body = JSON.stringify({ members: [...names.values()], fixes: [...newest.values()] })
      memo = { at: now(), body, etag: `"${fnv1a(body)}"` }
      locsMemo.set(g, memo)
    }
    const inm = req.headers.get('If-None-Match')
    if (inm && inm.split(',').some(t => t.trim().replace(/^W\//, '') === memo!.etag)) {
      return new Response(null, { status: 304, headers: { ...cacheHeaders, ETag: memo.etag } })
    }
    // `now` is added outside the ETag so an unchanged group still returns 304
    const body = memo.body.replace(/^\{/, `{"now":${now()},`)
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', ETag: memo.etag, ...cacheHeaders } })
  }

  async function endGroup(req: Request): Promise<Response> {
    const b = await readBody(req); if (b instanceof Response) return b
    const { g, ownerKey } = b
    if (!validG(g) || !validKey(ownerKey)) return bad('g, ownerKey')
    const s = store()
    metaMemo.delete(g)
    const meta = await readMeta(s, g)
    if (!meta) return empty(204)
    if ((await ownerTagFor(ownerKey)) !== meta.ownerTag) return json(403, { error: 'Only the group creator can end it' })
    await deletePrefix(s, `grp/${g}/`, Infinity)
    metaMemo.delete(g); locsMemo.delete(g)
    return empty(204)
  }

  async function deletePrefix(s: RelayStore, prefix: string, budget: number): Promise<number> {
    const { keys } = await guard(() => s.list(prefix))
    let n = 0
    for (const k of keys) { if (n >= budget) break; await guard(() => s.delete(k)); n++ }
    return n
  }

  /** Route a request. `path` is the URL path with any `/index.htm(l)` suffix removed. */
  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/index\.html?$/, '').replace(/\/+$/, '')
    try {
      if (req.method === 'GET' && path === '/api/time') return json(200, { now: now() })
      if (req.method === 'PUT' && path === '/api/group') return await createGroup(req)
      if (req.method === 'DELETE' && path === '/api/group') return await endGroup(req)
      if (req.method === 'POST' && path === '/api/join') return await join(req)
      if (req.method === 'POST' && path === '/api/fix') return await fix(req)
      if (req.method === 'GET' && path === '/api/locs') return await locs(req, url)
      return json(404, { error: 'Not found' })
    } catch (e) {
      if (e instanceof StorageError) return json(503, { error: 'Storage busy, retry' }, { 'Retry-After': '1' })
      throw e
    }
  }

  /** Scheduled cleanup: old buckets, idle groups. Bounded per run. */
  async function cleanup(): Promise<{ deleted: number }> {
    const s = store()
    let budget = MAX_CLEANUP_DELETES
    const cutoffBucket = bucketOf(now()) - 2
    const { directories: groups } = await s.list('grp/', true)
    for (const gdir of groups) {
      if (budget <= 0) break
      const g = gdir.replace(/^grp\//, '').replace(/\/$/, '')
      const md = await s.getMetadata(`grp/${g}/meta`)
      const updatedAt = typeof md?.updatedAt === 'number' ? md.updatedAt : 0
      if (!md || now() - updatedAt > GROUP_IDLE_MS) {
        budget -= await deletePrefix(s, `grp/${g}/`, budget)
        continue
      }
      const { directories: buckets } = await s.list(`grp/${g}/l/`, true)
      for (const bdir of buckets) {
        const n = Number(bdir.replace(/\/$/, '').split('/').pop())
        if (Number.isFinite(n) && n < cutoffBucket) budget -= await deletePrefix(s, bdir.endsWith('/') ? bdir : bdir + '/', budget)
        if (budget <= 0) break
      }
    }
    return { deleted: MAX_CLEANUP_DELETES - budget }
  }

  return { handle, cleanup }
}

/** In-memory store with Netlify Blobs list semantics — for tests and local dev. */
export function memoryStore(): RelayStore & { size(): number } {
  const data = new Map<string, { value: string; metadata: Record<string, unknown> }>()
  return {
    size: () => data.size,
    async get(k) { return data.get(k)?.value ?? null },
    async set(k, value, opts = {}) {
      if (opts.onlyIfNew && data.has(k)) return { modified: false }
      data.set(k, { value, metadata: opts.metadata ?? {} })
      return { modified: true }
    },
    async getMetadata(k) { return data.get(k)?.metadata ?? null },
    async list(prefix, directories = false) {
      const keys: string[] = []
      const dirs = new Set<string>()
      for (const k of data.keys()) {
        if (!k.startsWith(prefix)) continue
        const rest = k.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (directories && slash >= 0) dirs.add(prefix + rest.slice(0, slash))
        else keys.push(k)
      }
      return { keys: keys.sort(), directories: [...dirs].sort() }
    },
    async delete(k) { data.delete(k) },
  }
}
