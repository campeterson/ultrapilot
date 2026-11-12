# Live Group — Real-Time Location Sharing

Live group location tracking for UltraPilot: a balloon and its chase vehicle, a
balloon rally, or a group of PPC / PPG pilots seeing each other on the map.

Built on the **Location Relay Spec** (Netlify "mailbox" relay: Edge Function + Blobs +
CDN polling, end-to-end encrypted, no accounts). This document records how that spec is
integrated into UltraPilot and the decisions taken on its open questions. Where it is
silent, the relay spec applies.

> **Not for navigation or traffic separation.** Positions are seconds to minutes old
> and cellular coverage in flight is patchy. Every screen that shows group positions
> says so.

---

## 1. Update rate: 1 s vs 5 s

Cost uses the relay spec's measured ≈ 2 Netlify credits per 10,000 requests (Free plan:
300 credits/month — re-check current rates). Each member both shares and watches.

| | Every 1 s | Every 5 s |
|---|---|---|
| Position sends / member-hour | 3,600 | 720 |
| Viewer polls / hour | 3,600 (1 s poll + 1 s CDN cache needed, or 1 s sends are wasted) | 720 (5 s) – 1,800 (2 s) |
| Requests / member-hour | ~7,200 | ~1,440 – 2,500 |
| Credits / member-hour | ~1.4 | ~0.3 – 0.5 |
| Balloon + chase, 3 h | ~8.6 credits | ~1.7 – 3 |
| 10 PPCs, 2 h | ~29 credits | ~6 – 10 |
| Free plan covers | ~10 such fly-outs/month | ~30 – 50 |
| Fix-to-screen delay | ~1 – 3 s | ~3 – 9 s |
| Gap between updates | PPC ~18 m, car ~25 m, balloon ≤ 10 m | PPC ~90 m, car ~125 m, balloon ≤ 50 m |
| Keys per member per 60 s bucket | 60 (one `list()` page ≈ 16 members) | 12 (≈ 80 members) |
| Data per device | ~5 – 7 MB/h | ~1 – 2 MB/h |
| Battery | ≈ same — screen + GPS dominate; the radio stays awake at both rates | |

**Decision:** adaptive sending with a **per-role minimum gap** — aircraft (balloon, PPC,
PPG, other) **3 s**, chase vehicle / ground **5 s**; send when moved > 25 m, track
changed > 15°, or 15 s heartbeat. Viewers poll every **2 s** while visible. 1 s buys
only closer spacing, which matters only for formation flying — exactly the use ruled
out above — and in the air the real limit is coverage. A future opt-in "close chase"
mode (1–2 s, auto-off after 10 min) would need the relay's 2 s per-member rate limit
lowered.

The relay runs on the app owner's Netlify account, so **all users' traffic is billed
there**: ~0.4 credits per member-hour ≈ 750 member-hours/month on the Free plan. If
the app goes public, plan for a paid tier or a per-group cap.

## 2. Decisions on the relay spec's open questions

| # | Question | Decision |
|---|---|---|
| 1 | Write gate | **Verified.** Writes carry `writeKey`; the relay hashes it and compares with `meta.wtag`, read once per group per isolate (memo). This is what makes **view-only links** possible (§5). |
| 2 | Bucket length | **60 s.** Readers list the current + previous bucket. `list()` pages beyond 1,000 keys — acceptable. |
| 3 | Peer vs hub mode | **Peer mode** (step 1). Hub mode for big events later. |
| 4 | Map | **UltraPilot's existing maps** (MapLibre, Protomaps, satellite, offline tiles). No separate radar view. |
| 5 | Retention | **None** beyond two buckets. Each device's own track is still recorded locally in its session. |
| 6 | Owner controls | **End group** only (step 1). Remove-member later (needs a deny list). |

**Deviations from the relay spec**

- **Fixed time epoch.** `fixT` is seconds since 2026-01-01T00:00:00Z instead of a
  per-group `meta.epoch`, so readers never need the group meta.
- **Roster key carries a sequence:** `grp/{g}/m/{pubId}~{seq}~{nameCipher}`. A rename
  writes a new key; readers keep the highest `seq` per member; join deletes the
  member's older roster keys.
- **Relay returns only the newest fix per member** (it can pick the max `seq` from
  key names without decrypting), keeping responses small.
