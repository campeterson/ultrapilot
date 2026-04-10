# UltraPilot — Technical Architecture

This document covers UltraPilot-specific implementation details. It **supplements** `ARCHITECTURE_SPEC.md`, which defines the three-layer architecture (Data / State / UI) that governs all code organization. Read that document first.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Type safety, portable models, clean interfaces |
| Framework | React | Component model, hooks, ecosystem |
| Build | Vite | Fast dev server, ESM-native, simple config |
| State | Zustand | Minimal boilerplate, one store per domain |
| Storage | IndexedDB via `idb` library | Typed async access, structured data |
| Maps | Leaflet.js | Lightweight, offline-tile-capable, free |
| GPS | Geolocation API (watchPosition) | Standard browser API |
| PWA | vite-plugin-pwa (Workbox) | Service worker generation, precaching |
| Export | Client-side GPX/JSON generation | No server required |

---

## File Structure

Follows the three-layer architecture from `ARCHITECTURE_SPEC.md`:

```
ultrapilot/
├── index.html
├── vite.config.ts
├── manifest.json
├── public/
│   ├── icons/                    # PWA icons
│   └── data/
│       └── airports.json         # Embedded US airport database (~3,500 entries)
├── src/
│   ├── data/                     # LAYER 1: Portable core (no React imports)
│   │   ├── models.ts             # TypeScript interfaces: Session, TrackPoint, StampEvent, Checklist, Airport
│   │   ├── db.ts                 # IndexedDB connection + typed CRUD functions
│   │   ├── export.ts             # GPX and JSON string generators
│   │   ├── import.ts             # GPX/JSON parsers → typed model objects
│   │   └── logic/
│   │       ├── gps-logic.ts      # Haversine, bearing, AGL computation, VS smoothing
│   │       ├── instrument-logic.ts  # Derived instrument values from raw position
│   │       ├── session-logic.ts  # Session lifecycle rules, duration calcs
│   │       ├── stamp-logic.ts    # Event type rules, auto-stamp triggers, PPC cycle detection
│   │       ├── checklist-logic.ts   # Completion state machine, progress calculations
│   │       ├── metar-logic.ts    # METAR string parsing, flight category derivation
│   │       └── airport-logic.ts  # Nearby search, distance sort from coordinates
│   ├── state/                    # LAYER 2: Zustand stores (thinnest possible glue)
│   │   ├── session-store.ts      # Active session state, start/end lifecycle
│   │   ├── gps-store.ts          # Current position, tracking status, track point buffer
│   │   ├── instrument-store.ts   # Computed instrument values, strip configuration
│   │   ├── timeline-store.ts     # Event log, stamp creation
│   │   ├── checklist-store.ts    # Checklist CRUD, runner state
│   │   ├── weather-store.ts      # METAR data, fetch status, staleness
│   │   └── airport-store.ts      # Nearby airport list, selected airport
│   ├── ui/                       # LAYER 3: React components (only layer with JSX)
│   │   ├── shell/
│   │   │   ├── AppShell.tsx      # Top-level layout: strip + content + nav
│   │   │   ├── InstrumentStrip.tsx
│   │   │   ├── NavBar.tsx        # Fixed footer with tabs + More picker
│   │   │   ├── MorePicker.tsx
│   │   │   └── PanelLayout.tsx   # Responsive map/panel split logic
│   │   ├── pages/
│   │   │   ├── map/
│   │   │   │   ├── MapPage.tsx   # Leaflet map container
│   │   │   │   ├── MapControls.tsx  # Floating buttons: layers, position, STAMP
│   │   │   │   ├── TrackLayer.tsx   # Polyline rendering
│   │   │   │   └── PositionMarker.tsx
│   │   │   ├── timeline/
│   │   │   │   ├── TimelinePage.tsx
│   │   │   │   ├── SummaryCards.tsx
│   │   │   │   └── EventList.tsx
│   │   │   ├── checklists/
│   │   │   │   ├── ChecklistsPage.tsx
│   │   │   │   ├── ChecklistList.tsx
│   │   │   │   └── ChecklistRunner.tsx
│   │   │   ├── weather/
│   │   │   │   ├── WxPage.tsx
│   │   │   │   ├── MetarCard.tsx
│   │   │   │   └── NearbyAirports.tsx
│   │   │   └── instruments/
│   │   │       └── InstrumentsPage.tsx  # Full-panel instrument display
│   │   ├── components/           # Shared UI: buttons, modals, cards
│   │   └── hooks/
│   │       ├── useGPS.ts         # watchPosition lifecycle hook
│   │       ├── useWakeLock.ts    # Screen wake lock during tracking
│   │       ├── useTimer.ts       # Elapsed time hook
│   │       └── useResponsiveLayout.ts  # Breakpoint detection for panel behavior
│   └── main.tsx                  # App entry point
├── docs/
│   ├── ARCHITECTURE_SPEC.md      # Three-layer architecture rules
│   ├── 01-PROJECT_BRIEF.md
│   ├── 02-UX_SPEC.md
│   └── 03-TECH_ARCH.md           # This file
└── CLAUDE.md
```

