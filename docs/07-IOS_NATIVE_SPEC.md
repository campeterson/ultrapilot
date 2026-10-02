# UltraPilot for iOS — Native App Specification

**Status:** Ready for implementation
**Source of truth for behavior:** the UltraPilot PWA (`apps/ultrapilot/`, v1.3.2, React + MapLibre)
**Target:** Native iPhone + iPad app in Swift / SwiftUI, using Apple MapKit

---

## 0. How to use this document (read first)

You are building a native iOS port of an existing, working PWA. This document is written to be
self-contained: you should not need the web source to build the app, but where it is available
(`apps/ultrapilot/src/`) it is the reference for any behavior this spec leaves ambiguous.

Rules for the implementing agent:

1. **Build in the milestone order in §18.** Each milestone ends with a green build and passing tests.
2. **Port the pure logic first, with tests** (§6). The math is already proven in the web app; the
   constants and thresholds in this spec are deliberate. Do not "improve" them silently.
3. **Keep the layer rules in §4.** They are enforced in code review.
4. **Where this spec says VERIFY,** check the current Apple SDK documentation before
   implementing. It is marked because the answer may have changed since this was written
   (September 2026).
5. **Units:** store SI internally (meters, m/s, degrees true, Unix ms / `Date`). Convert to
   aviation units (ft, kt, nm, fpm) **only** at the display and export boundary.
6. **Interop:** the export and import file formats in §12 must be byte-compatible with the PWA so
   pilots can move data between the web and native apps. Do not change field names.
7. Ask the human owner about anything listed in §19 (Open Questions) before you decide it yourself.

---

## 1. Product summary

UltraPilot is a map-centric cockpit companion for **powered parachute (PPC)** and **ultralight**
pilots. It combines:

- a live moving map with configurable flight instruments,
- a **session timeline** that captures the story of a day at the field (stamps, checklists, weather),
- checklists, METAR weather and a nearby-airport finder,
- waypoints, routes and Direct-To navigation with a CDI/HSI,
- GPX/OADS export.

It is free, needs no account and works offline. Think "ForeFlight for ultralight pilots" without
IFR features or subscriptions.

### Domain knowledge the app encodes

- **PPC ≠ PPG.** PPC pilots sit in a wheeled cart with their hands free and steer with their feet.
  The app is PPC-first.
- **Two engine cycles per flight:** warm-up (start → shutdown), then flight (start → takeoff →
  landing → shutdown).
- **Session = a day at the field.** One session may contain several flights (takeoff/landing pairs).
- **AGL = current GPS MSL − origin MSL.** It is *not* terrain-aware. The origin is the position
  when the session started, and the pilot can reset it.
- Typical flight envelope: 20–40 kt ground speed, 0–1,500 ft AGL, open cockpit, vibration, gloves,
  bright sun. **Every tap target is ≥ 44 × 44 pt. Primary actions are ≥ 64 pt.**

---

## 2. Scope

### 2.1 v1 — feature parity with the PWA

| Area | Included |
|---|---|
| Moving map | Apple Maps vector + satellite + hybrid, Track Up / North Up, own-ship arrow, breadcrumb trail, origin marker, direction line, distance rings, airports, waypoints, routes, Direct-To line, past-session overlay, tap-for-actions popup |
| Instruments | 22 instruments (§6.4), top instrument strip, 3 map overlay slots, full-page instrument view with 4 layouts, HSI |
| Session | Start/end, origin reset, auto stamps, manual STAMP picker, crash-safe restore |
| Timeline | Summary cards + event list for the active session |
| Checklists | Seeded PPC defaults, runner, auto-stamp on completion, **full CRUD editor** (the PWA does not have this yet) |
| Weather / airports | METAR by ICAO or nearest station, decoded + flight category, 20 nearest airports |
| Waypoints / routes | CRUD, Direct-To, route activation with auto-advance, share/import bundles |
| Sessions history | List, detail with map, trash/restore/delete, export (GPX / OADS), export all, import (OADS / JSON / GPX) |
| Offline maps | Region download manager (§8.7) |
| Settings | Everything in §10.10 |

### 2.2 Native-only additions in v1

These are the reason to go native:

- **Background location**, so tracking continues with the screen locked or another app in front (§7.3).
- **Keep the screen awake** during an active session (idle timer disabled).
- **Haptics** on stamp, checklist item, checklist complete and route leg advance.
- **Share sheet and Files integration** for import and export, and "Open in UltraPilot" for
  `.gpx` and `.json` files.
- **External avionics over GDL-90 (Wi-Fi UDP)** — full spec in §20. Primary target device:
  **Levil Aviation Astro+**. Must also work with any GDL-90 source (Stratux, Stratus, Sentry, …).
  - **ADS-B In traffic** on the map, in a traffic list, and as proximity alerts (visual, haptic, spoken).
  - **AHRS:** attitude indicator, slip/skid, G-load, pressure altitude, and a Heading Up map mode.
  - **External GPS:** use the device's ownship position when it is better than the phone's.
  - **Device status, raw capture and replay**, so the feature can be developed and tested without
    flying.

### 2.3 Planned for v1.1 (design for them now, don't build yet)

- Live Activity / Dynamic Island: session time, GS, AGL, REC state.
- App Intents: "Stamp takeoff" and "Stamp landing" for Siri, Shortcuts and the Action button.
- Barometric altitude assist via `CMAltimeter` for smoother AGL and VS (§7.5).
- Apple Watch companion.

### 2.4 Explicitly out of scope

- Accounts, sync or cloud backend. (Stretch: iCloud Drive export folder only.)
- FIS-B weather *graphics* (NEXRAD, TFR shapes) from GDL-90 Uplink messages. FIS-B *text* METARs
  are a v1.1 candidate (§20.9).
- ADS-B **Out** / transponder control of any kind.
- Aviation sectional charts. (Possible later via the same tile-overlay mechanism as §8.7.)
- The PWA's PMTiles/Protomaps basemap pipeline, which Apple MapKit replaces.
- Analytics. The PWA uses Fathom; the native app collects **nothing**.

---

## 3. Platform & stack decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | Swift 6 (strict concurrency on) | Current, safe |
| UI | SwiftUI; UIKit only where noted | SwiftUI for all screens |
| Map | **MapKit `MKMapView` wrapped in `UIViewRepresentable`** | Needs camera heading control on every fix, custom overlay renderers (dashed/cased lines), `MKTileOverlay` with `canReplaceMapContent`, user-gesture detection to break auto-follow, and rotating annotation views. `MKMapView` gives mature control over all of these; SwiftUI `Map` does not yet cover them all cleanly. |
| Persistence | SwiftData | First-party, no dependencies |
| State | `@Observable` stores, `@MainActor` | Mirrors the PWA's Zustand stores |
| Location | Core Location: `CLLocationManager` with `activityType = .airborne` (VERIFY: `CLLocationUpdate.liveUpdates(.airborne)` as an alternative) | Airborne tuning, background support |
| Networking | `URLSession`, `NWPathMonitor` | METAR + offline tile downloads, connectivity state |
| Minimum OS | **iOS 18.0 / iPadOS 18.0** | Stable SwiftData + Observation; build with the current Xcode (26.x) |
| Devices | iPhone and iPad (universal); portrait + landscape on both | Cockpit mounts vary |
| Third-party deps | **None** in v1 | Matches the Aviator's Toolkit "no frameworks" ethos |
| Tests | Swift Testing (`import Testing`) for the Core package; XCUITest smoke tests | |
| Bundle ID | `com.aviatorstoolkit.ultrapilot` — **placeholder, confirm with the owner** | |
| Display name | `UltraPilot` | |

---

## 4. Architecture

The PWA's golden rule carries over: **every file belongs to exactly one layer.**

```
┌──────────────────────────────────────────────────────────────┐
│ UI (SwiftUI views, UIViewRepresentable map, view modifiers)  │  imports SwiftUI/UIKit/MapKit
├──────────────────────────────────────────────────────────────┤
│ Stores (@Observable, @MainActor)                             │  glue: calls Core + Services
├──────────────────────────────────────────────────────────────┤
│ Services (Location, Persistence, Weather, TileDownload,      │  side effects, system frameworks
│           Connectivity, Haptics, FileIO)                     │
├──────────────────────────────────────────────────────────────┤
│ Core (Swift package: value types + pure functions + codecs)  │  imports Foundation ONLY
└──────────────────────────────────────────────────────────────┘
```

| Layer | Contains | Must never contain |
|---|---|---|
| **Core** (`UltraPilotCore` local Swift package) | Value-type models, GPS math, instrument derivation, wind estimate, METAR decoder, stamp/session/checklist/route rules, GPX/OADS/bundle encoders + decoders, default checklists, **GDL-90 framer/decoder, traffic rules (relative altitude, clock position, alerting, staleness), AHRS model, position-source selection** | `import SwiftUI`, `UIKit`, `MapKit`, `CoreLocation`, `SwiftData`; any I/O; `Date()` calls inside logic (pass `now` in) |
| **Services** | `LocationService`, `PersistenceService` (SwiftData), `WeatherService`, `TileDownloadService`, `ConnectivityService`, `HapticsService`, `FileExportService`, **`GDL90Service` (UDP receive), `GDL90DiscoveryService`, `GDL90CaptureService` (record/replay), `SpeechService`** | Views; business rules that belong in Core |
| **Stores** | `SessionStore`, `GPSStore`, `InstrumentStore`, `TimelineStore`, `ChecklistStore`, `WeatherStore`, `AirportStore`, `WaypointStore`, `RouteStore`, `DirectToStore`, `MapSettingsStore`, `OfflineMapStore`, `LayoutStore`, **`DeviceStore`, `TrafficStore`, `AHRSStore`, `PositionSourceStore`** | View code; direct `ModelContext` use outside `PersistenceService` |
| **UI** | Views, map coordinator, overlays, renderers, theme | Business logic beyond simple display conditionals; `ModelContext`/`@Query` (go through stores) |

The Core package must build and test with `swift test` on macOS, with no simulator.

### 4.1 Project layout

```
UltraPilot/
├── UltraPilot.xcodeproj
├── Packages/
│   └── UltraPilotCore/
│       ├── Package.swift
│       ├── Sources/UltraPilotCore/
│       │   ├── Models/        (Session, TrackPoint, StampEvent, Checklist, Waypoint, Route, Airport, InstrumentID, …)
│       │   ├── Logic/         (GeoMath, Instruments, Wind, Session, Stamp, Checklist, Route, Metar, Airports, Layouts, TileMath)
│       │   ├── Codecs/        (GPX, OADS, RouteBundle, LegacySessionJSON, ChecklistJSON)
│       │   └── Defaults/      (PPCChecklists.swift)
│       └── Tests/UltraPilotCoreTests/
├── UltraPilot/
│   ├── App/                   (UltraPilotApp.swift, AppEnvironment.swift, Info.plist, PrivacyInfo.xcprivacy)
│   ├── Services/
│   ├── Persistence/           (SwiftData @Model classes + mappers to Core value types)
│   ├── Stores/
│   ├── UI/
│   │   ├── Theme/             (Theme.swift, Fonts)
│   │   ├── Shell/             (AppShell, NavBar, MorePicker, PanelLayout, InstrumentStrip, RouteBanner, Disclaimer)
│   │   ├── Map/               (MapScreen, MapViewRepresentable, MapCoordinator, overlays/, annotations/, MapControls, HSIView, StampSheet, MapActionPopup)
│   │   ├── Timeline/  Checklists/  Weather/  Waypoints/  Routes/  Sessions/  Instruments/  OfflineMaps/  Settings/
│   │   └── Components/
│   └── Resources/
│       ├── airports.json      (copy from apps/ultrapilot/public/data/airports.json)
│       ├── Fonts/             (B612-Regular/Bold, B612Mono-Regular/Bold .ttf — OFL licensed)
│       └── Assets.xcassets    (AppIcon, AccentColor)
└── UltraPilotUITests/
```

### 4.2 Persistence model split

SwiftData `@Model` classes live in `Persistence/` and are **never** passed to views. The
`PersistenceService` maps them to Core value types (`struct`s, `Sendable`, `Codable`). This keeps
Core pure and lets codecs work on plain structs.

---

## 5. Data model

All Core models are `struct`s that are `Codable`, `Sendable`, `Equatable` and `Identifiable`.

### 5.1 Core value types