- **Leaving** sends a tombstone fix (flags bit0) through `POST /api/fix`; there is no
  separate `DELETE /api/member`.
- **React + TypeScript**, not vanilla JS. Same protocol.

## 3. Protocol (as implemented)

Secrets live only in the URL fragment and on the device.

| Value | Derivation |
|---|---|
| `groupSecret` | 32 random bytes, b64url, in the invite link `/#live=<groupSecret>` |
| `g` (group id) | `b64url(sha256("gid\|" + groupSecret))` — 43 chars |
| `encKey` | HKDF-SHA256(groupSecret, info `"enc"`) → AES-GCM-256 |
| `writeKey` | HKDF-SHA256(groupSecret, info `"write"`) → 32 bytes |
| `wtag` | `b64url(sha256(writeKey))[0..16]` — stored in meta at creation |
| `memberKey` | 32 random bytes, this device only |
| `pubId` | `b64url(sha256("pid\|" + memberKey))[0..16]` — computed by the relay |
| `ownerKey` / `ownerTag` | creator's device only / `b64url(sha256(ownerKey))` in meta |

**Fix** — 24 bytes little-endian: lat, lon (int32, 1e-7°), altM (int16, MSL,
−32768 = none), accM (uint16), spdDms (uint16 dm/s, 65535 = none), hdgDeg (uint16,
65535 = none), fixT (uint32 s since 2026-01-01Z, server-corrected clock), flags
(uint16: bit0 stopped sharing, bit1 attention). Encrypted:
`b64url(iv12 ‖ AES-GCM(encKey, iv, fix, aad = g|pubId|seq))` = 70 chars.

**Name** — `"<roleChar>:<callsign>"` (callsign ≤ 24 chars), encrypted the same way
with `aad = g|pubId|name|seq`.

**Blob keys** (store `loc-relay`, strong consistency)

```
grp/{g}/meta                                JSON {wtag, ownerTag, created}; metadata {updatedAt}
grp/{g}/m/{pubId}~{seq}~{nameCipher}        roster
grp/{g}/l/{bucket}/{pubId}~{seq}~{cipher}   fixes; bucket = floor(serverSec / 60)
```

**API** (`netlify/edge-functions/relay.ts`, path `/api/*`, `cache: "manual"`)

| Route | Body / query | Notes |
|---|---|---|
| `GET /api/time` | — | `{now}` ms, no-store |
| `PUT /api/group` | `{g, wtag, ownerKey}` | create, `onlyIfNew` → 201 / 409 |
| `POST /api/join` | `{g, writeKey, memberKey, seq, nameCipher}` | write gate; replaces older roster keys → `{pubId}` |
| `POST /api/fix` | `{g, writeKey, memberKey, seq, cipher}` | write gate; 2 s per-member rate limit (429) → 204 |
| `GET /api/locs?g=&t=` | `t = floor(serverMs / 2000)` | `{now, members:[[pubId,seq,nameCipher]], fixes:[[pubId,seq,cipher]]}`; ETag (weak compare, 304); `Cache-Control: no-cache`, `Netlify-CDN-Cache-Control: public, max-age=2`, `Netlify-Vary: query=g\|t` |
| `DELETE /api/group` | `{g, ownerKey}` | owner ends the group |
| `GET /api/health` | — | storage write / read / delete probe → `{ok, readBack, ms}` (for *Check server*) |
| `GET /api/group?g=` | — | `{exists, created, updatedAt}` — does the relay see this group (no secrets; `g` is public) |

