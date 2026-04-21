# UltraPilot — Map Conventions Spec

---

## Section 1: Map Orientation & Track Up

### Library

Use **MapLibre GL JS**. It is the only open-source JS mapping library with first-class support
for both continuous map rotation and PMTiles. Leaflet has no native rotation and no PMTiles
path. OpenLayers supports both but with less polish on each.

MapLibre renders on a WebGL canvas. Bearing changes are GPU-accelerated and cost nothing extra
per frame. Symbol layers support `keep-upright` so text labels stay readable regardless of map
bearing — essential for a cockpit display.

### Orientation Modes

**North Up**
- Map is fixed with north at the top.
- Matches paper sectional orientation. Good for preflight planning, route review, and airspace
  browsing where the pilot is cross-referencing a chart.

**Track Up** (default in-flight)
- Map rotates continuously so the aircraft's current GPS track points toward the top of the
  display.
- Eliminates the mental rotation step at the moments when cognitive load is highest.
- Preferred for PPC/ultralight: immediate correlation between what the map shows and what is
  visible ahead of the aircraft.
- Default on app load.

### Toggle Control

Persistent button in the map UI. Icon switches between a compass rose (north up) and a
directional arrow (track up). State persists to localStorage.

### API

```ts
// Update bearing from GPS track (degrees true, 0–360)
map.setBearing(trackDegrees);

// Animated rotation — use for mode toggle, not for live GPS updates
map.rotateTo(trackDegrees, { duration: 300 });
```

Call `map.setBearing()` directly on each GPS position update — no animation, no duration.
Reserve `rotateTo()` for the mode toggle button only.

---

## Section 2: Map Colors

Follows the industry-standard convention established by Garmin and ForeFlight. Any pilot
familiar with a glass cockpit or modern EFB should find these colors immediately readable
without explanation.

### Color Table

| Element | Color | Hex | Opacity |
|---|---|---|---|
| Active route / course line | Magenta | `#E040FB` | 100% |
| Extended courseline projection (30s) | Magenta | `#E040FB` | 50% |
| Flight track (bread crumb trail) | Green | `#00E676` | 100% |
| Active waypoint / destination | Magenta | `#E040FB` | 100% |
| Non-active waypoints | White | `#FFFFFF` | 60% |
| Traffic (ADS-B, future) | Amber | `#FFD600` | 100% |

### Rationale

**Magenta for active navigation** is the universal convention since the original FMS CDU and
glass cockpit HSI displays (Garmin, Honeywell, Rockwell Collins all used it). ForeFlight,
Garmin Pilot, and every panel-mount GPS follow this. "Following the magenta line" is pilot
shorthand for GPS navigation. Do not deviate from this color.

Magenta reads without ambiguity against blue (water), green (terrain), and grey (urban
areas) — the three dominant basemap colors.

**Green for past track** is equally universal across ForeFlight, Garmin Pilot, and panel GPS.
Using any other color for the bread crumb trail will read as wrong to experienced pilots.

**Amber/yellow is reserved for caution-level overlays** — traffic, active TFRs, airspace
alerts. Do not use it for decorative or neutral UI elements on the map.

### Light vs Dark Basemap

On satellite or dark basemaps all colors above are readable as-is. On light basemaps
(OpenStreetMap-style), add a 1px dark stroke (`#000000` at 40% opacity) to magenta and
green lines to maintain contrast over light tile backgrounds.

---

## Section 3: Offline Maps & PMTiles Serving

### PMTiles Support

MapLibre supports PMTiles natively via the `pmtiles` npm package from Protomaps. Register a
protocol handler at init and MapLibre treats PMTiles sources identically to any other tile
source:

```ts
import { Protocol } from 'pmtiles';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

map.addSource('basemap', {
  type: 'vector',
  url: 'pmtiles://https://maps.aviatortoolkit.com/region.pmtiles'
});
```

For offline playback, swap the URL to a local OPFS or IndexedDB reference using a custom
fetch handler. The rest of the map code is unchanged.

### Netlify Limitations

Netlify has a 100MB per-file deploy limit. Useful regional PMTiles basemaps run 100–500MB;
national files are several gigabytes. Direct static deploy only works for small local files.
Do not attempt to serve production map data as a Netlify static asset.

### Recommended Architecture

| Tier | Source |
|---|---|
| Online basemap (free tier) | Cloudflare R2 — zero egress fees, native range request support |
| Offline map download (premium) | User downloads from R2, stored in OPFS |
| Local playback after download | PMTiles read from OPFS via custom protocol handler, no network |

Netlify serves the app shell, service worker, and PWA assets only. All map data lives in
Cloudflare R2. R2 free tier covers early traffic comfortably (10GB storage, 10M reads/month).

PMTiles requires `Accept-Ranges: bytes` support from the host. R2 provides this natively.
Netlify's CDN also supports range requests for static assets, so small test files can be
deployed directly during development.
