// Live Group: codec, send rule and relay core, against an in-memory store.
// Run: npm run test:live
import { createRelay, memoryStore } from '../netlify/edge-functions/lib/relay-core'
import { deriveGroupKeys, randomKey, pubIdFor, encryptFix, decryptFix, encryptName, decryptName, encodeFix, decodeFix, FLAG_STOPPED } from '../src/data/logic/live-codec'
import { seqAt, shouldSend, composeName, parseName, parseInvite, inviteLink, displayCallsigns, freshness } from '../src/data/logic/live-logic'

let ok = 0, fail = 0
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log('FAIL', name) } }

;(async () => {
  // codec
  const f = { lat: 38.1234567, lon: -94.7654321, altM: 312, accM: 5, speedMs: 12.3, trackDeg: 271, ts: Date.UTC(2026, 10, 6, 15, 0, 7), flags: 0 }
  const r = decodeFix(encodeFix(f))
  check('round trip', Math.abs(r.lat - f.lat) < 1e-7 && Math.abs(r.lon - f.lon) < 1e-7 && r.altM === 312 && r.speedMs === 12.3 && r.trackDeg === 271 && r.ts === f.ts)
  const n = decodeFix(encodeFix({ ...f, altM: null, speedMs: null, trackDeg: null }))
  check('nulls', n.altM === null && n.speedMs === null && n.trackDeg === null)
  const secret = randomKey()
  const keys = await deriveGroupKeys(secret)
  const memberKey = randomKey()
  const pubId = await pubIdFor(memberKey)
  const seq = seqAt(Date.now())
  const cipher = await encryptFix(keys, pubId, seq, f)
  check('cipher 70', cipher.length === 70)
  check('decrypt', (await decryptFix(keys, pubId, seq, cipher)).lat === r.lat)
  check('tamper pubId fails', await decryptFix(keys, 'x' + pubId.slice(1), seq, cipher).then(() => false, () => true))
  check('tamper seq fails', await decryptFix(keys, pubId, seqAt(Date.now() + 5000), cipher).then(() => false, () => true))
  const nc = await encryptName(keys, pubId, seq, composeName('chase', 'CHASE 1'))
  check('name ≤100', nc.length <= 100)
  const pn = parseName(await decryptName(keys, pubId, seq, nc))
  check('name', pn.role === 'chase' && pn.callsign === 'CHASE 1')
  check('long name cipher ≤100', (await encryptName(keys, pubId, seq, composeName('balloon', 'ÄÖÜ'.repeat(10)))).length <= 100)
  // logic
  check('invite parse', parseInvite(inviteLink('https://x.app', secret)) === secret && parseInvite(secret) === secret && parseInvite('junk') === null)
  const last = { lat: 38, lon: -94, trackDeg: 90, at: 0 }
  check('gap', !shouldSend(last, { lat: 38.01, lon: -94, trackDeg: 90 }, 2000, 'ppc'))
  check('moved', shouldSend(last, { lat: 38.001, lon: -94, trackDeg: 90 }, 3000, 'ppc'))
  check('still', !shouldSend(last, { lat: 38, lon: -94, trackDeg: 92 }, 6000, 'ppc'))
  check('turned', shouldSend(last, { lat: 38, lon: -94, trackDeg: 120 }, 3000, 'ppc'))
  check('chase gap 5s', !shouldSend(last, { lat: 38.01, lon: -94, trackDeg: 90 }, 4000, 'chase'))
  check('heartbeat', shouldSend(last, { lat: 38, lon: -94, trackDeg: 90 }, 15000, 'balloon'))
  check('freshness', freshness(5) === 'live' && freshness(40) === 'fading' && freshness(70) === 'stale')
  const dc = displayCallsigns([{ pubId: 'abc', callsign: 'CHASE' }, { pubId: 'xyz', callsign: 'chase' }, { pubId: 'q', callsign: 'B1' }])
  check('dupes', dc.get('abc') === 'CHASE ·ab' && dc.get('q') === 'B1')
  check('seq monotonic', seqAt(1_800_000_000_000) > seqAt(1_799_999_999_900))

  // relay
  let clock = Date.UTC(2026, 10, 6, 15, 0, 0)
  const store = memoryStore()
  const relay = createRelay(() => store, () => clock)
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    relay.handle(new Request('https://x' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }))
  const ownerKey = randomKey()
  check('create', (await req('PUT', '/api/group', { g: keys.g, wtag: keys.wtag, ownerKey })).status === 201)
  check('create again 409', (await req('PUT', '/api/group', { g: keys.g, wtag: keys.wtag, ownerKey })).status === 409)
  const s1 = seqAt(clock)
  const nm = await encryptName(keys, pubId, s1, composeName('balloon', 'SKY 1'))
  const j = await req('POST', '/api/join', { g: keys.g, writeKey: keys.writeKey, memberKey, seq: s1, nameCipher: nm })
  check('join', j.status === 200 && (await j.json()).pubId === pubId)
  check('join bad key 403', (await req('POST', '/api/join', { g: keys.g, writeKey: randomKey(), memberKey, seq: s1, nameCipher: nm })).status === 403)
  check('join no group 404', (await req('POST', '/api/join', { g: (await deriveGroupKeys(randomKey())).g, writeKey: keys.writeKey, memberKey, seq: s1, nameCipher: nm })).status === 404)
  const fixBody = async (fx: typeof f, at: number) => { const sq = seqAt(at); return { g: keys.g, writeKey: keys.writeKey, memberKey, seq: sq, cipher: await encryptFix(keys, pubId, sq, fx) } }
  check('fix 204', (await req('POST', '/api/fix', await fixBody(f, clock))).status === 204)
  clock += 1000
  check('fix too soon 429', (await req('POST', '/api/fix', await fixBody(f, clock))).status === 429)
  clock += 3000
  const f2 = { ...f, lat: 38.2 }
  check('fix 2', (await req('POST', '/api/fix', await fixBody(f2, clock))).status === 204)
  check('fix bad cipher 400', (await req('POST', '/api/fix', { ...(await fixBody(f2, clock + 5000)), cipher: 'abc' })).status === 400)
  clock += 1500
  const l = await req('GET', `/api/locs?g=${keys.g}&t=1`)
  const lj = await l.json()
  check('locs newest only', lj.fixes.length === 1 && (await decryptFix(keys, lj.fixes[0][0], lj.fixes[0][1], lj.fixes[0][2])).lat === 38.2)
  check('locs roster', lj.members.length === 1 && parseName(await decryptName(keys, lj.members[0][0], lj.members[0][1], lj.members[0][2])).callsign === 'SKY 1')
  check('cdn headers', l.headers.get('Netlify-Vary') === 'query=g|t' && l.headers.get('Netlify-CDN-Cache-Control') === 'public, max-age=2')
  check('304 weak', (await req('GET', `/api/locs?g=${keys.g}&t=1`, undefined, { 'If-None-Match': 'W/' + l.headers.get('ETag') })).status === 304)
  // rename replaces roster key
  clock += 2000
  const s2 = seqAt(clock)
  await req('POST', '/api/join', { g: keys.g, writeKey: keys.writeKey, memberKey, seq: s2, nameCipher: await encryptName(keys, pubId, s2, composeName('balloon', 'SKY ONE')) })
  check('one roster key', (await store.list(`grp/${keys.g}/m/`)).keys.length === 1)
  // ages out of both buckets
  clock += 3 * 60_000
  const l2 = await (await req('GET', `/api/locs?g=${keys.g}&t=2`)).json()
  check('aged out', l2.fixes.length === 0 && l2.members.length === 1)
  // cleanup drops old buckets
  const before = store.size()
  const c = await relay.cleanup()
  check('cleanup buckets', c.deleted >= 2 && store.size() < before && (await store.get(`grp/${keys.g}/meta`)) !== null)
  // idle group removed after 24h
  clock += 25 * 3600_000
  await relay.cleanup()
  check('cleanup idle group', (await store.list(`grp/${keys.g}/`)).keys.length === 0)
  // end group: owner only
  const k2 = await deriveGroupKeys(randomKey()); const own2 = randomKey()
  await req('PUT', '/api/group', { g: k2.g, wtag: k2.wtag, ownerKey: own2 })
  check('end not owner 403', (await req('DELETE', '/api/group', { g: k2.g, ownerKey: randomKey() })).status === 403)
  check('end owner 204', (await req('DELETE', '/api/group', { g: k2.g, ownerKey: own2 })).status === 204 && (await store.list(`grp/${k2.g}/`)).keys.length === 0)
  // storage errors → 503
  const broken = createRelay(() => ({ ...memoryStore(), get: async () => { throw new Error('boom') } }), () => clock)
  const b503 = await broken.handle(new Request('https://x/api/join', { method: 'POST', body: JSON.stringify({ g: keys.g, writeKey: keys.writeKey, memberKey, seq: s1, nameCipher: nm }) }))
  check('503 retry-after', b503.status === 503 && b503.headers.get('Retry-After') === '1')
  check('tombstone flag', decodeFix(encodeFix({ ...f, flags: FLAG_STOPPED })).flags === FLAG_STOPPED)
  console.log(`${ok} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
