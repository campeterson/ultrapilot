import { handleTraffic, canonicalArea } from '../netlify/lib/traffic-core'
import {
  coverArea, areaQuery, trafficState, groupTracker, withoutOwn, trafficView, relAltText, normalizeHex, trafficBackoff, trafficPoints,
  type TrafficTarget,
} from '../src/data/logic/traffic-logic'
import { composeName, parseName } from '../src/data/logic/live-logic'
import { FLAG_TRACKING, type LiveFix } from '../src/data/logic/live-codec'

let ok = 0, fail = 0
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log('FAIL', name) } }

// Mock upstream (spec §9.4 data)
let upstreamStatus = 200, upstreamHits = 0, lastUrl = '', throwNet = false
const upstream: typeof fetch = async (url) => {
  upstreamHits++; lastUrl = String(url)
  if (throwNet) throw new TypeError('network')
  if (upstreamStatus !== 200) return new Response('nope', { status: upstreamStatus })
  return new Response(JSON.stringify({ now: 1_000_000, ac: [
    { hex: 'a1b2c3', flight: 'N123AB  ', r: 'N123AB', t: 'C172', lat: 41.75, lon: -111.85, alt_baro: 6500, alt_geom: 6650, gs: 105, track: 270, seen_pos: 1.2, type: 'adsb_icao' },
    { hex: 'a00001', flight: 'UAL1', lat: 41.8, lon: -111.9, alt_baro: 35000, seen_pos: 0.5 },
    { hex: 'a00002', lat: 41.7, lon: -111.8, alt_baro: 'ground', seen_pos: 0.5 },
    { hex: 'a00003', lat: 41.7, lon: -111.8, alt_baro: 4500, seen_pos: 40 },
    { hex: 'a00004', flight: 'N9TB', lat: 41.72, lon: -111.82, alt_baro: 5800, seen_pos: 3, type: 'tisb_icao' },
    { hex: 'ABCDEF', lat: 41.74, lon: -111.84, alt_baro: 5200, seen_pos: 0.5 },
    { hex: 'a00005', alt_baro: 3000, seen_pos: 0.5 },
  ] }), { headers: { 'content-type': 'application/json' } })
}
const get = async (q: string, method = 'GET') => {
  const r = await handleTraffic(new Request(`http://x/api/traffic?${q}`, { method }), 'http://up/v2/point', upstream)
  return { s: r.status, j: await r.json(), h: r.headers }
}

