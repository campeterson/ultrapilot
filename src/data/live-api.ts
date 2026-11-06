// Live Group relay HTTP client. Side-effecting I/O (fetch), called only from
// the state layer — like satellite-cache.ts. Routes: docs/09-LIVE_GROUP.md §3.

const API = '/api'

export class RelayError extends Error {
  constructor(public status: number, message: string) { super(message) }
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
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => null)
    throw new RelayError(res.status, msg ?? `Request failed (${res.status})`)
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
  const res = await send('POST', '/join', { g, writeKey, memberKey, seq, nameCipher })
  return (await res.json() as { pubId: string }).pubId
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
