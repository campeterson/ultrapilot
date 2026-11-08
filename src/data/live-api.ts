// Live Group relay HTTP client. Side-effecting I/O (fetch), called only from
// the state layer — like satellite-cache.ts. Routes: docs/09-LIVE_GROUP.md §3.

const API = '/api'

export class RelayError extends Error {
  /** `code`: 'no-group' (relay has no such group), 'no-route' / 'no-relay' (relay not answering on /api). */
  constructor(public status: number, message: string, public code?: string) { super(message) }
}

/** Retry only transient failures (network, 5xx), 3 tries, 250 ms backoff. */
async function call(path: string, init: RequestInit = {}, tries = 3): Promise<Response> {
  let delay = 250
  for (let i = 0; ; i++) {
    let res: Response | null = null
    try { res = await fetch(API + path, { ...init, signal: AbortSignal.timeout(10_000) }) } catch { res = null }
    if (res && res.status < 500) return res
    if (i >= tries - 1) {
      if (!res) throw new RelayError(0, 'No connection')
      throw new RelayError(res.status, 'Relay is busy — try again')
    }
    await new Promise(r => setTimeout(r, delay))
    delay *= 2
  }
}

async function send(method: string, path: string, body: unknown): Promise<Response> {
  const res = await call(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.status >= 400 && res.status !== 429) {
    const body = await res.json().catch(() => null) as { error?: string; code?: string } | null
    // No JSON at all: something other than the relay answered (not deployed)
    throw new RelayError(res.status, body?.error ?? `Request failed (${res.status})`, body ? body.code : 'no-relay')
  }
  return res
}

/** One round trip: server time and the measured round-trip time. */
export async function serverTime(): Promise<{ now: number; rtt: number }> {
  const t0 = performance.now()
  const res = await call('/time', { cache: 'no-store' }, 1)
  const { now } = await res.json() as { now: number }
  return { now, rtt: performance.now() - t0 }
}

export async function createGroup(g: string, wtag: string, ownerKey: string): Promise<void> {
  await send('PUT', '/group', { g, wtag, ownerKey })
}

export async function joinGroup(g: string, writeKey: string, memberKey: string, seq: string, nameCipher: string): Promise<string> {
  // A just-created group can take a moment to be visible everywhere: retry "no such group" twice
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await send('POST', '/join', { g, writeKey, memberKey, seq, nameCipher })
      return (await res.json() as { pubId: string }).pubId
    } catch (e) {
      if (!(e instanceof RelayError) || e.code !== 'no-group' || attempt >= 2) throw e
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}

export interface RelayHealth { ok: boolean; readBack?: boolean; ms?: number; error?: string }

/** Can the relay write, read and delete in its storage? */
export async function relayHealth(): Promise<RelayHealth> {
  const res = await call('/health', { cache: 'no-store' }, 1)
  const body = await res.json().catch(() => null) as RelayHealth | null
  if (!body) throw new RelayError(res.status, 'The Live Group server isn’t answering on this site', 'no-relay')
  return body
}

/** Does the relay see this group? */
export async function groupExists(g: string): Promise<{ exists: boolean; created: number | null; updatedAt: number | null }> {
  const res = await call(`/group?g=${encodeURIComponent(g)}`, { cache: 'no-store' }, 1)
  const body = await res.json().catch(() => null)
  if (!body) throw new RelayError(res.status, 'The Live Group server isn’t answering on this site', 'no-relay')
  return body
}

/** false when the relay rate-limited this fix (it's simply skipped). */
export async function sendFix(g: string, writeKey: string, memberKey: string, seq: string, cipher: string): Promise<boolean> {
  const res = await send('POST', '/fix', { g, writeKey, memberKey, seq, cipher })
  return res.status !== 429
}

export async function endGroup(g: string, ownerKey: string): Promise<void> {
  await send('DELETE', '/group', { g, ownerKey })
}

export interface LocsResponse {
  now: number
  members: [pubId: string, seq: string, nameCipher: string][]
  fixes: [pubId: string, seq: string, cipher: string][]
}

/** Latest positions. null = unchanged since `etag` (304). */
export async function fetchLocs(g: string, t: number, etag: string | null): Promise<{ data: LocsResponse; etag: string | null } | null> {
  const res = await call(`/locs?g=${encodeURIComponent(g)}&t=${t}`, { headers: etag ? { 'If-None-Match': etag } : {} }, 1)
  if (res.status === 304) return null
  if (!res.ok) throw new RelayError(res.status, `Positions failed (${res.status})`)
  return { data: await res.json() as LocsResponse, etag: res.headers.get('ETag') }
}