;(async () => {
  // ── server ──
  let r = await get('lat=41.70&lon=-111.80&nm=15')
  check('200', r.s === 200)
  check('filters ground / high / stale / no position; keeps own hexes (client drops them)', JSON.stringify(r.j.aircraft.map((a: TrafficTarget) => a.hex)) === '["a1b2c3","a00004","abcdef"]')
  check('upstream url', lastUrl === 'http://up/v2/point/41.7/-111.8/15')
  check('fields', r.j.aircraft[0].cs === 'N123AB' && r.j.aircraft[0].alt === 6500 && r.j.aircraft[0].altGeom === 6650 && r.j.aircraft[0].trk === 270 && r.j.t === 1_000_000)
  check('cdn cache durable 5 s', /durable/.test(r.h.get('netlify-cdn-cache-control') ?? '') && /max-age=5/.test(r.h.get('netlify-cdn-cache-control') ?? ''))
  check('vary on area', r.h.get('netlify-vary') === 'query=lat|lon|nm')
  check('browser must revalidate', /max-age=0/.test(r.h.get('cache-control') ?? ''))
  const hits = upstreamHits
  check('non-canonical lat → 400', (await get('lat=41.73&lon=-111.83&nm=25')).s === 400)
  check('nm 12 → 400', (await get('lat=41.70&lon=-111.80&nm=12')).s === 400)
  check('nm 105 → 400', (await get('lat=41.70&lon=-111.80&nm=105')).s === 400)
  check('nm 17 → 400', (await get('lat=41.70&lon=-111.80&nm=17')).s === 400)
  check('missing → 400', (await get('lat=41.70')).s === 400)
  check('rejected areas never reach upstream', upstreamHits === hits)
  check('POST → 405', (await get('lat=41.70&lon=-111.80&nm=15', 'POST')).s === 405)
  upstreamStatus = 429; r = await get('lat=41.70&lon=-111.80&nm=15')
  check('upstream 429 → 503, no-store, Retry-After', r.s === 503 && r.h.get('cache-control') === 'no-store' && r.h.get('retry-after') === '5')
  upstreamStatus = 500; r = await get('lat=41.70&lon=-111.80&nm=15')
  check('upstream 500 → 502 no-store', r.s === 502 && r.h.get('cache-control') === 'no-store')
  upstreamStatus = 200; throwNet = true; r = await get('lat=41.70&lon=-111.80&nm=15')
  check('unreachable → 502', r.s === 502); throwNet = false
  // Several sources: a failing first one falls through to the next
  const multi: typeof fetch = async (url) => String(url).startsWith('http://dead')
    ? new Response('{"error":"Please contact us"}', { status: 403 })
    : upstream(url)
  const m = await handleTraffic(new Request('http://x/api/traffic?lat=41.70&lon=-111.80&nm=15'), 'http://dead/v2/point, http://up/v2/point', multi)
  check('falls through to the next source', m.status === 200 && (await m.json()).aircraft.length === 3)
  const d = await handleTraffic(new Request('http://x/api/traffic?lat=41.70&lon=-111.80&nm=15'), 'http://dead/v2/point', multi)
  const dj = await d.json()
  check('all fail: 502 naming the source and status', d.status === 502 && dj.error === 'traffic source: dead returned 403')

  // ── client area always accepted by the server ──
  let bad = 0
  for (let i = 0; i < 2000; i++) {
    const pts = Array.from({ length: 1 + (i % 5) }, () => ({ lat: -60 + Math.random() * 120 + (Math.random() - 0.5) * 0.5, lon: -179 + Math.random() * 358 }))
    const local = pts.map((p, k) => k ? { lat: pts[0].lat + (p.lat % 1) * 0.3, lon: pts[0].lon + (p.lon % 1) * 0.3 } : p)
    const q = new URLSearchParams(areaQuery(coverArea(local)))
    if (!canonicalArea(Number(q.get('lat')), Number(q.get('lon')), Number(q.get('nm')))) bad++
  }
  check('2000 random coverArea() all canonical', bad === 0)
  const one = coverArea([{ lat: 41.71, lon: -111.83 }])
  check('single point: 15 nm, rounded', one.nm === 15 && one.lat === 41.7 && one.lon === -111.85)
  check('spread group: bigger radius', coverArea([{ lat: 41.7, lon: -111.8 }, { lat: 42.1, lon: -111.8 }]).nm === 25)
  check('capped at 100', coverArea([{ lat: 40, lon: -111 }, { lat: 44, lon: -111 }]).nm === 100)

  // ── on / off ──
  const st = trafficState
  check('idle: nothing', !st(null, false, null).active && !st(null, false, null).tracking && st(null, false, null).reason === 'off')
  check('session on: tracking + active', st(null, true, null).tracking && st(null, true, null).active && st(null, true, null).reason === 'session')
  check('switch on: tracking', st(true, false, null).tracking && st(true, false, null).reason === 'manual')
  check('group tracker: active, not tracking', st(null, false, 'SKY1').active && !st(null, false, 'SKY1').tracking && st(null, false, 'SKY1').reason === 'group')
  check('switch off wins over session and group', !st(false, true, 'SKY1').active && !st(false, true, 'SKY1').tracking)
  check('backoff', trafficBackoff(0) === 5000 && trafficBackoff(1) === 10000 && trafficBackoff(9) === 30000)

  const now = 5_000_000
  const fx = (o: Partial<LiveFix>): LiveFix => ({ lat: 41.74, lon: -111.84, altM: 1585, accM: 5, speedMs: 3, trackDeg: 90, ts: now - 2000, flags: 0, ...o })
  const members = [
    { isMe: true, callsign: 'ME', fix: fx({ flags: FLAG_TRACKING }), hex: null },
    { isMe: false, callsign: 'CHASE', fix: fx({ lat: 41.70, lon: -111.80 }), hex: null },
    { isMe: false, callsign: 'SKY1', fix: fx({ flags: FLAG_TRACKING }), hex: null },
  ]
  check('group tracker found (not me)', groupTracker(members, now) === 'SKY1')
  check('stale tracker ignored', groupTracker([{ ...members[2], fix: fx({ flags: FLAG_TRACKING, ts: now - 61_000 }) }], now) === null)
  check('no flag: none', groupTracker([members[1]], now) === null)
  check('points: me + fresh others', trafficPoints({ lat: 1, lon: 2 }, members, now).length === 3)

  // ── who is us ──
  const t = (o: Partial<TrafficTarget>): TrafficTarget => ({ hex: 'aaaaaa', cs: null, reg: null, type: null, lat: 41.74, lon: -111.84, alt: 5200, altGeom: null, gs: 20, trk: 90, vs: null, age: 1, src: null, ...o })
  const list = [t({ hex: 'abcdef' }), t({ hex: 'b00001' }), t({ hex: 'b00002', lat: 41.9 }), t({ hex: 'b00003', alt: 9000 })]
  // SKY1 at 41.74,-111.84 1585 m = 5200 ft, no hex → b00001 (on top of it) dropped; abcdef dropped by my hex
  const kept = withoutOwn(list, 'abcdef', members, now).map(x => x.hex)
  check('drops my hex and the target on a member', JSON.stringify(kept) === '["b00002","b00003"]')
  check('never by distance from me', withoutOwn([t({ hex: 'b00009' })], null, [members[0]], now).length === 1)
  check('member with hex: by hex only', JSON.stringify(withoutOwn(list, null, [{ ...members[2], hex: 'b00002' }], now).map(x => x.hex)) === '["abcdef","b00001","b00003"]')
  check('hex normalize', normalizeHex(' A1B2C3 ') === 'a1b2c3' && normalizeHex('0xabcdef') === 'abcdef' && normalizeHex('xyz') === null && normalizeHex('') === null)

  // ── display ──
  const v = trafficView(t({ cs: 'N9TB', altGeom: 5530, vs: 700 }), 5200, 4)
  check('view: name, age, rel alt, trend', v.name === 'N9TB' && v.ageS === 5 && v.relFt === 300 && v.trend === '↑' && !v.faded)
  check('rel alt text', relAltText(v, t({})) === '+300 ft ↑')
  check('below', relAltText(trafficView(t({ alt: 4000, vs: -900 }), 5200, 0), t({ alt: 4000 })) === '−1,200 ft ↓')
  check('faded after 10 s', trafficView(t({ age: 8 }), null, 3).faded)
  check('no own altitude: absolute', relAltText(trafficView(t({}), null, 0), t({})) === '5,200 ft')
  check('name falls back to reg / hex', trafficView(t({ reg: 'N1' }), null, 0).name === 'N1' && trafficView(t({}), null, 0).name === 'AAAAAA')

  // ── hex in the roster name ──
  const n = parseName(composeName('ppc', 'SKY|1', 'a1b2c3'))
  check('name with hex round-trips', n.role === 'ppc' && n.callsign === 'SKY1' && n.hex === 'a1b2c3')
  check('name without hex', parseName(composeName('chase', 'CHASE')).hex === null && parseName('c:CHASE').callsign === 'CHASE')
  check('long callsign + hex fits 45 bytes', new TextEncoder().encode(composeName('ppc', 'X'.repeat(24), 'a1b2c3')).length <= 45)

  console.log(`${ok} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