---

## Design Tokens (`src/ui/theme.ts`)

```ts
export const theme = {
  colors: {
    red: '#C0392B',
    redDim: 'rgba(192, 57, 43, 0.15)',
    cream: '#FDF6E3',
    dark: '#141418',
    darkCard: '#1e1e24',
    darkBorder: 'rgba(255, 255, 255, 0.07)',
    dim: '#667',
    light: '#ccd',
    green: '#27ae60',
    amber: '#e67e22',
    blue: '#3498db',
    navBg: '#0c0c12',
    stripBg: 'rgba(16, 16, 22, 0.94)',
  },
  font: {
    primary: '"B612", monospace',
    mono: '"B612 Mono", monospace',
  },
  size: {
    instrumentValue: '20px',
    instrumentLabel: '9px',
    heroValue: '36px',
    body: '13px',
    small: '11px',
    tiny: '9px',
  },
  tapTarget: '44px',
} as const
```

### Font Loading

B612 loaded in `index.html`. Vite's PWA plugin caches the font files.

```html
<link href="https://fonts.googleapis.com/css2?family=B612:wght@400;700&family=B612+Mono&display=swap" rel="stylesheet">
```

---

## Responsive Breakpoints

```ts
// src/ui/hooks/useResponsiveLayout.ts
export type LayoutMode = 'phone' | 'tablet-portrait' | 'tablet-landscape'

export function useResponsiveLayout(): LayoutMode {
  // < 768px → phone
  // 768–1024px → tablet-portrait
  // > 1024px → tablet-landscape
}
```

CSS breakpoints mirror these thresholds. See `02-UX_SPEC.md` for behavior at each breakpoint.

---

## Data Layer Details

### IndexedDB Schema (`src/data/db.ts`)

Database name: `ultrapilot`

**Store: `sessions`**
```ts
interface Session {
  id: string              // ISO timestamp
  startTime: string       // ISO
  endTime: string | null  // ISO
  originLat: number
  originLon: number
  originAltMSL: number
  maxAGL: number
  totalDistance: number    // nm
  deviceInfo: string
}
```

**Store: `trackPoints`** (indexed by `sessionId`)
```ts
interface TrackPoint {
  sessionId: string
  ts: number              // unix ms
  lat: number
  lon: number
  altMSL: number
  speed: number           // m/s
  heading: number         // degrees
  accuracy: number        // meters
}
```

**Store: `events`** (indexed by `sessionId`)
```ts
interface StampEvent {
  sessionId: string
  ts: number              // unix ms
  type: StampEventType    // union of known event types
  lat: number
  lon: number
  altMSL: number
  altAGL: number
  speed: number
  note: string | null
}

type StampEventType =
  | 'session_start' | 'session_end'
  | 'takeoff' | 'landing'
  | 'engine_start' | 'engine_shutdown'
  | 'checklist_complete' | 'wing_layout'
  | 'custom'
```

**Store: `checklists`**
```ts
interface Checklist {
  id: string              // uuid
  name: string
  items: ChecklistItem[]
  category: ChecklistCategory
  createdAt: string       // ISO
  updatedAt: string       // ISO
}

interface ChecklistItem {
  id: string
  text: string
  order: number
}

type ChecklistCategory =
  | 'preflight' | 'before_takeoff' | 'in_flight'
  | 'before_landing' | 'post_flight' | 'custom'
```

### localStorage Keys

| Key | Type | Purpose |
|---|---|---|
| `ultrapilot_instrumentConfig` | `{ top: string[], bottom: string[] }` | Instrument strip widget selection |
| `ultrapilot_lastSession` | `string` | Session ID to resume on app open |
| `ultrapilot_preferences` | `object` | General preferences |
| `ultrapilot_mapState` | `{ center, zoom, layers }` | Restore map position |

---

## GPS Logic (`src/data/logic/gps-logic.ts`)

Pure functions — no side effects, no browser APIs.

```ts
/** AGL = current MSL minus origin MSL */
export function computeAGL(currentMSL: number, originMSL: number): number

/** Haversine distance in nautical miles */
export function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number

/** Forward azimuth (bearing) in degrees */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number

/** Vertical speed from 3-point smoothing window, returns ft/min */
export function verticalSpeed(points: { altMSL: number, ts: number }[]): number

/** Convert m/s to knots */
export function msToKnots(ms: number): number
```

### GPS Hook (`src/ui/hooks/useGPS.ts`)

React hook that wraps `navigator.geolocation.watchPosition`:

- Calls `gps-logic.ts` functions for computations
- Pushes results into `gps-store` and `instrument-store`
- Appends track points to `session-store` buffer
- Periodically flushes buffer to IndexedDB via `db.ts`

```ts
watchPosition options: {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000,
}
```

---

