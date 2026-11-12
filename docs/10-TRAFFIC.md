# ADS-B Traffic

Nearby ADS-B traffic from a public aggregator, on the flying map, for anyone flying —
and for their whole Live Group (chase crew included) while they are.
Built from the "group relay + ADS-B traffic on Netlify" spec, with one change agreed:
**group positions stay on the existing end-to-end-encrypted Live Group relay**
(docs/09-LIVE_GROUP.md); only the traffic part is new.

**Situational awareness only — not for collision avoidance.** Aircraft without ADS-B Out
(most ultralights, PPCs and balloons) don't appear; positions are seconds old.

## 1. Pieces

| Layer | File | Job |
|---|---|---|
| Netlify Function | `netlify/functions/traffic.mts` → `netlify/lib/traffic-core.ts` | `GET /api/traffic?lat&lon&nm`: proxies the aggregator (browsers can't: no CORS), filters, CDN-caches 5 s |
| Edge function | `netlify/edge-functions/relay.ts` | `excludedPath: ['/api/traffic']` so the relay doesn't answer it |
| Data | `src/data/logic/traffic-logic.ts` | area, on/off rules, which targets are us, labels |
| Data (I/O) | `src/data/traffic-api.ts` | the fetch |
| State | `src/state/traffic-store.ts` | when to poll; targets; the switch |
| UI | `useTrafficLayers.ts`, `TrafficButton.tsx` (map), `TrafficSection.tsx` (Live Group page), `useTrafficRuntime.ts` | drawing, the switch, visibility |

## 2. Server: `/api/traffic`

- Upstream `GET {UPSTREAM_URL}/{lat}/{lon}/{nm}`, ADSBx v2 schema; default
  `https://api.airplanes.live/v2/point` (free, **non-commercial**, 1 req/s, no SLA).
  Swap with the `UPSTREAM_URL` environment variable (e.g. adsb.lol, open data).
- Only **canonical areas**: lat/lon multiples of 0.05°, `nm` a multiple of 5 in 15–100 —
  anything else is 400, so the cache can't be bypassed.
- 8 s timeout, `User-Agent: UltraPilot-relay/1.0`. Upstream 429 → 503 + `Retry-After: 5`;
  other failures 502. Errors are `no-store`.
- Drops: no position, `alt_baro: "ground"`, above 18,000 ft, position older than 15 s.
  Doesn't drop group members (the response is shared across groups).
- Each target: `hex, cs, reg, type, lat, lon, alt` (baro, else GPS), `altGeom` (GPS),
  `gs, trk, vs, age, src`.
- Success: `Netlify-CDN-Cache-Control: public, durable, max-age=5, stale-while-revalidate=5`,
  `Netlify-Vary: query=lat|lon|nm`, `Cache-Control: public, max-age=0, must-revalidate`.

## 3. When traffic is fetched

| | Fetches traffic | Tells the group "I'm tracking" |
|---|---|---|
| A session is running (Start Session) | yes | yes |
| Traffic switched **on** (map TFC / Live Group page) | yes | yes |
| A group member is tracking (their fix from the last 60 s says so) | yes | no |
| Traffic switched **off** | no — wins over everything | no |
| Otherwise | **no requests at all** | no |

- **A running session is the automatic trigger**, not ground speed: a balloon flies far
  slower than the spec's 15 kt "flying" threshold. Starting or ending a session puts the
  switch back to automatic.
- **Group "active" is worked out on each phone.** The relay never sees plaintext, so the
  "tracking" bit (`FLAG_TRACKING = 4`) rides inside each member's encrypted fix; every phone
  already sees every fix every 2 s. A member must be **sharing** for the group to see it.
  When tracking changes, the next fix goes out within a second.
- Works **without a group** too: a solo pilot with a session gets traffic.
- Every 5 s while active and on screen; paused while hidden. Errors back off ×2 to 30 s.
  Targets older than 30 s are dropped when polling fails.
- Area = centre of me + every member with a fix in the last 60 s, radius to the farthest
  + 10 nm (`coverArea()`, always canonical).

## 4. Which targets are us

- My **ADS-B hex** (optional, Live Group profile → "ADS-B Out hex code") and each member's
  (sent inside the encrypted roster name as `…|a1b2c3`).
- A member without a hex: a target within **0.05 nm and 300 ft** of their fresh (< 15 s) fix
  is taken to be them.
- **Never by distance from me** — an aircraft that close to me is exactly what traffic is for.
  So if you have ADS-B Out, enter your hex, or you'll see yourself.

## 5. Display

- White arrow with a dark outline along the target's track (white dot without a track) —
  distinct from the coloured Live Group arrows. Label `CALLSIGN · age` / `+300 ft ↑`
  (relative to my GPS altitude, GPS altitude preferred; ↑/↓ at ≥ 500 fpm). Faded after 10 s.
- Map **TFC** button (bottom-left): grey off, green on with a count, amber when unavailable.
  Tap flips it.
- Live Group page → **ADS-B traffic**: switch, why it's on/off ("On — SKY 1 is flying"),
  "Unavailable — …", and the disclaimer.

## 6. Testing

- `npm run test:traffic` — handler (filters, headers, canonical-area rejection, 429/502),
  2,000 random `coverArea()` results accepted by the server's check, on/off rules, group
  tracker, own-target filtering, labels, hex in the roster name.
- Two-phone Playwright run (balloon + chase, stand-in upstream): no `/api/traffic` calls
  while idle; balloon starts a session → **both** fetch; balloon switches off → both stop.
- After deploying:
  - [ ] `curl -sI "https://<site>/api/traffic?lat=41.70&lon=-111.80&nm=15"` twice, a couple of
        seconds apart → the second shows a cache hit in `Cache-Status`.
  - [ ] Two phones in a group, idle → no `/api/traffic` calls; start a session on one →
        both get traffic.
  - [ ] After a real group flight, check function usage in the Netlify dashboard.

## 7. Limits and later

- The CDN doesn't guarantee one upstream call per area; with more than ~5 areas active at
  once expect occasional 429s (phones back off).
- Not built (spec §8): faster refresh for close targets; portable receivers (Stratus etc. —
  needs native code for GDL 90); paid feeds (keep `UPSTREAM_URL` swappable).
