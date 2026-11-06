// Live Group wire format: key derivation, the 24-byte position fix, and
// AES-GCM encryption. Pure computation (Web Crypto), no I/O. Must match the
// relay (netlify/edge-functions/lib/relay-core.ts) and docs/09-LIVE_GROUP.md §3.

const enc = new TextEncoder()
const dec = new TextDecoder()

// ─── base64url ───────────────────────────────────────────────────────────────

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(text: string): Uint8Array {
  const b = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4))
  return Uint8Array.from(b, c => c.charCodeAt(0))
}

export function randomKey(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)))
}

async function sha256b64(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))))
}

// ─── keys ────────────────────────────────────────────────────────────────────

export interface GroupKeys {
  /** Public group id used in every API call. */
  g: string
  /** Proves membership to the relay (hashed there into `wtag`). */
  writeKey: string
  wtag: string
  /** Encrypts positions and names; never leaves the device. */
  encKey: CryptoKey
}

async function hkdf(secret: Uint8Array, info: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) }, base, 256)
  return new Uint8Array(bits)
}

export async function deriveGroupKeys(groupSecret: string): Promise<GroupKeys> {
  const secret = fromB64url(groupSecret)
  const g = await sha256b64('gid|' + groupSecret)
  const writeKey = b64url(await hkdf(secret, 'write'))
  const wtag = (await sha256b64(writeKey)).slice(0, 16)
  const encRaw = await hkdf(secret, 'enc')
  const encKey = await crypto.subtle.importKey('raw', encRaw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { g, writeKey, wtag, encKey }
}

/** Same derivation the relay uses, so a device knows its own id. */
export async function pubIdFor(memberKey: string): Promise<string> {
  return (await sha256b64('pid|' + memberKey)).slice(0, 16)
}

// ─── fix ─────────────────────────────────────────────────────────────────────

/** Seconds are counted from this fixed epoch (2026-01-01T00:00:00Z). */
export const FIX_EPOCH_MS = Date.UTC(2026, 0, 1)

export const FLAG_STOPPED = 1
export const FLAG_ATTENTION = 2

export interface LiveFix {
  lat: number
  lon: number
  altM: number | null
  accM: number
  /** Ground speed, m/s */
  speedMs: number | null
  /** True track, degrees */
  trackDeg: number | null
  /** Epoch ms of the fix (server-corrected clock), to 1 s */
  ts: number
  flags: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function encodeFix(f: LiveFix): Uint8Array {
  const b = new Uint8Array(24)
  const v = new DataView(b.buffer)
  v.setInt32(0, Math.round(f.lat * 1e7), true)
  v.setInt32(4, Math.round(f.lon * 1e7), true)
  v.setInt16(8, f.altM == null ? -32768 : clamp(Math.round(f.altM), -32767, 32767), true)
  v.setUint16(10, clamp(Math.round(f.accM), 0, 65535), true)
  v.setUint16(12, f.speedMs == null ? 65535 : clamp(Math.round(f.speedMs * 10), 0, 65534), true)
  v.setUint16(14, f.trackDeg == null ? 65535 : Math.round(((f.trackDeg % 360) + 360) % 360) % 360, true)
  v.setUint32(16, clamp(Math.round((f.ts - FIX_EPOCH_MS) / 1000), 0, 0xffffffff), true)
  v.setUint16(20, f.flags & 0xffff, true)
  return b
}

export function decodeFix(b: Uint8Array): LiveFix {
  if (b.length !== 24) throw new Error('Fix must be 24 bytes')
  const v = new DataView(b.buffer, b.byteOffset, 24)
  const alt = v.getInt16(8, true), spd = v.getUint16(12, true), hdg = v.getUint16(14, true)
  return {
    lat: v.getInt32(0, true) / 1e7,
    lon: v.getInt32(4, true) / 1e7,
    altM: alt === -32768 ? null : alt,
    accM: v.getUint16(10, true),
    speedMs: spd === 65535 ? null : spd / 10,
    trackDeg: hdg === 65535 ? null : hdg,
    ts: FIX_EPOCH_MS + v.getUint32(16, true) * 1000,
    flags: v.getUint16(20, true),
  }
}

// ─── encryption ──────────────────────────────────────────────────────────────

async function seal(key: CryptoKey, plain: Uint8Array, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plain as BufferSource))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv); out.set(ct, 12)
  return b64url(out)
}

async function open(key: CryptoKey, cipher: string, aad: string): Promise<Uint8Array> {
  const all = fromB64url(cipher)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), additionalData: enc.encode(aad) }, key, all.slice(12))
  return new Uint8Array(pt)
}

/** 70-char cipher; bound to the group, member and sequence so it can't be moved or replayed out of order. */
export function encryptFix(keys: GroupKeys, pubId: string, seq: string, fix: LiveFix): Promise<string> {
  return seal(keys.encKey, encodeFix(fix), `${keys.g}|${pubId}|${seq}`)
}

export async function decryptFix(keys: GroupKeys, pubId: string, seq: string, cipher: string): Promise<LiveFix> {
  return decodeFix(await open(keys.encKey, cipher, `${keys.g}|${pubId}|${seq}`))
}

export function encryptName(keys: GroupKeys, pubId: string, seq: string, name: string): Promise<string> {
  return seal(keys.encKey, enc.encode(name), `${keys.g}|${pubId}|name|${seq}`)
}

export async function decryptName(keys: GroupKeys, pubId: string, seq: string, cipher: string): Promise<string> {
  return dec.decode(await open(keys.encKey, cipher, `${keys.g}|${pubId}|name|${seq}`))
}

/** Per-member counter as 7 base-36 digits, so string order is numeric order. */
export function formatSeq(n: number): string {
  return Math.max(0, Math.floor(n)).toString(36).padStart(7, '0').slice(-7)
}