## Map Implementation

### Leaflet Setup

```ts
// src/ui/pages/map/MapPage.tsx
import L from 'leaflet'

const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true,
})

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map)
```

### Map Layers (future)

| Layer | Source | Status |
|---|---|---|
| Street map | OpenStreetMap | v1 default |
| Satellite | Mapbox / ESRI | Nice-to-have |
| Aviation charts | FAA sectionals | Nice-to-have |
| Offline tiles | Pre-cached packages | Premium tier |

### Map Elements

- **Position**: `L.circleMarker`, red fill, white border, CSS pulse
- **Track**: `L.polyline`, red dashed stroke, downsampled from track points
- **Origin**: `L.circleMarker`, hollow stroke, "ORIGIN" tooltip
- **Events**: Small colored dots at event positions

---

## Service Worker & Offline

### vite-plugin-pwa Configuration

```ts
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org/,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 500 } },
          },
          {
            urlPattern: /^https:\/\/aviationweather\.gov\/api/,
            handler: 'NetworkFirst',
            options: { cacheName: 'metar-cache', expiration: { maxAgeSeconds: 3600 } },
          },
        ],
      },
    }),
  ],
}
```

### Offline Behavior

| Feature | Online | Offline |
|---|---|---|
| GPS tracking | Full | Full |
| Instruments | Full | Full |
| Timeline & stamps | Full | Full |
| Checklists | Full | Full |
| Map tiles | Live | Cached tiles only |
| METAR | Live | Last-fetched with staleness indicator |
| Nearby airports | Full (embedded) | Full (embedded) |
| Export | Full | Full |

---

## METAR Integration

### API

```
GET https://aviationweather.gov/api/data/metar?ids=KJEF&format=json
```

Free, no API key. Fetched in `weather-store.ts`, parsed in `metar-logic.ts`.

### Flight Category Derivation (`src/data/logic/metar-logic.ts`)

Pure function: raw METAR string → `{ wind, visibility, ceiling, temp, dewpoint, altimeter, category }`.

Categories: VFR (> 3000' ceiling, > 5 SM vis), MVFR, IFR, LIFR.

---

## Airport Database

Embedded JSON in `public/data/airports.json`. ~3,500 US public airports from FAA NASR data (public domain). ~300KB compressed.

```ts
interface Airport {
  id: string        // "KJEF"
  name: string
  lat: number
  lon: number
  elev: number      // ft MSL
  runways: { id: string, length: number }[]
}
```

Nearby search uses the same `haversineNM` from `gps-logic.ts`. Sorted by distance, top 20 displayed.

---

## Export (`src/data/export.ts`)

### GPX

Track points as `<trkseg>`, stamped events as `<wpt>`. Standard GPX 1.1 schema.

### JSON

Full session data model. Lossless format for backup/import into other Aviator's Toolkit apps.

### UX

Download via `URL.createObjectURL` + programmatic click. No server.

---

## Performance Targets

| Metric | Target |
|---|---|
| First paint | < 1.5s |
| Interactive | < 3s |
| GPS → instrument display | < 100ms |
| IndexedDB write (track point) | < 10ms |
| STAMP → timeline display | < 50ms |
| Airport database load | < 200ms |

---

## Build Order

### Phase 1: Core Flight Tracking

1. Vite + React + TypeScript project scaffold
2. Data layer: models, db.ts, gps-logic.ts
3. State layer: session-store, gps-store, instrument-store
4. UI: AppShell, InstrumentStrip, NavBar, responsive PanelLayout
5. UI: MapPage with Leaflet (position dot, track trail, origin marker)
6. useGPS hook wiring position → stores → instruments → map
7. Session start/end lifecycle
8. GPX export

### Phase 2: Timeline & Stamps

9. Data: stamp-logic.ts, StampEvent model
10. State: timeline-store
11. UI: TimelinePage, SummaryCards, EventList
12. UI: STAMP button + event picker modal
13. Auto-stamping (session start/end, checklist completion)

### Phase 3: Checklists

14. Data: checklist models, checklist-logic.ts, db CRUD
15. State: checklist-store
16. UI: ChecklistsPage, ChecklistList, ChecklistRunner
17. Import/export checklists (JSON, base64 share links)
18. PPC default templates

### Phase 4: Weather & Airports

19. Data: metar-logic.ts, airport-logic.ts
20. State: weather-store, airport-store
21. UI: WxPage, MetarCard, NearbyAirports

### Phase 5: Polish

22. Instrument configurator UI
23. InstrumentsPage (full-panel via More picker)
24. PWA manifest, service worker, offline verification
25. Settings page
26. Session history (past sessions list, view track on map)

### Deferred (Nice-to-Have)

- Distance rings on map
- Extended courseline (30s projection)
- Satellite basemap
- Aviation chart layers

### Deferred (Premium / Native)

- Offline maps
- Flight planning
- LiveTrack
- GDL-90 ADS-B in (requires native for hardware access)