404s carry a `code`: `no-group` (relay has no such group — joins retry twice, 1 s / 2 s, in
case a new group isn't visible yet) or `no-route`. A non-JSON answer means the relay isn't
deployed (`no-relay`). The relay never caches "no such group".

Validation: `g` `^[A-Za-z0-9_-]{43}$`, `seq` `^[0-9a-z]{7}$`, `cipher` exactly 70,
`nameCipher` ≤ 100, body ≤ 1 KB. Storage errors → 503 `Retry-After: 1`.

**Cleanup** — `netlify/functions/relay-cleanup.mts`, every 5 min: delete buckets older
than current − 2; delete a group only when its last activity is *known* to be > 24 h old
(meta `updatedAt` metadata, else meta `created`; with no meta, the newest bucket) — if it
can't be read, the group is left alone; ≤ 5,000 deletes
per run. Writers bump `updatedAt` at most once a minute per isolate.

The relay logic lives in `netlify/edge-functions/lib/relay-core.ts` behind a small
store interface, so it is unit-tested with an in-memory store and used by the
end-to-end tests to stand in for Netlify.

## 4. Callsign and role

A **profile** kept on the device and reused for every group:

- **Callsign** — tail number, "BALLOON 1", "CHASE", a name (≤ 24 chars).
- **Role** — Balloon, Chase vehicle, PPC, PPG, Other aircraft, Ground / Ops. Sets the
  map icon colour and the default send rate. Defaults from the flight mode (LTA →
  Balloon, powered → PPC).
- Duplicate callsigns in a group get a short device tag ("CHASE ·k3").

## 5. Sharing and joining

The **group code** is primary. It is the 43-character group secret: it goes by copy and
paste, never typing. A tapped **link** on iOS always opens Safari, not the installed Home
Screen app (separate storage), so the code is how app users join.

- **Invite card** (everyone in the group): the code in a box, **Copy code** and **Share
  code**. Share sends only text, so there is nothing to tap:
  `UltraPilot Live Group code: <code> — In UltraPilot: More → Live Group → Paste code →
  Join`.
- **Join:** a **Group code** field with a one-tap **Paste** button (reads the clipboard;
  iOS asks to allow it), then **Join**. The code is picked out of whatever was pasted:
  the code alone, the shared message, or an invite link.
- **Crew without the app** (secondary, on the invite card): **Share link** / **Copy link**
  and **QR code**. `https://<app>/#live=<code>` opens in their browser; the app reads the
  fragment, removes it from the address bar, and offers to join.
- **View-only link** (step 3): `#watch=<g>.<encKey>` — can decrypt and poll but holds
  no `writeKey`, so the relay rejects its writes.

## 6. Integration in UltraPilot

| Layer | Piece |
|---|---|
| Data | `logic/live-codec.ts` — b64url, key derivation, fix encode/decode, AES-GCM, names; `logic/live-logic.ts` — send policy, staleness, role table, duplicate-callsign tags, invite parsing, member view, ground reference / AGL, direction lines; `logic/live-drift-logic.ts` — when to re-fetch winds, drift from a fix; `live-api.ts` — HTTP calls (side-effecting I/O, like `satellite-cache.ts`) |
| State | `live-drift-store.ts` — forecast drift for one member; `live-group-store.ts` — profile, active group, sharing, members, poll loop, clock sync; subscribes to the existing GPS store (no second `watchPosition`) |
| UI | **More → Live Group** (split or full screen): profile, create / join / leave, invite (share, copy, QR), share toggle, member list (tap for Direct-To / drift forecast), display options. **Flying map**: member markers, labels, direction lines, forecast drift (`useLiveLayers`). Wake lock held while sharing. |

**Sending:** while sharing, the send rule is re-checked every second against the latest GPS
position (not only when the GPS reports a new one — a stationary iPhone can go quiet), so
the first fix and the 15 s heartbeat always go out. "Stop sharing" sends the tombstone and,
if the relay rate-limits it (429), waits 2 s and sends it once more.

**Client timing** (relay spec §7): poll every 2 s visible / 15 s hidden / 10 s after
3 errors; clock sync with `/api/time` (5 samples, lowest RTT; again every 5 min and on
`visibilitychange`); markers fade at 30 s, grey at 60 s, drop when gone from both
buckets; offline fixes are dropped, never queued; retries only on network / 5xx, ×3,
250 ms backoff.

## 7. Seeing others (step 2)

**Labels.** Every other member on the flying map: an **arrow** in the role's colour pointing
along their track (a **dot** when they're stopped, < 1 kt, so no track) and a two-line
label — `CALLSIGN · age` / `altitude datum · speed track` (e.g. `SKY 1 · 8 s` /
`1,969 ft MSL · 12 kt 060°`). Track shows only when moving (≥ 1 kt). The member list shows
the same plus distance and bearing from you. Markers fade at 30 s and grey at 60 s.

**Direction lines** (toggle on the Live Group page, default on): a line ahead of each
moving **aircraft** along its track, as long as the distance it covers in the look-ahead time
set for your own direction line (Settings → Map display → Look Ahead, for your current
flight mode).

**MSL / AGL** (toggle beside it, default MSL). AGL is height above the **chase crew,
taken as 0 AGL**: your own altitude when you are the chase vehicle / ground, otherwise
the freshest chase or ground member's. With no one on the ground reporting altitude,
labels stay MSL and say why. (Not terrain-aware — the same idea as the app's own AGL,
which is height above the session origin.)

**Direct-To a member** — tap the member's dot on the flying map (popup: callsign, role,
age, altitude, speed / track, distance and bearing from you → *Direct To CALLSIGN*,
*Drift forecast* for aircraft), or tap them in the Live Group list → *Direct-To*. The
D→ widget is labelled with the callsign and adds **"45 s old"** once their position is
30 s old and **LOST** when they stop sharing, leave, or drop out (target stays at the last
known position). The target follows the member on
every update, so the map's magenta line and D→ indicator track them, and so do the
Direct-To instruments (DTE distance, DTK bearing, ETE, arrow) — those need a running
session, as for any Direct-To. Leaving the group clears a member target.

**Forecast drift** — tap an airborne member (or yourself) → *Drift forecast* (30 / 60 /
90 min). From the member's latest position **at its current altitude**, the flight
plan's drift integration runs on an Open-Meteo forecast (the flight plan's model) fetched
for that spot. It is re-fetched when the member is > 15 nm from where winds were
fetched, the forecast is an hour old, or it no longer covers the minutes ahead. Drawn as
a dashed line with 15-minute dots and a "+60 min" label; the list says "If it holds
altitude: 20.0 nm toward 060° ENE in 60 min". Needs a connection for the winds.