```swift
public struct Session {
    public var id: String            // ISO-8601 start timestamp, e.g. "2026-09-27T14:03:11.402Z" — matches PWA ids
    public var startTime: Date
    public var endTime: Date?
    public var originLat: Double
    public var originLon: Double
    public var originAltMSL: Double  // meters
    public var maxAGL: Double        // METERS (see §5.4 note)
    public var totalDistanceNM: Double
    public var deviceInfo: String    // e.g. "iPhone16,2 iOS 26.0 UltraPilot 1.0.0"
    public var deletedAt: Date?      // soft delete (trash)
}

public struct TrackPoint {
    public var sessionId: String
    public var ts: Int64             // unix ms
    public var lat: Double
    public var lon: Double
    public var altMSL: Double        // meters
    public var speed: Double         // m/s  (0 if invalid)
    public var heading: Double       // degrees TRUE course (see §7.2)
    public var accuracy: Double      // horizontal accuracy, meters
    // Optional, native-only (populated when a GDL-90 device is connected, §20.8):
    public var source: String?       // "internal" | "gdl90"
    public var roll: Double?         // degrees, + right wing down
    public var pitch: Double?        // degrees, + nose up
    public var pressureAltFt: Double?
    public var gLoad: Double?
    // id is derived: "\(sessionId)_\(ts)"
}

public enum StampEventType: String, Codable, CaseIterable {
    case session_start, session_end, takeoff, landing, engine_start, engine_shutdown,
         checklist_complete, wing_layout, weather, waypoint, preflight, maneuver, custom,
         traffic_alert   // native-only (§20.6); on GPX export it's a normal wpt; the PWA maps unknown types to custom
}

public struct StampEvent {
    public var id: UUID
    public var sessionId: String
    public var ts: Int64             // unix ms
    public var type: StampEventType
    public var lat: Double
    public var lon: Double
    public var altMSL: Double        // meters
    public var altAGL: Double        // meters above origin
    public var speed: Double         // m/s
    public var note: String?
}

public enum ChecklistCategory: String, Codable, CaseIterable {
    case preflight, before_takeoff, in_flight, before_landing, post_flight, custom
}
public struct ChecklistItem { public var id: String; public var text: String; public var order: Int }
public struct Checklist {
    public var id: String; public var name: String; public var category: ChecklistCategory
    public var items: [ChecklistItem]; public var createdAt: Date; public var updatedAt: Date
}

public struct Waypoint { public var id: String; public var name: String; public var lat: Double; public var lon: Double; public var note: String?; public var createdAt: Date }
public struct Route    { public var id: String; public var name: String; public var waypointIds: [String]; public var createdAt: Date; public var updatedAt: Date }
public struct Airport  { public var id: String; public var name: String; public var lat: Double; public var lon: Double; public var elev: Double /* ft MSL, as in the JSON */ }

public struct DirectToTarget { public var lat, lon: Double; public var name: String; public var fromLat, fromLon: Double }
public struct ActiveRoute    { public var routeId: String; public var legIndex: Int; public var hadDistance: Bool }

public typealias BBox = (minLon: Double, minLat: Double, maxLon: Double, maxLat: Double) // use a struct in practice
public struct OfflineRegion {
    public var id: UUID; public var name: String; public var layer: OfflineLayer   // .usgsImagery, .usgsTopo
    public var bbox: BBox; public var minZoom: Int; public var maxZoom: Int
    public var tileCount: Int; public var bytesOnDisk: Int64
    public var state: State  // .queued, .downloading(progress), .complete, .failed(message), .paused
    public var createdAt: Date; public var completedAt: Date?
}
```

ID formats (keep for interop): waypoint ids and route ids are opaque strings. The PWA uses
`rt-<ms>-<rand5>` for routes; native may use `UUID().uuidString` for new records but must accept any
string on import.

### 5.2 SwiftData schema

| @Model | Key | Relationships / indexes | Notes |
|---|---|---|---|
| `SessionRecord` | `id` (unique) | `trackPoints` (cascade), `events` (cascade) | `deletedAt` for trash |
| `TrackPointRecord` | `id` = `"\(sessionId)_\(ts)"` (unique) | → session | Index on `(sessionId, ts)`. Expect ~720 rows/hour. |
| `StampEventRecord` | `id` (unique) | → session | Index on `(sessionId, ts)` |
| `ChecklistRecord` | `id` (unique) | items stored as encoded `[ChecklistItem]` (Data) | Simpler than a child model; order lives in `order` |
| `WaypointRecord` | `id` (unique) | — | |
| `RouteRecord` | `id` (unique) | `waypointIds` encoded `[String]` | Ordered ids, same as the PWA; tolerate dangling ids |
| `OfflineRegionRecord` | `id` (unique) | — | Tiles themselves are files on disk (§8.7) |

Use a `VersionedSchema` + `SchemaMigrationPlan` from day one (`SchemaV1`).

### 5.3 Settings (`UserDefaults`, via a `SettingsStore`; never read `UserDefaults` from views)

| Key | Type | Default | PWA equivalent |
|---|---|---|---|
| `up.activeSessionId` | String? | nil | `ultrapilot_lastSession` |
| `up.activeRoute` | JSON `ActiveRoute`? | nil | `ultrapilot_activeRoute` |
| `up.directTo` | JSON `DirectToTarget`? | nil | (in-memory in PWA; persist natively) |
| `up.map.camera` | JSON {lat, lon, distance, heading} | lat 38.9, lon −94.6, distance ≈ 25 km | `ultrapilot_mapState` |
| `up.map.orientation` | `trackUp` \| `northUp` | `trackUp` | `mapOrientation` |
| `up.map.basemap` | `vector` \| `satellite` \| `hybrid` \| `usgsImagery` \| `usgsTopo` | `vector` | — |
| `up.map.appearance` | `dark` \| `light` \| `system` | `dark` | — |
| `up.map.autoOffline` | Bool | true | — |
| `up.map.showDirectionLine` | Bool | true | same |
| `up.map.showDistanceRings` | Bool | false | same |
| `up.map.showAirports` | Bool | true | — |
| `up.recordTrack` | Bool | true | `recordTrack` |
| `up.showInstrumentStrip` | Bool | true | same |
| `up.showMapOverlays` | Bool | true | same |
| `up.instruments` | JSON `InstrumentConfig` | see §6.4 | `ultrapilot_instrumentConfig` |
| `up.keepAwake` | Bool | true | — |
| `up.backgroundTracking` | Bool | true | — |
| `up.haptics` | Bool | true | — |
| `up.disclaimerAccepted` | Bool | false | `atk-up-disclaimer-accepted` |
| `up.lastMetar` | JSON {raw, station, fetchedAt} | nil | — (so the Wx tab shows the last report offline) |

```swift
struct InstrumentConfig: Codable {
    var strip: [InstrumentID] = [.agl, .msl, .gs, .hdg, .dist, .etime]
    var stripCount: Int = 6               // 4, 5 or 6
    var mapLeft: InstrumentID? = nil      // top-left overlay
    var mapRight: InstrumentID? = nil     // top-right overlay
    var mapBottom: InstrumentID? = nil    // bottom-right overlay
    var pageLayoutId: PageLayoutID = .heroPair
    var pageSlots: [InstrumentID] = PageLayouts.heroPair.defaults
}
```

### 5.4 Known PWA data quirks (handle on import; don't reproduce)

1. **`Session.maxAGL` units:** the PWA stores it in **feet** but the OADS export labels it
   `max_agl_m`. Native stores **meters** and exports meters. When importing a PWA *legacy JSON*
   or OADS file whose `extensions.ultrapilot.session.source` is not `ios`, treat `maxAGL` as feet
   and convert. Simpler and more robust: **recompute `maxAGL` on import** as
   `max(trackPoint.altMSL) − originAltMSL` and ignore the stored value.
2. **`heading_magnetic`** in the OADS export actually holds GPS **true** course. Keep the field
   name for compatibility and put true course in it. Document this in code.
3. **FLT (flight time) instrument** is always `0:00` in the PWA (flight start is passed as nil).
   Native **fixes** this: FLT = `computeFlightTime(events, now)` (§6.3).

---

## 6. Core logic (port exactly)

All functions are pure. Constants are part of the spec.

### 6.1 Geo math (`GeoMath`)

```
EARTH_RADIUS_NM = 3440.065
m/s → kt: × 1.94384        m → ft: × 3.28084        ft → m: ÷ 3.28084

haversineNM(lat1, lon1, lat2, lon2):
  dLat, dLon in rad; a = sin²(dLat/2) + cos φ1 cos φ2 sin²(dLon/2)
  return 2 R asin(√a)

bearing(lat1, lon1, lat2, lon2) -> 0..360:
  y = sin Δλ cos φ2 ; x = cos φ1 sin φ2 − sin φ1 cos φ2 cos Δλ
  return (atan2(y, x)° + 360) mod 360

circularEMA(prev?, next, alpha):                   // angles in degrees
  if prev == nil or !finite → next
  s = (1−α) sin p + α sin n ; c = (1−α) cos p + α cos n
  return (atan2(s, c)° + 360) mod 360

aglFeet(currentMSLm, originMSLm) = (current − origin) × 3.28084

verticalSpeedFpm(points sorted asc by ts):         // uses last 3 points max
  if count < 2 → 0
  w = last 3; dtMin = (w.last.ts − w.first.ts) / 60000; if dtMin == 0 → 0
  return ((w.last.altMSL − w.first.altMSL) × 3.28084) / dtMin

crossTrackErrorNM(lat, lon, fromLat, fromLon, toLat, toLon):   // signed: − left, + right
  d13 = haversineNM(from, pos) / R
  θ13 = bearing(from, pos) rad ; θ12 = bearing(from, to) rad
  return asin(sin d13 · sin(θ13 − θ12)) · R

eteMinutes(distNM, gsKt) = gsKt < 1 ? 0 : distNM / gsKt × 60

destinationPoint(lat, lon, bearingDeg, distNM) -> (lat, lon)   // standard great-circle forward
  d = distNM / R; normalize output lon to −180..180

formatDeg(x) = zero-padded 3 digits + "°"        e.g. "007°"
formatNM(x)  = 1 decimal
```

### 6.2 Wind estimate (`Wind.estimate`)

The app estimates wind from GPS alone. It assumes constant airspeed over a short window: the
ground-velocity vectors then lie on a circle whose center is the wind vector.

```
Input: samples [(trackDeg, speedKts)]  (buffer of last 60, only when GS ≥ 3 kt and track is finite)
if count < 8 → nil
convert each to (x = s·sin t, y = s·cos t)       // east, north
track spread: sort tracks; maxGap = max(first + 360 − last, max consecutive diff); spread = 360 − maxGap
if spread < 60° → nil
Kasa circle fit: minimize Σ(x² + y² + Dx + Ey + F)²
  accumulate Sx, Sy, Sxx, Syy, Sxy, Sxz, Syz, Sz with z = x² + y²
  solve [[Sxx Sxy Sx | −Sxz], [Sxy Syy Sy | −Syz], [Sx Sy n | −Sz]] by Gaussian elimination
  with partial pivoting; any |pivot| < 1e−9 → nil
cx = −D/2, cy = −E/2                              // wind vector (blowing TO)
toDeg = (atan2(cx, cy)° + 360) mod 360 ; fromDeg = (toDeg + 180) mod 360
speed = √(cx² + cy²); if !finite or > 100 → nil
return (dirFrom: fromDeg, speedKts: speed)
```

### 6.3 Session, stamp, checklist and route rules

```
createSession(lat, lon, altMSLm, now, deviceInfo) -> Session(id: iso(now), startTime: now, endTime: nil, origin…, maxAGL 0, totalDistanceNM 0)
endSession(session, maxAGLm, totalDistanceNM, now) -> session with endTime/maxAGL/totalDistanceNM
trackDistanceNM(points) = Σ haversineNM(pᵢ₋₁, pᵢ)

computeFlightTime(events, now) -> ms:
  takeoffs = ts of .takeoff in order; landings = ts of .landing in order
  Σ over i: max(0, (landings[i] ?? now) − takeoffs[i])

detectEngineCycle(events) = (has takeoff && !has landing) ? "flight" : "warmup"
  // When the user stamps engine_start, set note = cycle ("warmup"/"flight") if the user left note empty.

USER_STAMP_TYPES (picker order) = [preflight, wing_layout, engine_start, engine_shutdown, takeoff, landing, maneuver, custom]

eventDetail(event) -> String:
  session_start/end : "lat.4f°, lon.4f°"
  takeoff/landing   : "AGL {ft} ft  ·  {kt} kt"
  engine_start      : "Cycle: {note ?? warmup}"
  checklist_complete: note ?? "Checklist completed"
  weather           : note ?? "—"
  default           : "lat.4f°, lon.4f°" + ("  ·  note" if note)

Checklist run state: set of completed item ids; toggle; complete when completed.count ≥ items.count.
sortedItems = items sorted by order; newItem.order = max(order) + 1.

Route auto-advance (AUTO_ADVANCE_NM = 0.1), evaluated on every fix while a route is active:
  if !hadDistance && dte > 0.1 → hadDistance = true
  else if hadDistance && dte ≤ 0.1 → nextLeg()
nextLeg: legIndex + 1; if past the end → deactivate route (and clear Direct-To)
prevLeg: max(0, legIndex − 1)
Every leg change sets Direct-To = leg waypoint with from = current position; hadDistance = false.

nearestAirports(all, lat, lon, limit 20) -> sorted by distance, with bearing and formatted bearing.
```

**Event colors** (timeline dots, history-overlay dots):

| Type | Color | | Type | Color |
|---|---|---|---|---|
| session_start / session_end | `#3498db` | | wing_layout / custom | `#ccccdd` |
| takeoff / landing / checklist_complete / maneuver | `#27ae60` | | weather | `#3498db` |
| engine_start / engine_shutdown / preflight | `#e67e22` | | waypoint | `#9b59b6` |

**Labels:** Session Start, Session End, Takeoff, Landing, Engine Start, Engine Shutdown, Checklist
Complete, Wing Layout, Weather, Waypoint, Preflight, Maneuver, Custom Event.

### 6.4 Instruments

`deriveInstruments(pos, session, vsFpm, events, now, maxAGLft, rolling, directTo?) -> InstrumentValues`

| ID | Label | Unit | Group | Value | Format |
|---|---|---|---|---|---|
| `gs` | GND SPD | kt | Speed | speed × 1.94384 | integer |
| `avgs` | AVG SPD | kt | Speed | mean of all GS samples this session | integer |
| `agl` | AGL | ft | Altitude | aglFeet | integer |
| `msl` | MSL | ft | Altitude | altMSL × 3.28084 | integer |
| `maxalt` | MAX AGL | ft | Altitude | max(maxAGL, agl) | integer |
| `vs` | V/S | fpm | Altitude | verticalSpeedFpm(last 3 fixes) | signed: "+120" / "-80" / "0" |
| `avgvs` | AVG V/S | fpm | Altitude | mean of VS samples where \|VS\| > 50 | signed |
| `hdg` | TRACK | ° | Track | smoothed ground track | formatDeg |
| `wdir` | WIND | ° | Wind | Wind.estimate dirFrom | formatDeg or "---" |
| `wspd` | WIND SPD | kt | Wind | Wind.estimate speed | integer or "---" |
| `dist` | DIST | nm | Origin | haversine to origin | 1 decimal |
| `brg` | BRG | ° | Origin | bearing to origin | formatDeg |
| `brg_arrow` | → ORIG | — | Origin | arrow rotated (brg − hdg); sub-label "{dist} nm" | graphic |
| `dtk` | DTK | ° | Direct-to | bearing to target | formatDeg or "---" |
| `dtk_arrow` | → D→ | — | Direct-to | arrow rotated (dtk − hdg); sub-label "{rel}°" | graphic |
| `dte` | DTE | nm | Direct-to | distance to target | 1 decimal or "---" |
| `xtk` | XTK | nm | Direct-to | crossTrackErrorNM(pos, from, to) | 2 decimals or "---" |
| `ete` | ETE | min | Direct-to | eteMinutes(dte, gs) | integer or "---" |
| `hsi` | HSI | — | Direct-to | composite graphic (§10.2.3) | graphic; **not allowed in the top strip** |
| `etime` | FLT | — | Time | computeFlightTime(events, now) | elapsed |
| `sess` | SESS | — | Time | now − session.startTime | elapsed |
| `tod` | TIME | — | Time | local clock of the fix | "HH:mm" |