**By role** (`roleDisplay()` in `live-logic.ts`):

| | Aircraft (balloon, PPC, PPG, other) | Chase vehicle, Ground / Ops |
|---|---|---|
| Direction line | yes (when the toggle is on) | **no** — a vehicle follows roads |
| Altitude on map label and list | yes (MSL / AGL setting) | **no** — on the ground, and the AGL reference; the tap popup shows *ground … ft MSL* |
| Drift forecast | yes | no |
| Direct-To them | yes | yes |
| Minimum send gap | 3 s | 5 s |

## 8. Phases

1. **Relay + Live Group page + map markers** at the rates in §1. *(done)*
2. **Chase tools:** Direct-To a member (Direct-To instruments), forecast drift from a
   member's live position, plus labels with altitude / speed / track, direction lines and
   MSL / AGL (§7). *(done)*
3. **View-only links, owner controls, hub mode, shared group places** (landing zones).

## 9. Testing

- `npm run test:live` — unit: codec round trip and null handling, AES-GCM AAD tamper fails, send policy,
  staleness, relay core (create, join, write gate, rate limit, locs newest-per-member,
  tombstone, ETag 304, end group, cleanup).
- End-to-end (Playwright, run during development): two browser contexts with emulated GPS (pilot + chase) join
  one group by link and see each other's markers; the relay core stands in for Netlify.
- Before real use: deploy preview + the relay spec's bot spike script (§11.10) and a
  field test (walk, car, screen lock, dead zone).

## 10. Demo members and the chase vehicle's own line

**Your own direction line** is off whenever your Live Group role is Chase vehicle
or Ground / Ops, whatever the Settings switch says. Settings shows "Off — you're
Chase vehicle in Live Group" in its place (`ownDirectionLine()` in `live-logic.ts`).

**Simulate group members** (Live Group page → Demo) adds pretend members so the
feature can be shown with one phone. They are made on the device
(`live-demo-logic.ts`), never sent to the relay, not saved, and marked "(demo)".
They work with or without a group, and next to real members.

| Your role | Simulated |
|---|---|
| Balloon | Chase vehicle (~21 kt, on the ground) and a second balloon drifting (~8 kt, ~1,500 ft AGL) |
| Chase / Ground | A balloon drifting (~9 kt) and a PPC (~27 kt) |
| PPC / PPG / Other aircraft | Two aircraft (~25 kt and ~39 kt) at about 500 and 1,000 ft AGL |

Each one circles you at its own radius (1.3–2.8 km) at a steady speed, with a slow
climb and descent, and the circle follows you. Their "ground" is the session origin
altitude, or your altitude when the demo started. Tap one for Direct-To or a drift
forecast, the same as a real member. Turning the demo off cancels a Direct-To that
points at a demo member.