**GDL-90-dependent instruments** (group "Attitude" and "Traffic"; show "---" and are dimmed when
there is no valid AHRS or traffic data; full definitions in §20.7): `adi` (attitude indicator,
graphic), `roll`, `pitch`, `slip`, `gload`, `gmax`, `palt`, `bvs` (baro V/S), `ahdg` (AHRS heading),
`trfc` (nearest traffic, graphic + text).

Elapsed format: `m:ss` under an hour, `h:mm:ss` from an hour; ≤ 0 → `0:00`.
Descriptions for the picker: Ground speed · Avg ground speed · Height above origin · GPS altitude ·
Peak AGL this session · Climb/descent rate · Avg climb/descent · Direction of travel · Est. wind
from · Est. wind speed · Range from origin · Heading to origin · Arrow to origin · Course to
direct-to · Arrow to direct-to · Range to direct-to · Off-course error · Time to direct-to ·
Course + deviation · Flight duration · Session duration · Local clock time.

**Value coloring** (cream = normal):

| ID | Red | Amber | Green |
|---|---|---|---|
| `agl` | < 50 ft | < 150 ft | — |
| `vs` | < −1200 fpm | < −500 fpm | > +200 fpm |
| `gs` | > 45 kt | > 30 kt | — |
| `xtk` | \|x\| > 0.3 nm | \|x\| > 0.1 nm | — |
| `dte` | — | — | < 0.1 nm |

**Rolling stats** reset at session start: GS sum/count; VS sum/count (only when |VS| > 50); wind
buffer (last 60 samples, only when GS ≥ 3 kt).

**Instruments page layouts** (`PageLayouts`):

| ID | Name | Grid | Slots (size) | Defaults |
|---|---|---|---|---|
| `heroPair` | Hero Pair | 2 × 5 | 2 hero + 8 medium | gs, agl, msl, vs, hdg, dist, brg, etime, sess, maxalt |
| `sixPack` | Six-Pack | 2 × 3 | 6 large | gs, agl, msl, vs, hdg, dist |
| `bigHero` | Big Hero | 3 × 3 | 1 hero spanning 3 cols + 6 medium | agl, gs, msl, vs, hdg, dist, etime |
| `quad` | Quad | 2 × 2 | 4 large | gs, agl, hdg, msl |

`resizePageSlots(layout, existing)`: for each slot i, keep `existing[i]` if present, else
`layout.defaults[i]`.

### 6.5 METAR decode (`Metar.decode(raw)`)

Tokenize on whitespace. `station = tokens[0]`.

- **Wind:** first token matching `^\d{5}(G\d{2,3})?(KT|MPS)$` (also accept `VRB\d{2}(G\d{2,3})?KT`
  — a small improvement over the PWA).
- **Visibility:** first token ending in `SM`. Parse `^(\d+(?:/\d+)?)SM$` into statute miles.
  Improvement: also handle `M1/4SM`, and a whole number followed by a fraction token (`1 1/2SM`).
- **Ceiling:** first `BKN` or `OVC` layer (`^(BKN|OVC)(\d{3})`) × 100 ft; also treat `VV\d{3}` as a
  ceiling. Display `"BKN 2500 ft"`, else `"CLR"`.
- **Temp/dew:** `^M?\d{2}/M?\d{2}$`.
- **Altimeter:** `A\d{4}` → "29.92 inHg"; `Q\d{4}` → "1013 hPa".
- **Flight category:** ceiling and visibility both unknown → UNKNOWN; else ceiling < 500 or vis < 1
  → LIFR; < 1000 or < 3 → IFR; < 3000 or < 5 → MVFR; else VFR.
- **Category colors:** VFR `#27ae60`, MVFR `#3498db`, IFR `#C0392B`, LIFR `#8e44ad`, UNKNOWN `#8899aa`.

### 6.6 Tile math (for offline regions)

Standard Web Mercator slippy tiles: `lon2x(lon, z)`, `lat2y(lat, z)`,
`tilesFor(bbox, zMin…zMax)`, `tileCount(bbox, zRange)`, `tileBBox(x, y, z)`. Unit test against
known values.

---

## 7. Location & sensors

### 7.1 LocationService

- `CLLocationManager` with `desiredAccuracy = kCLLocationAccuracyBestForNavigation`,
  `distanceFilter = kCLDistanceFilterNone`, `activityType = .airborne`,
  `pausesLocationUpdatesAutomatically = false`.
- Request **When In Use** on first START SESSION tap, not at launch. Show the map without GPS
  until permission is granted.
- Also start updates (foreground only) as soon as permission exists, so the map, the nearby
  airports and START SESSION have a fix before a session begins. This mirrors the PWA, which
  watches position from app launch.
- Publish `GPSStatus`: `.waiting`, `.active`, `.denied`, `.restricted`, `.unavailable`, `.error(String)`.
  Show a thin status pill on the map when the status is not `.active`.
- Expose an `AsyncStream<Fix>` where
  `Fix = (lat, lon, altMSL, speed, course, courseAccuracy, hAcc, vAcc, timestamp)`.
- **Reject** fixes with `horizontalAccuracy < 0` or `> 100 m`, and any fix with a timestamp older
  than the previous one.
- `speed < 0` → 0. `course < 0` → invalid (use the fallback below). `altitude` (MSL) is used for
  altMSL. `verticalAccuracy < 0` → keep the previous altitude.

### 7.2 Ground-track smoothing (GPSStore)

Keep the last 3 fixes (for VS) and `smoothedTrack: Double?`.

On each fix, when `speed > 1 m/s` (≈ 2 kt):
- raw track = `course` if valid (`course ≥ 0` and `courseAccuracy` in 0…30), else
  `bearing(prevFix, fix)`
- `smoothedTrack = circularEMA(smoothedTrack, raw, alpha: 0.25)`

Below 1 m/s, leave `smoothedTrack` unchanged, so the map does not spin on GPS jitter at rest.
Displayed TRACK / `hdg` = `smoothedTrack ?? 0`.

### 7.3 Background tracking (native-only)

- Capability: Background Modes → **Location updates** (`UIBackgroundModes: location`).
- During an active session: `allowsBackgroundLocationUpdates = true`,
  `showsBackgroundLocationIndicator = true`, and hold a `CLBackgroundActivitySession` (iOS 17+) for
  the session's lifetime. When In Use authorization is enough with a background activity session;
  **do not request Always**. VERIFY against the current Core Location docs.
- When no session is active, stop background updates entirely (battery).
- Setting `up.backgroundTracking` (default on). When off, tracking pauses when the app is backgrounded.
- Keep awake: `UIApplication.shared.isIdleTimerDisabled = true` while a session is active and
  `up.keepAwake` is on. Restore on end and on background.

### 7.4 Session pipeline (per accepted fix, while a session is active)

1. `GPSStore.update(fix)` → smoothed track, recent fixes.
2. VS from recent fixes.
3. `InstrumentStore.updateRolling(gsKt, vsFpm, track)`.
4. `values = deriveInstruments(…)` → `InstrumentStore.values`; update `maxAGLft`.
5. `RouteStore.checkAutoAdvance(values.dte, pos)`.
6. If `recordTrack` and `fix.ts − lastTrackTs ≥ 5000 ms` → append a TrackPoint to the in-memory
   buffer and to the live-track polyline source.
7. **Flush** the buffer to SwiftData every 30 s, on `scenePhase` → background/inactive, on session
   end, and on memory warning.

When no session is active: steps 1 and 2 only, plus a basic `gs`/`msl`/`hdg` for display.
UI updates are throttled to at most 2 Hz. The pipeline itself processes every fix.

### 7.5 Barometric assist (v1.1, design only)

`CMAltimeter.startRelativeAltitudeUpdates` gives altitude relative to the moment it starts. That
is a natural fit for "AGL above origin". Plan a setting "Altitude source: GPS | GPS + Baro" that
blends baro-relative altitude with a GPS-anchored origin. Not in v1.

### 7.6 Crash and relaunch safety

- `up.activeSessionId` is set on start and cleared on end.
- On launch: if it points to a session with `endTime == nil` and no `deletedAt`, restore it as
  active, load its events and track points (to rebuild the live polyline and `maxAGL`), and resume
  GPS. Show a toast: "Resumed session started 14:03".

---

## 8. Maps (MapKit)

### 8.1 Critical constraint: Apple Maps offline downloads

**Third-party apps cannot use the offline maps a user downloads in the Apple Maps app.** Apple
DTS (Ed Ford, Apple Developer Forums thread 765857, Oct 2024): *"If you're looking to use Apple's
own offline maps provided by the Maps app and then load that data in your app, that is not
possible with the APIs available today."* Apple's map tiles also may not be cached for offline use
by apps: no scripted pre-warming, no tile scraping.

**VERIFY before building §8.7:** check the current MapKit documentation and the most recent WWDC
MapKit session for any new offline API (for example, an offline-region or download API on
`MKMapView` or SwiftUI `Map`). If one exists:
- make Apple offline regions the primary offline path, and
- keep §8.7 as the satellite-imagery fallback, because Apple's offline downloads historically
  don't include imagery.

The app is therefore designed around a `Basemap` abstraction:

| Basemap | Implementation | Online | Offline |
|---|---|---|---|
| **Map (vector)** | `MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)`, `pointOfInterestFilter = .init(including: [.airport])`, `showsTraffic = false` | ✅ Apple | ⚠️ Only whatever MapKit has cached on its own — not guaranteed |
| **Satellite** | `MKImageryMapConfiguration(elevationStyle: .flat)` | ✅ Apple | ⚠️ same |
| **Hybrid** | `MKHybridMapConfiguration(elevationStyle: .flat)`, same POI filter | ✅ Apple | ⚠️ same |
| **USGS Imagery (offline-capable)** | `MKTileOverlay` subclass with `canReplaceMapContent = true` | ✅ network or disk | ✅ downloaded regions |
| **USGS Topo (offline-capable)** | same | ✅ | ✅ |

### 8.2 Map view setup

- `MKMapView` in `UIViewRepresentable`, with a `Coordinator` as `MKMapViewDelegate`.
- `isPitchEnabled = false` (the camera is always 2D). `showsCompass = false` (the app draws its own
  orientation button). `showsScale = true`, top-leading below the strip.
  `showsUserLocation = false` (the app draws its own-ship arrow from the smoothed track).
- `overrideUserInterfaceStyle` follows `up.map.appearance` (default `.dark`). Dark is the cockpit
  default; light may read better in direct sun.
- `isRotateEnabled`: true in Track Up (the gesture is ignored while following), true in North Up
  but snap the heading back to 0 on gesture end. Simpler: disable the rotate gesture in North Up.
- Camera persistence: save center, distance and heading to `up.map.camera` on `regionDidChange`
  (debounced 1 s). Restore on launch. Default is center (38.9, −94.6), about 25 km camera distance.

### 8.3 Orientation & follow

- `autoFollow = true` initially. A **user gesture** (pan, pinch or rotate) sets
  `autoFollow = false`. Detect it in `regionWillChangeAnimated` by checking the map's
  gesture-recognizer states, not animated/programmatic changes.
- On each fix, if `autoFollow`: set the camera center to own-ship (non-animated, or ≤ 0.2 s).
- **Track Up:** if `smoothedTrack != nil`, set `camera.heading = smoothedTrack` on every fix
  (non-animated). Animate (0.3 s) only when toggling the mode.
- **North Up:** heading 0.
- **Recenter button (▲):** `autoFollow = true`; center on own-ship; camera distance =
  `min(current, 8_000 m)` (the PWA's "zoom ≥ 13").
- **Orientation button:** icon is a red-edged arrow in Track Up, a compass rose with a red north
  half and an "N" in North Up. The state persists.

### 8.4 Overlays and annotations (painter's order, back to front)

| # | Layer | Type | Style | Visible when |
|---|---|---|---|---|
| 1 | Basemap tile overlay | `MKTileOverlay` (level `.aboveLabels` not needed; use `.aboveRoads` + `canReplaceMapContent`) | — | USGS basemap selected |
| 2 | Past-session track | polyline | green `#00E676` @ 60 %, 2 pt, dash [3, 3] | a history session is "shown on map" |
| 3 | Past-session events | annotation | 10 pt dot, event color, 1 pt white stroke | same |
| 4 | Distance rings | 3 circles, radii 926 / 1852 / 3704 m (0.5 / 1 / 2 nm), centered on own-ship | `#8899aa` @ 50 %, 1 pt | setting on |
| 5 | Route casing | polyline | black @ 40 %, 7 pt active / 5 pt inactive | route active or previewed |
| 6 | Route line | polyline | magenta `#E040FB`, 4 pt active (100 %) / 3 pt preview (60 %) | same |
| 7 | Route waypoints | annotation | numbered dot; active leg magenta, others white @ 60 %; label cream with black halo; **44 pt hit area** | same |
| 8 | Direct-To line | polyline own-ship → target | magenta @ 85 %, 2 pt, dash [5, 3] | Direct-To set |
| 9 | Direction line | polyline from 0.02 nm to **1.5 nm** ahead along track | cream @ 60 %, 1.5 pt, dash [3, 3] | setting on and speed > 0.5 m/s |
| 10 | Live track (breadcrumb) | polyline | green `#00E676`, 4 pt, 90 % (+ 1 pt black @ 40 % casing on the light/vector basemap) | session active and recordTrack |
| 11 | Airports | annotation | small cyan `#00acc1` circle + ICAO label (cyan, black halo); use `displayPriority` and `clusteringIdentifier` | setting on and camera distance ≤ ~400 km (≈ PWA zoom ≥ 8); only add those in the visible rect + 20 % margin |
| 12 | Waypoints | annotation | 12 pt blue `#3498db` dot, cream label; 44 pt hit area | always |
| 13 | Origin | annotation | hollow circle + "ORIGIN" label | session active |
| 14 | **Traffic** (§20.6) | annotations + velocity-vector polylines | amber `#FFD600` chevrons; alerting targets red | GDL-90 connected and the traffic layer is on |
| 15 | Own-ship | annotation (topmost, `zPriority = .max`) | cream arrow with red outline and soft red glow | fix available |

Implementation notes:

- **Own-ship rotation:** annotation views don't rotate with the map. Set
  `view.transform = rotation(smoothedTrack − mapView.camera.heading)` on each fix **and** in
  `regionDidChange` / `mapViewDidChangeVisibleRegion`. In Track Up that is ≈ 0, so the arrow points up.
- **Live track performance:** `MKPolyline` is immutable. Keep the track as a list of *chunks* of up
  to 500 coordinates. Only the last (open) chunk is rebuilt, at most once per track-point interval
  (5 s). Closed chunks are never re-rendered.
- **Magenta and green lines on the vector/light basemap** get a 1 pt black @ 40 % casing, per the
  PWA map conventions. On satellite and dark maps the casing is optional.
- Use `MKMultiPolyline` for the rings where helpful. Recompute rings and the direction line on every
  fix (cheap).

### 8.5 Map color conventions (non-negotiable — industry standard)

| Element | Color |
|---|---|
| Active route / course / active waypoint / Direct-To | Magenta `#E040FB` |
| Breadcrumb track | Green `#00E676` |
| Non-active waypoints (route) | White @ 60 % |
| Traffic / caution overlays (future) | Amber `#FFD600` — reserved; don't use for decoration |

### 8.6 Map interactions — tap popup

A single tap on the map opens a small popup card anchored at the tap point (clamped on screen). A
tap on a feature takes precedence over an empty-map tap: use a hit test against annotations, and
compute distance to the route polyline for route-waypoint dots. A tap outside the card dismisses it.

| Tapped | Header | Actions (in order) |
|---|---|---|
| Empty map | `lat.5f, lon.5f` (mono) | **Direct To** (session active only) · **Add Waypoint** (name defaults to "Waypoint N+1") · **Reset Origin Here** (session active; uses the current GPS altMSL) · Dismiss |
| Airport | ICAO (cyan, mono) + "{elev} ft MSL" + name | **Direct To** (session) · **Add Waypoint** (name prefilled with the ICAO) · **Get METAR** (fetches and switches the Wx tab's station) · Dismiss |
| Waypoint | "⌖ Name" + coords + note | **Direct To** (session) · **Share Waypoint** · Dismiss |
| Route waypoint | "N. Name" (magenta) + coords | **Fly Leg** (disabled with the hint "start session first" when there is no session) · **Direct To** (session) · Dismiss |

Direct-To captures `from = current position` (falls back to the target itself when there is no fix).
Add Waypoint opens a small name sheet (Cancel / Save). Saving while a session is active stamps a
`waypoint` event with note = name.

Long-press (native addition): same as an empty-map tap, but it opens Add Waypoint directly.

### 8.7 Offline maps (app-managed tile regions)

**Goal:** before launch, at the field, with cell service, a pilot downloads the local area. In the
air, with no service, the map still renders a basemap.

**Tile sources (VERIFY the endpoints, max zoom and usage policy before shipping):**

| Layer | URL template | Notes |
|---|---|---|
| USGS Imagery Only | `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}` | Public-domain US government data; note the **{y}/{x}** order. US coverage only. Useful to about z16. |
| USGS Topo | `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}` | Roads, water, contours, place names |

Add attribution text "USGS The National Map" in a map corner when a USGS layer is visible.

**Architecture:**

```
OfflineMapStore ─► TileDownloadService (URLSession background configuration, ≤ 4 concurrent, polite User-Agent "UltraPilot-iOS/<ver>")
                     └─► writes  Application Support/Tiles/<layer>/<z>/<x>/<y>.<ext>
                                 (isExcludedFromBackup = true; shared tile cache across regions)
               ─► PersistenceService: OfflineRegionRecord (metadata, per-region tile list hash, state)

OfflineTileOverlay: MKTileOverlay
  loadTile(at path):
    1. file exists on disk → return it
    2. online → fetch, return, and write to a small LRU "browse cache" (cap 200 MB, separate dir)
    3. else → return a transparent/blank tile (never error-spam)
```

**Region download flow (Offline Maps screen):**

1. **Add Region** → choose the extent: *Current map view*, or *Radius around current position*
   (10 / 25 / 50 nm).
2. Choose the layer (Imagery / Topo / both) and the max detail: Low (z12), Medium (z14), High
   (z15), Max (z16, imagery only). Min zoom is always 6.
3. Show **tile count and estimated size** before confirming. Estimate 25 KB per imagery tile and
   15 KB per topo tile. Refuse above 40,000 tiles per region, with the message "Reduce area or
   detail".
4. Show the download with progress, pause/resume, and cancel. It must survive backgrounding (a
   background `URLSession`). Retry each tile up to 3 times with backoff. Record failures; a region
   with failures ends in `.complete` with a "N tiles missing — Retry" affordance.
5. Region list: name (editable; default "Area near KXXX" using the nearest airport), layer,
   detail, size on disk, date, and a small bbox preview (an `MKMapSnapshotter` image).
   Swipe to delete.
6. **Delete** uses reference counting: a tile file is removed only if no remaining region's tile
   set contains it. Compute the set from region bbox + zoom range, so no per-tile table is needed.

**Automatic offline switching:** `ConnectivityService` wraps `NWPathMonitor`. When the path is
unsatisfied, `up.map.autoOffline` is on, the current basemap is an Apple basemap, and a downloaded
region intersects the visible area:
- switch the display to that region's layer (imagery for satellite/hybrid, topo for vector), and
- show a small pill "OFFLINE MAP".

When connectivity returns, switch back to the user's chosen basemap. The user's saved preference
is never overwritten.

**Settings/UI copy** must be honest: "Apple Maps can't be downloaded for offline use by other apps.
UltraPilot downloads USGS imagery and topo maps for offline flying instead."

Storage summary in the Offline Maps screen: total on disk, browse cache size, and a "Clear browse
cache" button.

---

## 9. App shell & navigation (Garmin Pilot pattern)

The map is always "home". A custom bottom nav bar (not `TabView`: the map must persist across tabs
on iPad, and tapping Map has special behavior) controls the secondary content area.

### 9.1 Layout modes

Determine the mode from the container size (`GeometryReader`) and size class, not the device type:

| Mode | Condition | Map | Panel | Toggle |
|---|---|---|---|---|
| **Compact** (phone) | width < 700 pt | full screen, or hidden when a panel tab is active | replaces the map entirely | nav tab |
| **Split vertical** (iPad portrait, or wide phones in landscape if height ≥ 600) | 700 ≤ width < 1000 | top 52 % | bottom 48 % | chevron ˅/˄ centered on the map's bottom edge |
| **Split horizontal** (iPad landscape, large Split View) | width ≥ 1000 | left, fills | right, 340 pt | chevron ‹/› on the map's right edge |

- Tapping **Map** always shows the map with the panel collapsed.
- Tapping another tab in split modes opens the panel with that content. The chevron toggles the
  panel without changing the selected tab.
- The map view is **one instance** for the app's lifetime. Don't recreate it on tab changes.
- Panel transitions: 0.25 s ease; respect Reduce Motion (cross-fade instead).

### 9.2 Instrument strip (top)

- Fixed at the top, below the safe area, 58 pt tall plus the safe-area inset. Background
  `rgba(14,14,20,0.96)` with a blur material. Visible on every tab when `showInstrumentStrip` is on.
- Cells are equal width, with 1 pt dividers. Each cell: LABEL (11 pt, dim, uppercase, tracking
  0.06 em) above VALUE (22 pt B612 Mono bold, range color) + unit (11 pt dim) on the baseline.
- Visible count: `stripCount` (4/5/6), capped at **4 in Compact**. `hsi` is skipped in the strip.
- **Tap a cell** → instrument picker sheet to replace that slot.

### 9.3 Bottom nav bar

Height 60 pt plus the home-indicator inset, background `#0c0c12`, top border. Seven equal
buttons, each at least 44 pt tall: icon (SF Symbol) over label (11 pt).

| Tab | Label | SF Symbol (suggested) |
|---|---|---|
| map | Map | `map` |
| timeline | Timeline | `clock` |
| checklists | Lists | `checklist` |
| wx | Wx/Apt | `cloud.sun` |
| waypoints | Wpts | `mappin.and.ellipse` |
| routes | Routes | `point.topleft.down.to.point.bottomright.curvepath` |
| more | More | `ellipsis` |

Active = red `#C0392B`; inactive = light `#d8e4ec`.

**More** opens an upward popover menu (anchored bottom-right) with: Instruments, **Traffic**,
Sessions, Offline Maps, **Devices**, Settings. While one of these is shown, the More button is in the active state.

### 9.4 Route banner

When a route is active, a slim capsule floats below the strip, centered, with a red border:
"{route name} · {leg}/{total}" (10 pt dim) over the leg waypoint name (15 pt bold cream), plus
buttons ‹ (prev, disabled on the first leg), › (next) and ✕ (deactivate). Each button is ≥ 44 pt
(the PWA uses 32; native fixes this).

### 9.5 First-launch disclaimer

A full-screen modal that can't be dismissed until the pilot taps **I UNDERSTAND**. Text (verbatim):

> **Aviator's Toolkit** (small red caps) — **Disclaimer**
> This app is provided free of charge, as-is, with no warranty of any kind. It is intended as a
> flight planning and reference aid only — not a substitute for official charts, NOTAMs, weather
> briefings, regulatory requirements, or qualified flight instruction. Always exercise
> pilot-in-command judgment and consult authoritative sources. The developer assumes no
> responsibility for any damages, losses, or incidents arising from use of this app.

Stored in `up.disclaimerAccepted`. It can be re-read from Settings → About.

---

## 10. Screens

### 10.1 Map screen floating controls

| Position | Control |
|---|---|
| Top-left / top-right / bottom-right (above REC) | Map overlay instruments (`mapLeft`, `mapRight`, `mapBottom`) when `showMapOverlays` is on. Card: dark translucent, 12 pt radius, label 11 pt dim, value 32 pt mono bold in range color, unit below. Arrow instruments draw a rotating arrow + sub-label. `hsi` renders the HSI at 160 pt. **Tap** → picker (includes "None"). |
| Bottom-left column | Direct-To indicator card (magenta border: "D→ NAME", a magenta arrow rotated to the absolute bearing, 32 pt distance, "nm") · orientation toggle · recenter ▲ · "× D→" cancel pill (magenta, when Direct-To is set). All buttons 44 pt circles. |
| Bottom-center | **No session:** "START SESSION" (red, 15 pt bold, ≥ 44 pt tall, padded). If there is no fix yet: disabled, with the label "WAITING FOR GPS…". **Session active:** a **STAMP** button, 64 pt red circle with a white 3 pt @ 15 % ring and a red glow. In the split-vertical layout, raise both above the chevron. |
| Bottom-right | **REC** pill (green dot + "REC" + session elapsed) when a session is active. Tap → "End Session?" dialog: "GPS tracking will stop and the session will be saved." [Cancel] [End Session (red)]. |
| Top-center, under the strip | GPS status pill when not active ("Waiting for GPS", "Location denied — Settings", …); "OFFLINE MAP" pill (§8.7). |
| Bottom-left corner of the map | Attribution for USGS layers (the Apple legal label stays visible — never hide it). |

**Start session:** requires a fix. Reset the rolling stats and maxAGL, create the session with the
current fix as origin, stamp `session_start`, enable background mode and keep-awake, and fire a
success haptic.

**End session:** stamp `session_end` at the current position, flush the buffer, compute total
distance from the stored points, set endTime/maxAGL, clear `up.activeSessionId`, stop background
updates, then **open Sessions → detail of the just-ended session** (PWA behavior via
`justEndedSessionId`).

### 10.2 Stamp sheet

Bottom sheet with the title "Stamp Event" and ✕:
- a 3-column grid of `USER_STAMP_TYPES` buttons (≥ 44 pt tall). Tapping one selects it (event-color
  border and tinted fill); tapping it again deselects.
- a "Note (optional)" text field.
- a full-width red confirm button: "Stamp: {Label}" when a type is selected, else "Quick Stamp"
  (records `custom`).

The stamp records `ts = now`, the current lat/lon/altMSL, `altAGL = altMSL − originAltMSL`
(meters), speed and note. For `engine_start` with an empty note, note = the detected engine cycle.
Fire a haptic.

**Speed matters:** it must be possible to stamp Takeoff in two taps (STAMP → Takeoff → confirm is
three; add **long-press on a type button = stamp immediately**).

#### 10.2.3 HSI (composite instrument)

Port `HSIInstrument.tsx` as a SwiftUI `Canvas` view in a 128 × 128 coordinate space, scaled to size:
- bezel circle r = 62, fill `rgba(14,14,20,0.92)`, border white @ 12 %
- compass rose r = 52, **rotated −hdg**: ticks every 10° (major every 30°, longer); labels N/E/S/W
  (9 pt bold cream) and 3, 6, 12, 15, 21, 24, 30, 33 (7 pt `#8899aa`) at r − 15
- bearing pointer to origin (amber `#e67e22`), angle `brg − hdg`: needle head near the rim, dashed tail
- course pointer + CDI (magenta), only when Direct-To is set, angle `dtk − hdg`: the TO arrowhead
  end, the FROM notch end, and a CDI bar deflected perpendicular by `clamp(xtk / 0.3, −1, 1) × 22`
  units. Four scale dots at ±11 and ±22. A "TO" (green) or "FR" flag: TO when the relative course
  is within ±90°.
- a fixed cream aircraft symbol at the center, plus a lubber line at the top
- "{dist} nm" (to origin) at the bottom

### 10.3 Timeline tab

- **No session:** empty state "No active session" + a START SESSION button.
- **Active:** three summary cards in a row: FLIGHT (computeFlightTime), SESSION (elapsed),
  MAX AGL ("{ft} ft"). They update every second.
- Then a vertical timeline, newest at the bottom (PWA order ascending; auto-scroll to the latest):
  a left rail line, and a colored dot per event. Each row: bold cream label, dim right-aligned
  `HH:mm:ss`, and a dim detail line (`eventDetail`).
- Native addition: swipe a row to **edit the note** or **delete** the stamp (not session_start or
  session_end).

### 10.4 Checklists tab

- **List:** grouped by category, in the order Preflight, Before Takeoff, In Flight, Before Landing,
  Post Flight, Custom. Each row shows the name, item count and a status badge: **Done** (completed
  this session), **Active** (runner open with progress; amber border), or none.
- **Runner:** header with ‹ back, the name, and "4 of 12" with a progress bar. Each item is a row of
  at least 52 pt: checkbox + text. Tap toggles (haptic). When all items are checked: a completion
  state (green) and an auto-stamp `checklist_complete` with note = checklist name (only if a
  session is active). A Reset button.
- Items display as `CHALLENGE — RESPONSE`. Render the part after " — " right-aligned in bold where
  present.
- **Editor** (native addition; the PWA spec calls for it): Edit button in the list → create /
  rename / change category / delete checklists; add, edit, delete and **drag-reorder** items;
  "Restore default PPC checklists" (re-adds any missing default by id).
  - Import/export JSON: `{ "type": "ultrapilot-checklists", "version": 1, "exportedAt": ISO, "checklists": [Checklist] }`.
    Import skips ids that already exist.
- **Seed:** on first launch, if there are no checklists, insert the defaults (Appendix A).

### 10.5 Wx/Apt tab

**METAR card:**
- An ICAO text field (uppercase, 3–4 chars, placeholder "ICAO (e.g. KJEF)") + GET button, and a
  **NEAREST** button (uses the current fix).
- Result: station + age ("12 min ago", turning amber when > 60 min), a flight-category badge in the
  category color, the raw METAR in B612 Mono, then decoded rows: Wind, Visibility, Ceiling,
  Temp/Dew, Altimeter.
- Offline or error: show the last cached METAR with "Offline — showing report from 09:52", or the
  error text ("Weather service unavailable. Try again.").
- A successful fetch while a session is active stamps `weather` with note
  `"{station} {category} · {wind} · {vis} · {ceiling}"`.

**Nearby airports:** header "NEARBY AIRPORTS" + a refresh button. It shows 20 rows: ICAO (bold,
mono), name, and "{dist} nm · {brg}". It auto-refreshes when the position has moved more than 1 nm
since the last refresh. A row tap opens actions: Get METAR, Direct To, Add as Waypoint, Show on Map.

**WeatherService** calls aviationweather.gov directly (no CORS proxy is needed natively):
- by id: `GET https://aviationweather.gov/api/data/metar?ids={ID}&format=raw&hours=1` → take the
  first non-empty line; empty → "No current METAR found for {ID}".
- nearest: bbox ±75 statute miles (`latΔ = 75/69`, `lonΔ = 75/(69·cos lat)`) →
  `GET https://aviationweather.gov/api/data/stationinfo?bbox={minLat},{minLon},{maxLat},{maxLon}&format=json`
  → filter where `siteType` contains `"METAR"` → sort by distance → fetch the METAR for the first.
  None → "No METAR stations found within 75 miles".
- Timeout 10 s. Send a descriptive `User-Agent`. VERIFY the current API parameters.

### 10.6 Waypoints tab

- Header: "Waypoints", **Import**, **Share All**, **+**.
- List sorted newest first: name, coords (5 dp mono), note, and distance/bearing from the current
  position when a fix exists.
- A row tap opens a detail sheet: **Direct To** (magenta; needs a session), **Show on Map**,
  **Share Waypoint**, **Edit**, **Delete** (with confirmation).
- New/Edit form: Name (required), **Use Current Position** button, Latitude and Longitude (decimal;
  also accept `DD MM.mmm` and `DD MM SS` with N/S/E/W — native improvement), Note.
- Bundle share format: §12.3 with `routes: []`.

### 10.7 Routes tab

- Header: "Routes", **Import**, **Share All**, **+**. Rows: name, "{n} waypoints · {total nm}",
  and an ACTIVE badge (red).
- **Detail sheet:** ordered leg list with per-leg distance and bearing, then **Activate** (needs a
  session; starts at leg 1 with Direct-To from the current position) or **Deactivate**,
  **Preview on Map** (shows the route at 60 % and fits the camera), **Edit**, **Share Route**,
  **Delete**.
- **Builder:** name field; the current ordered list (reorder by drag, remove); "Add waypoints" from
  saved waypoints; "Nearby airports" (the 20 nearest). Adding an airport creates a waypoint named
  with the ICAO if one doesn't already exist at those coordinates. Requires ≥ 2 legs to save.

### 10.8 Instruments page (More → Instruments)

A full-panel grid using the selected `PageLayout`. Hero cells: 42 pt value. Large cells: 34 pt.
Medium cells: 26 pt. Each cell is a card with label, value and unit, in range colors. Tap a cell →
picker for that slot. A layout-switch control at the top shows 4 thumbnails (Hero Pair, Six-Pack,
Big Hero, Quad). This is meant for the iPad split view: map left, instruments right.

### 10.9 Sessions (More → Sessions)

- **List:** grouped by year with year separators, newest first. Row: date ("Sat, Sep 27"), start
  time, duration, flight time, distance (nm), max AGL (ft), and the event count. Header actions:
  **Export All** (OADS array of all non-deleted sessions) and **Trash**.
- **Detail:** a static map preview (`MKMapSnapshotter`, or an embedded non-interactive `MKMapView`)
  with the track and event dots; stat grid (Start, End, Duration, Flight time, Distance, Max AGL,
  Origin coords, Track points); the event list; actions **Show on Main Map** (sets
  `historySessionId`, switches to Map and fits bounds), **Export GPX**, **Export OADS**, and
  **Move to Trash**.
- **Trash:** soft-deleted sessions with Restore and Delete Forever (confirmation; cascades points
  and events), plus **Empty Trash**.
- **Import Session File** (from Settings and from Sessions): accepts `.gpx`, `.json` (legacy
  `{session, trackPoints, events}` or an array of them) and OADS (single envelope or array). Skip
  sessions whose `id` already exists. Result toast: "Imported 2 sessions (1 skipped)".

### 10.10 Settings (More → Settings)

Grouped list (dark `Form` styling with custom row colors):

- **CURRENT SESSION** (only when active): Export GPX · Export OADS · End Session (red)
- **RECORDING:** Record GPS Track · Background Tracking · Keep Screen Awake
- **MAP DISPLAY:** Basemap (Map / Satellite / Hybrid / USGS Imagery / USGS Topo) · Appearance
  (Dark / Light / System) · Auto-switch to offline map · Direction Line · Distance Rings
  (0.5 / 1 / 2 nm) · Show Airports
- **INSTRUMENTS:** Top Strip toggle · Strip Count (4/5/6) · Map Overlays toggle · Configure Strip &
  Overlays (editor: numbered strip slots with replace/remove/add; overlay slots Top Left / Top
  Right / Bottom Right)
- **INSTRUMENTS PAGE:** layout picker with thumbnails
- **OFFLINE MAPS:** link to the Offline Maps screen + storage used
- **ADS-B & AHRS** (§20.11): Enable GDL-90 · Devices… · Position Source · Traffic on Map ·
  Traffic Alerts… · AHRS…
- **SESSION DATA:** Import Session File · Export All Sessions
- **FEEDBACK:** Haptics toggle
- **ABOUT:** Version (`CFBundleShortVersionString` (build)) · "Part of Aviator's Toolkit" (link
  aviatortoolkit.com — VERIFY the domain with the owner) · Disclaimer · Acknowledgements (B612 font
  OFL, USGS data)

---

## 11. Airports data

- Bundle `airports.json` (copy from the PWA: `apps/ultrapilot/public/data/airports.json`; 2,705 US
  airports). Shape: `[{ "id": "KEET", "name": "SHELBY COUNTY", "lat": 33.17778, "lon": -86.78322, "elev": 586 }]`.
- Load once on a background task at launch. Keep it in memory (small).
- For map display, query the visible rect with a simple grid index (1° buckets) instead of scanning
  all 2,705 on every region change.
- Display names in title case (the source is uppercase), keeping known abbreviations uppercase
  (RGNL, INTL, CO, …).

---

## 12. File formats (interop with the PWA — must match)

All exports go through the share sheet (`ShareLink` / `UIActivityViewController`) as temporary
files. Imports come through `.fileImporter` and "Open in" (§14 document types).

### 12.1 GPX 1.1 (session)

Filename: `ultrapilot-{YYYY-MM-DD}-{unixSeconds}.gpx`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="UltraPilot" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>UltraPilot Flight {session.id}</name>
    <time>{session.startTime ISO}</time>
  </metadata>
  <!-- one wpt per event EXCEPT session_start / session_end -->
  <wpt lat="…" lon="…">
    <ele>{altMSL m, 1 dp}</ele>
    <time>{ISO}</time>
    <name>{TYPE WITH SPACES, UPPERCASED}</name>   <!-- e.g. ENGINE START -->
    <desc>{note, XML-escaped}</desc>              <!-- only if note -->
  </wpt>
  <trk>
    <name>Flight Track</name>
    <trkseg>
      <trkpt lat="…" lon="…">
        <ele>{m, 1 dp}</ele>
        <time>{ISO}</time>
        <extensions><speed>{m/s, 2 dp}</speed><course>{deg, 1 dp}</course></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
```

GPX import: parse with `XMLParser`. Track points come from all `trkpt` elements (and `rtept` as a
fallback). The origin is the first point. Waypoint names map back to event types by
lowercasing and turning spaces into underscores; unknown names → `custom`, with the name as note.
Add synthetic `session_start`/`session_end` events at the first/last point. Session id = ISO of the
first point's time.

### 12.2 OADS 1.0 (session) — two envelopes per session

Filename for one session: `ultrapilot-{YYYY-MM-DD}-{unixSeconds}.json` (an array of 2 envelopes).
Export All: a single array of all envelopes.

```jsonc
[
  {
    "oads": "1.0",
    "id": "{session.id}:track",
    "type": "track_log",
    "created": "{startTime ISO}",
    "modified": "{endTime ISO ?? now ISO}",
    "source": { "app": "UltraPilot", "version": "{app version}", "platform": "ios" },
    "references": [{ "type": "flight_event_log", "id": "{session.id}:events" }],
    "tags": ["ultrapilot", "session"],
    "data": {
      "flight_date": "YYYY-MM-DD",
      "track": {
        "type": "Feature",
        "geometry": { "type": "LineString", "coordinates": [[lon, lat, altMSL_m], …] },
        "properties": {
          "timestamps": ["ISO", …],
          "ground_speed_kts": [n, …],
          "altitude_msl_ft": [n, …],
          "heading_magnetic": [deg, …]      // NOTE: contains TRUE course (legacy name, keep)
        }
      }
    },
    "extensions": {
      "ultrapilot": {
        "sessionId": "{session.id}",
        "summary": { "duration_s": int, "total_distance_nm": n, "max_agl_m": n },
        "session": { /* full Session object, PWA field names: id, startTime, endTime, originLat, originLon, originAltMSL, maxAGL, totalDistanceNM, deviceInfo, deletedAt */ }
      }
    }
  },
  {
    "oads": "1.0",
    "id": "{session.id}:events",
    "type": "flight_event_log",
    "created": "…", "modified": "…",
    "source": { "app": "UltraPilot", "version": "…", "platform": "ios" },
    "references": [{ "type": "track_log", "id": "{session.id}:track" }],
    "tags": ["ultrapilot", "session"],
    "data": {
      "flight_date": "YYYY-MM-DD",
      "events": [{
        "id": "uuid",
        "timestamp": "ISO",
        "event_type": "takeoff",
        "label": "takeoff",                         // type with underscores → spaces
        "location": { "type": "Point", "coordinates": [lon, lat, altMSL_m] },
        "altitude_msl_ft": n,
        "heading_magnetic": null,
        "notes": "string or null",
        "metadata": { "alt_agl_m": n, "speed_m_s": n }
      }]
    },
    "extensions": { "ultrapilot": { "sessionId": "{session.id}" } }
  }
]
```

Dates: ISO-8601 with milliseconds and `Z` (`ISO8601DateFormatter` with
`.withInternetDateTime, .withFractionalSeconds`). **Accept both with and without fractional
seconds on import.**

OADS import: group envelopes by `extensions.ultrapilot.sessionId`. Rebuild the Session from
`extensions.ultrapilot.session` (or synthesize it from the track), the TrackPoints from the parallel
arrays (speed kt → m/s; heading from `heading_magnetic`; altMSL from `coordinates[2]`; accuracy 0),
and the events from `data.events`. Recompute `maxAGL` (§5.4).

### 12.3 Route/waypoint bundle

```json
{ "type": "ultrapilot-routes", "version": 1, "exportedAt": "ISO",
  "waypoints": [ { "id": "…", "name": "…", "lat": 0, "lon": 0, "note": null, "createdAt": "ISO" } ],
  "routes":    [ { "id": "…", "name": "…", "waypointIds": ["…"], "createdAt": "ISO", "updatedAt": "ISO" } ] }
```

Filenames: `{safe_name}.json` (non-alphanumerics → `_`, lowercased) for one route or waypoint;
`ultrapilot_routes_{YYYY-MM-DD}.json` / `ultrapilot_waypoints_{YYYY-MM-DD}.json` for "all".
Validation errors (show verbatim): "Not a valid JSON object", "Not an UltraPilot routes file",
"Unsupported version: X", "Missing waypoints array", "Missing routes array". Import inserts only ids
that don't exist yet. Result: "Imported 2 routes and 5 waypoints." / "Nothing new — all items
already exist."

### 12.4 Legacy session JSON (import only)

`{ "session": Session, "trackPoints": [TrackPoint], "events": [StampEvent] }` or an array of these.
Normalize defensively, as the PWA does: drop events with non-finite lat/lon/ts, coerce other
non-finite numbers to 0, map unknown types to `custom`, and set `sessionId` to the parent session id.

---

## 13. Design system

### 13.1 Colors (`Theme.Colors`, defined once; **no literal colors in views**)

| Token | Hex | Use |
|---|---|---|
| `red` | `#C0392B` | Primary accent, STAMP, active tab, destructive |
| `redDim` | `#C0392B` @ 18 % | Selected fills |
| `cream` | `#FDF6E3` | Data values, primary text on dark |
| `dark` | `#141418` | App background |
| `darkCard` | `#1E1E24` | Cards, sheets |
| `darkBorder` | white @ 10 % | Hairlines |
| `dim` | `#8899AA` | Labels, secondary text |
| `light` | `#D8E4EC` | Primary UI text |
| `green` | `#27AE60` | OK / completion / VFR |
| `amber` | `#E67E22` | Caution / engine events |
| `blue` | `#3498DB` | Session events, waypoints, MVFR |
| `cyan` | `#00ACC1` | Airports |
| `purple` | `#8E44AD` | LIFR |
| `magenta` | `#E040FB` | Navigation |
| `trackGreen` | `#00E676` | Breadcrumb |
| `navBg` | `#0C0C12` | Nav bar |
| `stripBg` | `rgba(14,14,20,0.96)` | Instrument strip |

The app UI is **dark only** (`.preferredColorScheme(.dark)`); only the map basemap appearance is
configurable.

### 13.2 Typography

- Bundle **B612** and **B612 Mono** (Regular and Bold; SIL Open Font License, from
  github.com/polarsys/b612 or Google Fonts). Register them in Info.plist `UIAppFonts`.
- `Theme.Font`: `primary(size, weight)` = B612; `mono(size, weight)` = B612 Mono. **All numeric
  instrument values use B612 Mono** with `.monospacedDigit()`, so values don't jitter.
- Sizes (pt): instrumentValue 22, instrumentLabel 11, heroValue 42, body 15, small 13, tiny 11.
- Dynamic Type: body and list text scale (with a cap at `.accessibility2`). Instrument values do
  **not** scale; they are sized for the cockpit and must never truncate.

### 13.3 Dimensions

Tap target ≥ 44 pt (enforce with a `.minTapTarget()` modifier). STAMP 64 pt. Nav bar 60 pt. Strip
58 pt. Card radius 12. Sheet radius 16. Standard padding 12/16.

### 13.4 App icon

Use the PWA's `public/icons/icon.svg` as the design source. Export a 1024 pt single-size icon, plus
dark and tinted variants.

---

## 14. Info.plist, capabilities, privacy

| Key | Value |
|---|---|
| `NSLocationWhenInUseUsageDescription` | "UltraPilot uses your location to show your position on the map, compute flight instruments, and record your flight track." |
| `NSLocalNetworkUsageDescription` | "UltraPilot connects to your ADS-B receiver (such as a Levil Astro+) over Wi-Fi to show traffic and attitude." |
| Entitlement `com.apple.developer.networking.multicast` | **Required** to send the discovery broadcast and to receive broadcast GDL-90 datagrams (§20.2). Apple must approve it — **request it on day one**, because approval takes days. |
| `UIBackgroundModes` | `location` (plus `fetch` is **not** needed) |
| `UIAppFonts` | B612 font files |
| `UIRequiresFullScreen` | NO (support iPad multitasking; the layout adapts per §9.1) |
| `UISupportedInterfaceOrientations` (iPhone and iPad) | all except upside-down on iPhone |
| `CFBundleDocumentTypes` / `UTImportedTypeDeclarations` | GPX (`com.topografix.gpx`, ext `gpx`, conforms to `public.xml`) and JSON (`public.json`), role Viewer, so "Open in UltraPilot" works |
| `LSSupportsOpeningDocumentsInPlace` | NO (copy on import) |
| `ITSAppUsesNonExemptEncryption` | NO |

**PrivacyInfo.xcprivacy:** no tracking; no collected data types; required-reason API
`NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`; file timestamp APIs if used
(`C617.1`). No analytics SDKs.

---

## 15. Performance & battery budgets

| Metric | Target |
|---|---|
| Cold launch to interactive map | < 1.5 s on iPhone 13 |
| Fix → instrument/map update latency | < 100 ms |
| Map frame rate while following in Track Up | 60 fps (120 on ProMotion is nice-to-have) |
| 3-hour session | < 30 MB memory growth; the live track stays smooth (chunked polylines) |
| Battery | < 15 %/hour on iPhone 13 at full brightness during an active session (measure; report) |
| SwiftData writes | batched every 30 s; never on the main thread in a way that hitches the map |

Throttle SwiftUI updates: the strip and overlays re-render at ≤ 2 Hz. The own-ship annotation and
camera update on every fix.

---

## 16. Accessibility

- VoiceOver labels on every control. Instruments read as "Ground speed 28 knots"; the strip is one
  accessibility element per cell.
- STAMP, START SESSION and End Session have explicit labels and hints.
- Reduce Motion: no animated camera rotation on the mode toggle; panel cross-fade.
- Don't convey status by color alone. Range colors are paired with the value itself; the flight
  category has a text badge.
- Contrast: cream/light on dark meets WCAG AA.

---

## 17. Testing & acceptance

### 17.1 Unit tests (Core, `swift test`)

- GeoMath: haversine (KJEF → KSTL known distance ±0.1 nm), bearing quadrants and wrap, circularEMA
  wrap (350° & 10° → ~0°), destinationPoint round trip, crossTrackError sign (left negative).
- Wind: synthetic circle — a 25 kt TAS orbit in a 10 kt wind from 270° → estimate 270 ± 3°, 10 ± 1 kt;
  < 8 samples → nil; spread < 60° → nil.
- Instruments: each format and color threshold boundary; FLT with open and closed takeoff/landing pairs.
- Route auto-advance latch behavior; prev/next bounds; deactivate at the end.
- METAR: VFR/MVFR/IFR/LIFR samples, calm wind, gusts, fractional vis, `VV` ceiling, Q/A altimeter.
- Codecs: GPX and OADS **round trip** (export → import → equal within float tolerance). **Import
  golden fixtures produced by the PWA** (ask the owner for sample exports, or generate them from
  the web app) and assert on the parsed values. Route bundle validation messages.
- Tile math: known z/x/y for fixed coordinates; tile count for a bbox.

### 17.2 Integration / UI tests

- Simulated flight: bundle `TestFlights/ppc-pattern.gpx`, a generated 30-minute pattern around a
  field at 28 kt, climbing to 800 ft AGL with 360° turns (for wind). Use it with Xcode's location
  simulation.
- XCUITest: disclaimer → start session → stamp takeoff → run a checklist to completion → timeline
  shows 3+ events → end session → session detail opens → export GPX produces a file.

### 17.3 Acceptance criteria (v1 done when all pass on a real iPhone and iPad)

1. A PPC pilot can mount the phone, start a session, see position and live instruments, stamp
   events, run checklists and end the session, then export a GPX that opens in another app.
2. With the phone **locked for 20 minutes** mid-session, the track has no gap longer than 10 s.
3. Force-quitting mid-session and relaunching resumes the same session, with its track intact
   (≤ 30 s of points lost).
4. In **Airplane Mode**, with a downloaded USGS region: the map renders imagery/topo for the area;
   everything except METAR and Apple basemaps works; the Wx tab shows the last cached METAR.
5. Track Up keeps the direction of travel at the top without visible jitter when stationary.
6. The iPad landscape split shows the map left and instruments/panels right; the chevron toggles
   the panel; tapping Map collapses it.
7. A GPX and an OADS file exported from the **PWA** import correctly, and a native OADS export
   imports into the PWA.
8. Every interactive element is ≥ 44 pt (verify with the Accessibility Inspector).
9. Joined to the **Levil Astro+** Wi-Fi, the Devices screen shows "Connected" within 5 s, with
   non-zero message rates and a recognized AHRS format.
10. Live ADS-B traffic appears on the map within 2 s of the device reporting it, with correct
    relative altitude and a velocity vector. Targets dim after 10 s without an update and disappear
    after 30 s.
11. A replayed (or real) intruder inside the alert envelope triggers the banner, the haptic and the
    spoken callout exactly once per encounter, then re-arms after it leaves the envelope.
12. The attitude indicator tracks the Astro+ in bank and pitch with < 250 ms perceived lag, and
    "Level AHRS" zeroes the display in the mounted attitude.

---

## 18. Milestones (build in order)

| # | Milestone | Done when |
|---|---|---|
| M0 | Project scaffold: Xcode project, Core package, theme, fonts, dark shell with nav bar + empty tabs, disclaimer | Builds; `swift test` runs |
| M1 | Core logic + codecs ported with full unit tests (§6, §12) | All Core tests green |
| M2 | Persistence (SwiftData schema, PersistenceService, mappers) + stores skeleton | CRUD tests green |
| M3 | LocationService + GPSStore + session lifecycle + track buffering + background + crash restore | Simulated GPX session records correctly |
| M4 | Map: MKMapView wrapper, basemaps, own-ship, follow/Track Up, breadcrumb, origin, direction line, rings, airports, waypoints, tap popup | Criteria 5 |
| M5 | Instrument strip, map overlays, HSI, Instruments page, picker, configurator | All 22 instruments render correctly |
| M6 | Stamp sheet, Timeline, Checklists (runner + editor), Wx/Apt | Criteria 1 (minus export) |
| M7 | Waypoints, Routes, Direct-To, route banner, auto-advance | Fly a simulated route end to end |
| M8 | Sessions history, trash, export/import, share sheet, document types | Criteria 1, 7 |
| M9 | Offline maps (§8.7) + connectivity auto-switch | Criteria 4 |
| M10 | Layout polish (iPad split modes), accessibility, performance pass, privacy manifest, app icon | Criteria 2, 3, 6, 8 |
| M11 | GDL-90 Core: framer, CRC, decoders for every message in §20.3, traffic rules, alert logic — with byte-level fixtures | Core tests green |
| M12 | GDL-90 transport + Devices screen + raw capture/replay + built-in simulator source (§20.10) | A replay file drives traffic and AHRS in the Simulator |
| M13 | Traffic on the map, traffic list, alerts (visual, haptic, speech), position-source fusion | Criteria 9–11 |
| M14 | AHRS instruments (ADI, slip, G), Heading Up mode, level calibration, AHRS track-point logging | Criterion 12 |

Milestones M11–M12 can run in parallel with M4–M10 once M1 is done. **Before M12, ask the owner
for a raw capture from the Astro+** (§20.10) — every Astro+-specific assumption must be confirmed
against it.

---

## 19. Open questions for the owner

1. **Bundle ID, team and App Store name.** Is `com.aviatorstoolkit.ultrapilot` correct? Is the
   website aviatortoolkit.com or aviatorstoolkit.com?
2. **Magnetic vs true.** GPS course is true. Pilots think magnetic. Should v1 show TRACK/BRG/DTK in
   magnetic? That needs a bundled World Magnetic Model (the WMM coefficients are public domain; about
   a 200-line port). Recommended: yes, with a "True/Magnetic" setting, default Magnetic.
3. **Offline basemap source.** Is USGS (US-only, public domain) acceptable, or do you want a
   licensed commercial source (for example a MapTiler/Mapbox plan) for worldwide coverage?
4. **FAA VFR sectional overlay.** Later via the same tile-overlay mechanism?
5. **iCloud.** Should exports default to an iCloud Drive "UltraPilot" folder?
6. **Session auto-start.** Should the app offer to start a session automatically when GS exceeds
   ~10 kt with no active session?
7. **Astro+ specifics (needs a raw capture):** Which UDP port does it send to (4000 and/or 43211)?
   Broadcast or unicast? Which AHRS format does it use (ForeFlight 0x65/0x01, Levil 0x4C/0x45, or
   both)? Does it send a ForeFlight ID message? Does it report pressure altitude?
8. **Own aircraft ICAO address.** Does your PPC have ADS-B Out? If so, enter the hex code in
   Settings, so the app never shows your own aircraft as traffic.
9. **Traffic alert envelope defaults for PPC.** The proposed default is 2 nm / ±1,000 ft. Would you
   like it tighter or looser?

---

## 20. External avionics: GDL-90 over Wi-Fi (ADS-B In, AHRS, external GPS)

### 20.0 Goals and principles

- The pilot joins the phone to the **Levil Astro+** Wi-Fi network. UltraPilot then shows live
  ADS-B traffic, attitude and (optionally) the device's GPS with **no pairing step**.
- The app must be **device-agnostic GDL-90**. The Astro+ is the primary test device, but Stratux,
  Stratus, Sentry and uAvionix devices speaking GDL-90 should work too.
- **Everything is supplemental.** Traffic display and alerts don't replace see-and-avoid; the AHRS
  is not for IMC flight. Show this once on first connection (a separate acknowledgement,
  `up.gdl90.disclaimerAccepted`) and permanently in small print on the Traffic and ADI views.
- A missing, stale or garbled device must **never** degrade the core app. Every GDL-90 value is
  optional, and the UI falls back to internal GPS and "---".
- **Nothing about the Astro+ is assumed without a capture.** Where this section says ASTRO+ VERIFY,
  confirm it from a raw capture (§20.10) before hard-coding it.

### 20.1 Architecture

```
Wi-Fi (device AP, no internet)
   │ UDP datagrams (GDL-90 frames)
   ▼
GDL90Service (Services) ── BSD UDP sockets on ports [4000, 43211] (+ user-configurable), dedicated serial DispatchQueue
   │ raw Data + receive timestamp   ──► GDL90CaptureService (optional: append to capture file)
   ▼
GDL90Framer (Core, pure) ── split on 0x7E, un-escape, CRC check  → [Frame]
   ▼
GDL90Decoder (Core, pure) ── Frame → GDL90Message enum
   ▼
DeviceStore (message stats, device identity, health)
TrafficStore (target table, staleness, alerts)       ◄── ownship from PositionSourceStore
AHRSStore (attitude, calibration offsets, G min/max)
PositionSourceStore (fuses internal CLLocation + GDL-90 ownship → the single position that feeds §7.4)
```

All decoding happens off the main thread. Stores receive **coalesced** updates on the main actor:
traffic at ≤ 2 Hz, AHRS at ≤ 20 Hz for the ADI and ≤ 5 Hz for text instruments.

### 20.2 Transport and discovery

- **Receive:** open one UDP socket per port, with `SO_REUSEADDR` + `SO_REUSEPORT`, bound to
  `INADDR_ANY`. Default ports are **4000** (the ForeFlight convention, used by most devices) **and
  43211** (the historical iLevil port). Users can add a custom port.
  - ASTRO+ VERIFY: which port(s) it sends to, and whether it broadcasts or unicasts.
  - Use BSD sockets (`socket`/`bind`/`recvfrom`) wrapped in a small Swift class. `NWListener` does
    not reliably deliver broadcast datagrams. VERIFY against the current Network.framework docs;
    if `NWConnectionGroup` now covers the broadcast case cleanly, prefer it.
- **Discovery broadcast (ForeFlight style):** while GDL-90 is enabled and the app is in the
  foreground (and during an active session in the background), send every 5 s a UDP **broadcast**
  to port **63093**: `{"App":"UltraPilot","GDL90":{"port":4000}}`. Many devices start unicasting to
  whoever announces this. It's harmless when ignored.
- **Entitlement:** broadcast send/receive requires `com.apple.developer.networking.multicast` (§14),
  plus the Local Network permission prompt. Trigger that prompt deliberately from the Devices screen
  ("Find my ADS-B receiver") rather than at launch.
- **Background:** during an active session, the process stays alive through background location
  (§7.3), so the sockets keep receiving. VERIFY on a device with the screen locked for 20 minutes.
  With no session, close the sockets when backgrounded.
- **Internet while on device Wi-Fi:** the Astro+ AP has no internet. iOS normally keeps cellular for
  internet traffic. METAR fetches and online map tiles must tolerate this: rely on `NWPathMonitor`,
  never assume that Wi-Fi means internet, and set `allowsCellularAccess = true`.

### 20.3 GDL-90 framing and messages (Core)

**Framing** (GDL-90 ICD, FAA 560-1058-00 Rev A):
- A frame is `0x7E | msgId | payload… | crcLo | crcHi | 0x7E`. One datagram may hold several frames.
- Byte-unstuffing: `0x7D` followed by `b` → `b ^ 0x20`.
- CRC: CRC-16-CCITT, polynomial `0x1021`, init `0x0000`, table-driven, computed over `msgId + payload`
  (after unstuffing). It is transmitted **LSB first**. Drop frames that fail the CRC and count
  them in `DeviceStore.crcErrors`.

**Messages to decode** (unknown ids are counted, then ignored):

| ID | Name | Use |
|---|---|---|
| `0x00` | Heartbeat | Device alive. Status byte 1 bit 7 = GPS position valid, bit 0 = UAT initialized. Status byte 2 bit 7 = timestamp bit 16; bytes 3–4 = timestamp LSB-first (seconds since 0000Z). Message counts are informational. |
| `0x0A` | Ownship Report | External GPS position/track/GS. Pressure altitude of ownship. |
| `0x0B` | Ownship Geometric Altitude | 16-bit signed, big-endian, × 5 ft (MSL/HAE per device; treat as MSL unless the ID message says otherwise). Bit 15 of the vertical metrics = warning; VFOM in meters (`0x7FFF` = not available). |
| `0x14` | Traffic Report | ADS-B / TIS-B / ADS-R targets. |
| `0x65` sub `0x00` | ForeFlight ID | Device name (8 B), long name (16 B), serial (8 B), capabilities (bit 0: geometric altitude datum 0 = WGS-84 ellipsoid, 1 = MSL). |
| `0x65` sub `0x01` | ForeFlight AHRS | Roll, pitch (int16 ×0.1°, `0x7FFF` invalid), heading (int16 ×0.1°, MSB = magnetic, `0xFFFF` invalid), IAS and TAS (uint16 kt, `0xFFFF` invalid). Big-endian. |
| `0x4C` sub `0x45` `0x01` `0x01` | **Levil AHRS** ("LE") | See the layout below. |
| `0x07` | Uplink Data (FIS-B) | v1: count only. v1.1: text METAR/TAF (§20.9). |

**Ownship / Traffic Report layout** (27 payload bytes after the id; all big-endian):

| Byte(s) | Field | Decode |
|---|---|---|
| 1 | alert status (hi nibble), address type (lo nibble) | 0 = ADS-B ICAO, 1 = ADS-B self-assigned, 2 = TIS-B ICAO, 3 = TIS-B track file, 4 = surface vehicle, 5 = ground station beacon |
| 2–4 | participant address | 24-bit, show as 6 hex chars |
| 5–7 | latitude | 24-bit signed two's complement × (180 / 2²³)° |
| 8–10 | longitude | same |
| 11–12 (hi 12 bits) | pressure altitude | `raw × 25 − 1000` ft; `0xFFF` = invalid |
| 12 (lo nibble) | misc | bit 3 = airborne (1) / on ground (0); bit 2 = extrapolated report; bits 1–0 = track type (0 invalid, 1 true track, 2 magnetic heading, 3 true heading) |
| 13 | NIC (hi), NACp (lo) | Integrity/accuracy; used for the position-source choice and target display |
| 14 + hi nibble of 15 | horizontal velocity | 12-bit unsigned kt; `0xFFF` = invalid |
| lo nibble of 15 + 16 | vertical velocity | 12-bit signed × 64 fpm; `0x800` = invalid |
| 17 | track/heading | × (360/256)° |
| 18 | emitter category | 0 no info, 1 light, 2 small, 3 large, 5 heavy, 7 rotorcraft, 9 glider, 10 lighter-than-air, 11 parachutist, 12 ultralight/hang-glider/paraglider, 14 UAV, 17–18 surface vehicle, 19 point obstacle (full table in the ICD) |
| 19–26 | call sign | 8 ASCII chars, trim trailing spaces |
| 27 (hi nibble) | emergency/priority code | 0 none, 1 general, 2 medical, 3 min fuel, 4 no comm, 5 unlawful interference, 6 downed |

(Offsets here count the message id as byte 0. The ICD counts it as byte 1, so ICD byte numbers are
one higher. Verify the decoder against the ICD and the Astro+ capture.)

**Levil AHRS (`0x4C 0x45 0x01 0x01`) layout** — taken from the Stratux open-source encoder,
which emits this format for Levil/Avare compatibility. ASTRO+ VERIFY it against a capture; the
device may send a newer sub-version.

| Offset (from msg id) | Field | Encoding | Invalid |
|---|---|---|---|
| 0–3 | `4C 45 01 01` | id, sub-id "E", version, sub-version | — |
| 4–5 | roll | int16 × 0.1° | `0x7FFF` |
| 6–7 | pitch | int16 × 0.1° | `0x7FFF` |
| 8–9 | heading | int16 × 0.1° | `0x7FFF` |
| 10–11 | slip/skid | int16 × 0.1° (sign: + = ball right; VERIFY — Stratux negates its internal value) | `0x7FFF` |
| 12–13 | yaw (turn) rate | int16 × 0.1 °/s | `0x7FFF` |
| 14–15 | G load | int16 × 0.1 G | `0x7FFF` |
| 16–17 | indicated airspeed | int16 kt | `0x7FFF` |
| 18–19 | pressure altitude | uint16, **ft + 5000** (subtract 5000) | `0xFFFF` |
| 20–21 | vertical speed | int16 fpm | `0x7FFF` |
| 22–23 | reserved | — | — |

If both AHRS formats arrive, prefer Levil (it has more fields) and fill any missing fields from
ForeFlight. Record the detected format in `DeviceStore.ahrsFormat` and show it on the Devices screen.

### 20.4 Device health (DeviceStore)

| State | Rule |
|---|---|
| `disabled` | the user turned GDL-90 off |
| `searching` | no valid frame for > 5 s (or never) |
| `connected` | a valid Heartbeat or Ownship report within the last 3 s |
| `degraded` | frames arriving but heartbeat GPS-invalid, or CRC errors > 10 % over 10 s |

It also exposes: device name (from the ID message if present, else "GDL-90 device"), source IP,
port, per-message-type rates (msgs/s over 5 s), CRC error count, last heartbeat time, GPS valid, UAT
initialized, AHRS format, AHRS rate (Hz), traffic target count, ownship ICAO (from the Ownship
report address).

**Status chip:** a small "ADS-B" chip at the right end of the instrument strip (it takes no
instrument slot): grey = searching, green = connected, amber = degraded. Tap → Devices screen.
Hidden when GDL-90 is disabled.

### 20.5 Position source (PositionSourceStore)

The session pipeline (§7.4) consumes a single `Fix` stream. PositionSourceStore chooses its origin:

- **Auto (default):** use the GDL-90 Ownship report when it is fresh (< 2 s), the heartbeat says
  GPS valid, and NACp ≥ 8 (≈ < 30 m). Otherwise use internal GPS. Add 3 s of hysteresis before
  switching back, to prevent flapping.
- **Internal only** and **External only** are also selectable (External with no valid ownship →
  status pill "External GPS lost").
- Ownship → Fix: lat/lon from the report; altMSL from `0x0B` geometric altitude (ft → m; if the ID
  capability bit says HAE, show the altitude as-is but mark `vAcc` unknown — VERIFY; a
  geoid-correction model is out of scope); speed from horizontal velocity (kt → m/s); course from
  track (if the track type is a true track); hAcc from NACp (per ICD table); timestamp = receive time.
- Every TrackPoint records `source`. The current source shows in the Devices screen and as a tiny
  "EXT" suffix on the strip's GS/TRACK labels when external.
- **Session origin altitude** keeps using whichever source was active at session start. When the
  source switches mid-session, do **not** re-base the origin; AGL may jump by the difference between
  sources. Log this as a known limitation.

### 20.6 Traffic (TrafficStore + map)

**Target model (Core):** `TrafficTarget { address, addressType, callsign?, lat, lon, pressureAltFt?,
airborne, trackDeg?, gsKt?, vsFpm?, emitterCategory, nic, nacp, emergency, lastUpdate (receive time),
isExtrapolated }`.
Key the table by `address` + `addressType` class (ADS-B vs TIS-B), and **merge** a TIS-B target with
an ADS-B target that has the same ICAO address.

**Derived per target** (pure functions, recomputed on each ownship fix and each target update):

- `distanceNM`, `bearingDeg` from ownship; `clockPosition = round(((bearing − ownTrack + 360) % 360) / 30)`,
  where 0 → 12.
- `relativeAltFt = target.pressureAlt − ownship.pressureAlt`. Ownship pressure altitude comes from
  (1) the Ownship report, then (2) Levil AHRS pressure altitude. If neither is available, use
  target geometric altitude vs GPS MSL if the device provides it; otherwise show the relative
  altitude as "?" and **do not** alert on altitude (alert on horizontal distance only, labeled
  "ALT UNKNOWN").
- `trend`: ↑ if vs > +500 fpm, ↓ if < −500, else none.

**Filtering:**
- Drop the **own aircraft**: address == ownship report address, or == the user-entered own ICAO
  hex (Settings), or (no address match) within 0.05 nm and ±200 ft with a track within 20° for
  3 consecutive updates ("ghost" filter).
- Altitude band setting: ±2,000 / ±3,500 (default) / ±5,000 ft / All.
- "Show ground targets" setting (default **on**: PPC pilots fly at fields where ground targets
  matter). Surface vehicles (emitter 17–18) are hidden by default.
- **Staleness:** a target updated > 10 s ago is drawn at 50 % opacity with no vector. After > 30 s
  it is removed.

**Map symbology** (per §8.5, amber is reserved for traffic):

| State | Symbol |
|---|---|
| Airborne, normal | amber `#FFD600` chevron (22 pt), rotated to the target track **relative to the map heading**; data tag below: relative altitude in hundreds with sign and trend ("+05↑", "−12"), and the callsign (setting) |
| Airborne, no track | amber circle, 14 pt |
| On ground | grey `#8899AA` small chevron/circle, no altitude tag |
| **Alerting** (§ below) | red `#C0392B` chevron + a pulsing red ring (Reduce Motion: static ring) |
| Stale | 50 % opacity, no vector |
| Velocity vector (setting, default on) | line from the target along its track, length = distance covered in **60 s**, same color @ 70 % |
| Emergency code ≠ 0 | adds a small red "EMG" tag |

The traffic layer draws above waypoints and below own-ship. Tap a target → popup: callsign/ICAO,
type (ADS-B / TIS-B / ADS-R), emitter category, relative altitude, GS, VS, distance/bearing and
clock position, and age. Actions: Dismiss. With a session active, also **Stamp Traffic** (records a
`traffic_alert` stamp with the target summary as the note).

**Traffic list (More → Traffic):** sorted by distance. Each row: a symbol, callsign or ICAO,
"{dist} nm · {clock} o'clock", relative altitude with trend, GS, and age. Alerting rows are pinned to
the top in red. Header: target count + the device status chip. Empty state: "No traffic — receiver
connected" vs "Receiver not connected".

**Alerts** (Core `TrafficAlertEvaluator`, pure):
- Envelope (settings): horizontal ≤ **2.0 nm** (options 0.5 / 1 / 2 / 3 / 5) **and** |relative
  altitude| ≤ **1,000 ft** (options 500 / 1000 / 1500 / 2000). Plus a **closing** criterion:
  predicted CPA within 60 s inside half the horizontal envelope (linear extrapolation of both
  velocity vectors).
- Only airborne, non-stale targets, and only when **ownship is moving (GS ≥ 15 kt) or a session is
  active** — so no alarms while sitting in the hangar.
- Once per encounter: when a target enters the envelope, raise an alert. The target re-arms after it
  has been outside the envelope × 1.2 (hysteresis) for 15 s.
- An alert does all of the following:
  1. a red banner under the strip, "TRAFFIC 2 O'CLOCK · 1.2 NM · +300 FT ↓", auto-hiding after 10 s
     or dismissed by a tap;
  2. a warning haptic;
  3. an optional **spoken** callout via `AVSpeechSynthesizer`: "Traffic, two o'clock, high, one
     mile" (high/low/same level with ±200 ft as "same altitude"). The audio session is
     `.playback` with `.duckOthers` + `.interruptSpokenAudioAndMixWithOthers`, so it plays through
     a headset over music or intercom audio. Setting default **on**.
  4. if a session is active, auto-stamp `traffic_alert` with note
     `"{callsign|ICAO} {clock} o'clock {dist} nm {rel alt} ft"`.
- Rate limit: at most one spoken callout every 5 s. When several targets alert, announce the
  closest first.

### 20.7 AHRS (AHRSStore + instruments)

**AHRSStore** holds the latest `AHRSSample { roll, pitch, heading?, headingIsMagnetic, slip?,
turnRate?, gLoad?, ias?, tas?, pressureAltFt?, baroVsFpm?, ts }` and derives:
- **Calibrated attitude** = raw − `levelOffset(roll, pitch)`. "Level AHRS" in Settings captures the
  current raw roll/pitch as the offset. It is stored in `up.ahrs.levelOffset`, with a Reset.
  (The Astro+ may offer its own leveling; this is an app-side trim for the mount angle.)
- `gMax`, `gMin` since session start (reset button on the instrument).
- `valid` = a sample within 1 s **and** roll/pitch valid. Invalid → instruments dim, and the ADI
  shows a red "AHRS FAIL" flag (never a frozen attitude).
- Rate: expect 5–10 Hz or more. Interpolate the ADI display between samples at the screen refresh
  rate (linear, ≤ 1 sample period) so it looks smooth.

**New instruments** (added to the picker, groups "Attitude" and "Traffic"):

| ID | Label | Unit | Value / format | Coloring |
|---|---|---|---|---|
| `adi` | ATTITUDE | — | graphic attitude indicator (below); page/overlay only, not in the strip | — |
| `roll` | BANK | ° | signed integer, "L15" / "R15" | amber > 30°, red > 45° |
| `pitch` | PITCH | ° | signed integer | amber beyond ±15°, red beyond ±25° |
| `slip` | SLIP | — | graphic ball (overlay/page) or "L 0.5" text in the strip | amber > 1 ball-width |
| `gload` | G | G | 1 decimal | amber > 2.0 or < 0.5; red > 3.0 or < 0 |
| `gmax` | G MAX | G | "+2.1 / −0.3" | — |
| `palt` | P-ALT | ft | integer | — |
| `bvs` | BARO V/S | fpm | signed; from Levil AHRS VS, else derived from pressure altitude | same thresholds as `vs` |
| `ahdg` | HDG | ° | formatDeg + "M"/"T" suffix | — |
| `trfc` | TRAFFIC | — | nearest airborne target: "1.2 nm · 2 o'clock" over "+300 ↓"; red when alerting; "NONE" / "NO RCVR" | alert red |

**ADI graphic** (SwiftUI `Canvas`, square):
- Sky `#2E6FB0` / ground `#7A4E2A` horizon disc, rotated by −roll and translated by pitch at
  3 pt per degree (scaled to size).
- Pitch ladder every 5° (short) and 10° (long, labeled) to ±30°.
- A bank scale arc at the top with ticks at 10, 20, 30, 45 and 60°, plus a fixed cream roll pointer.
- A fixed cream aircraft reference (W symbol).
- A slip/skid ball inside a tube at the bottom (offset = slip).
- A small "{G}" readout, bottom-right.
- An "AHRS FAIL" red flag overlay when invalid.
- Honor the "not for IMC" principle: no flight-director or synthetic-vision features.

**Instruments page:** add a fifth layout, **`attitude`** ("Attitude"): the ADI as a hero spanning the
top two thirds, with 3 medium slots below (defaults: `gs`, `agl`, `gload`).

**Heading Up map mode:** a third orientation option when AHRS heading is valid:
Track Up / **Heading Up** / North Up. Heading Up sets the camera heading to the AHRS heading
(convert magnetic → true using declination; until the WMM decision in §19 Q2 is made, prefer a
true heading if the device sends one, else show the mode as unavailable). If AHRS drops out, fall
back to Track Up with a toast.

### 20.8 Recording & export

- With AHRS valid, each TrackPoint (5 s cadence) also stores roll, pitch, pressureAltFt and gLoad
  (§5.1). Add optional 1 Hz "high-rate attitude logging" as a setting (default off).
- **OADS:** add parallel optional arrays to `track.properties` — `roll_deg`, `pitch_deg`,
  `pressure_altitude_ft`, `g_load`, `position_source` — using `null` entries where missing. The PWA
  ignores unknown properties. VERIFY against the OADS spec in the repo (`docs/` at the toolkit root)
  and add them under `extensions.ultrapilot` instead if the spec is strict.
- **GPX:** add `<extensions>` children `<roll>`, `<pitch>`, `<palt>`, `<g>` on trkpts when present.
- Traffic isn't recorded continuously in v1. Only `traffic_alert` stamps are. (v1.1: an optional
  "traffic log" of CPA per target per session.)

### 20.9 FIS-B weather (v1.1, design only)

UAT Uplink (`0x07`) frames carry FIS-B products. The high-value, offline-friendly one for this
app is **text METAR/TAF** (APDU product ID 413, DLAC-encoded text). Plan to decode it into the Wx
tab as "via ADS-B" reports, with station and age, when there's no internet. NEXRAD and other
graphics are out of scope.

### 20.10 Capture, replay and simulation (build these first, in M12)

These make the feature testable without flying:

- **Raw capture:** Devices screen → "Record raw data". It writes `capture-{ISO}.gdl90cap`, a binary
  file of records `[uint64 BE receive time µs][uint16 BE port][uint16 BE length][datagram bytes]`
  with a short JSON header line first (app version, device IP, ports). Stop → share sheet. The
  **owner will record an Astro+ capture on the ground and in flight**. Commit these as test
  fixtures (`Tests/Fixtures/astro-plus-*.gdl90cap`) and base the Astro+ verification on them.
- **Replay:** load a `.gdl90cap` (Files / document type) and feed it through the same pipeline as
  the live socket, at real time or 1× / 4× / 10×, with a pause control and a clear "REPLAY" banner.
  It must drive the map, the traffic list, alerts and AHRS in the Simulator.
- **Built-in simulator source** (debug builds + a hidden Settings toggle): synthesizes Heartbeat,
  Ownship (circuits around the current position), 3–5 traffic targets on scripted paths
  (including one head-on conflict that triggers an alert), and Levil AHRS with a gentle bank/pitch
  sine. The encoder lives in Core and doubles as the round-trip test for the decoder.
- **Core tests:** framing (multiple frames per datagram, escaped bytes, bad CRC), each message
  decoder against hand-built byte fixtures (including the invalid sentinels and negative
  lat/lon/VS), relative altitude and clock position, alert entry/exit/hysteresis and the CPA
  prediction, the ghost filter, staleness transitions, and position-source hysteresis.

### 20.11 Settings (ADS-B & AHRS section)

| Setting | Default |
|---|---|
| Enable GDL-90 receiver | on |
| Ports | 4000, 43211 (+ add custom) |
| Send discovery broadcast (63093) | on |
| Position source | Auto |
| Own aircraft ICAO hex | empty |
| Traffic on map | on |
| Show callsigns | on |
| Velocity vectors | on (60 s) |
| Altitude band | ±3,500 ft |
| Show ground targets | on |
| Alerts: horizontal / vertical | 2.0 nm / 1,000 ft |
| Alerts: spoken callouts | on |
| Alerts: auto-stamp to timeline | on |
| AHRS: Level AHRS / Reset | — |
| AHRS: high-rate attitude logging | off |

Keys use the prefix `up.gdl90.*` and `up.ahrs.*`.

### 20.12 Devices screen (More → Devices)

- A big status header: state (Searching / Connected / Degraded / Disabled), device name, and IP:port.
- Guidance when searching: "Join your receiver's Wi-Fi network (e.g. **Astro+-XXXX**) in iOS
  Settings, then return here." Include a button to open iOS Settings, and a note that the phone may
  keep using cellular for internet.
- Live stats table (§20.4), updating at 1 Hz.
- Buttons: Record raw data / Stop & share · Replay a capture… · (debug) Start simulator.
- A "Find my ADS-B receiver" button that triggers the Local Network permission and discovery.

---

## Appendix A — Default PPC checklists (seed data)

Stable ids; `createdAt`/`updatedAt` = Unix epoch (1970-01-01T00:00:00Z). Item ids are
`ppc-{index}` **within each checklist** (they repeat across checklists; they're only unique inside
one). Item text = `"{challenge} — {response}"` (with an em dash).

**ppc-walkaround — "Aircraft Walk-Around" (preflight)**
Fuel — CHECK QUANTITY · Fuel Cap — SECURE · Lines & Filters — CHECK · Engine Mounts — SECURE ·
Oil Level — CHECK · Coolant — CHECK · Hoses & Clamps — CHECK · Drive Belt — CHECK ·
Prop Blades — CONDITION GOOD · Prop Guard — SECURE · Front Tire — CONDITION & PRESSURE ·
Main Tires — CONDITION & PRESSURE · Steering — FREE MOVEMENT · Throttle — FREE MOVEMENT ·
Nuts & Bolts — CHECK

**ppc-cockpit — "Cockpit & Avionics" (preflight)**
Comms — PLUGGED IN · Wind Direction — ASSESSED · Devices — SECURED & PLUGGED IN ·
Altimeter — SET TO LOCAL PRESSURE

**ppc-engine-warmup — "Engine Start & Warm-Up" (preflight)**
All Switches — OFF · Throttle — OFF / IDLE · Master Switch — ON · Fuel Pump — ON ·
CLEAR PROP — AREA CLEAR · Engine Start — KEY TO START · Idle RPM — 1400–1800 · Radio — ON ·
Strobes — ON · Warm-Up — 160°F / 70°C · Throttle — OFF / IDLE · Engine — OFF · All Switches — OFF

**ppc-chute — "Chute Inspection & Layout" (preflight)**
Chute Condition — GOOD · Layout — FLAT & EVEN · Lines — UNTANGLED · Riser Connections — SECURE ·
Risers on Hooks — PROPERLY SET

**ppc-before-takeoff — "Before Takeoff" (before_takeoff)**
Cameras — RECORDING · Seat Belts — ON & SECURE · Helmet — ON & STRAPPED ·
Passenger Briefing — COMPLETE · Controls — FREE & CORRECT · Wind — ASSESSED ·
Departure Path — CLEAR

**ppc-loc-check — "LOC Check (Before Power)" (before_takeoff)**
L — LINES — CLEAR, UNTANGLED, NO TWISTS · O — OVERHEAD — WING CENTERED DIRECTLY ABOVE ·
C — CELLS — ALL OPEN, FULLY INFLATED, NO COLLAPSES

**ppc-inflight — "In-Flight Checks" (in_flight)**
Coolant Temp — GREEN · Oil Temp — GREEN · Oil Pressure — GREEN · RPM — NORMAL RANGE ·
Fuel Level — CHECK · Wind / Turbulence — NOTE CONDITIONS

**ppc-landing — "Landing" (before_landing)**
Radio — Downwind — ANNOUNCED · Radio — Base — ANNOUNCED · Radio — Final — ANNOUNCED ·
Glide Slope — ESTABLISHED · Flare 25ft AGL — UP TO 1/3 · Touchdown — LANDED

**ppc-shutdown — "Shutdown" (post_flight)**
Taxi Clear — CLEAR OF RUNWAY · Throttle — IDLE · Engine — OFF · Steering Lines — BRING CHUTE DOWN ·
All Switches — OFF

**ppc-packup — "Wing Pack-Up" (post_flight)**
Wing Packed — SECURE · Lines Stowed — SECURE · Aircraft Secured — CONFIRMED

> Note: some challenges themselves contain " — " (for example "L — LINES", "Radio — Downwind").
> When splitting challenge/response for display, split on the **last** " — ".

## Appendix B — Mapping PWA files → native files

| PWA | Native |
|---|---|
| `src/data/models.ts` | `UltraPilotCore/Models/*` |
| `src/data/logic/gps-logic.ts` | `Logic/GeoMath.swift`, `Logic/Wind.swift` |
| `src/data/logic/instrument-logic.ts` | `Logic/Instruments.swift` |
| `src/data/logic/instrument-layouts.ts` | `Logic/PageLayouts.swift` |
| `src/data/logic/session-logic.ts`, `stamp-logic.ts`, `checklist-logic.ts` | `Logic/SessionRules.swift`, `StampRules.swift`, `ChecklistRules.swift` |
| `src/data/logic/metar-logic.ts` | `Logic/Metar.swift` |
| `src/data/logic/airport-logic.ts` | `Logic/Airports.swift` |
| `src/data/logic/route-io.ts`, `src/data/export.ts`, Settings import parsers | `Codecs/*` |
| `src/data/defaults/ppc-checklists.ts` | `Defaults/PPCChecklists.swift` |
| `src/data/db.ts` | `Services/PersistenceService.swift` + `Persistence/*` |
| `src/state/*-store.ts` | `Stores/*Store.swift` |
| `src/ui/hooks/useGPS.ts` | `Services/LocationService.swift` + `Stores/SessionPipeline.swift` |
| `src/ui/pages/map/*` | `UI/Map/*` |
| `src/ui/shell/*` | `UI/Shell/*` |
| `netlify/functions/metar.js` | `Services/WeatherService.swift` (direct calls) |
| `src/data/logic/tilesets-*`, `pmtiles-protocol.ts`, `TilesetsPage.tsx` | **Replaced** by §8.7 (`OfflineMapStore`, `TileDownloadService`, `OfflineTileOverlay`) |
