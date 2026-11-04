# Flight Planning (What-If Drift)

A pre-flight "what if" tool. The variables are **where** (up to 5 launch sites) and
**when** (a date and hour, usually tomorrow morning). For each site it fetches a
wind forecast and plots constant-altitude drift tracks on the map.

## Using it

The plan has its own map inside the Flight Plan panel (More → Flight Plan), the
same on phone and tablet. **The main map is for flying only**: it shows no launch
sites or drift tracks.

1. **Launch sites**: tap an empty spot on the plan map, or *+ Coordinates* /
   *+ My position*. From the main map, the tap menu's *Add Launch Site* also works
   (on airports the elevation is filled in). Elevation is optional; leave it blank
   to use the forecast model's terrain height.
2. **Choose sites**: tap a site on the plan map or in the list. A chosen site is a
   numbered dot in its site color. Max 5.
3. **Date / time / model / altitudes**, then *Get forecast*.
4. **Plan map + drift options** (modelled on isitwindy's Drift Track card):
   - All chosen sites and their tracks on one map. It re-frames when the sites,
     forecast, or drawn tracks change, and holds still while you scrub hours.
     With no site chosen it frames every saved site.
   - **Scrub** the hour: one hour before the plan time, the plan hour, and two
     hours after, all on the hour.
   - **Cruise alt**, **Duration** (30–120 min), and **Compare altitudes**. On:
     every altitude is drawn, colored by altitude. Off: only the cruise altitude,
     one track per site colored by site, so several sites compare cleanly.
5. **Per-site card**: track length (along the path), crow line, bearing with a
   compass point, and cruise altitude, then wind and drift at every altitude.

## Altitudes

- **AGL each site** (default 250 / 500 / 1000 / 1500 ft): each site's own ground plus AGL.
- **Common MSL**: one altitude set flown from every site, so sites compare at the
  same level. Defaults to the highest chosen site's ground plus the AGL ladder,
  rounded up to 100 ft. It's editable; *Auto* resets it.

## Forecast

Open-Meteo `/v1/forecast`, one request for all sites (comma-separated coordinates).
Same approach as low-and-slow-wx's `windProfile.js`: winds at 10/80/120/180 m
(AGL) plus pressure-level winds with geopotential height (MSL), merged onto one
MSL axis. Winds are interpolated by u/v components in height and linearly in time.

Models (same set isitwindy offers): Best match, HRRR, GFS, ECMWF IFS, ICON,
ICON-EU, ICON-D2, GEM, GEM HRDPS, AROME, ARPEGE, MET Norway. Each has a forecast
horizon; the panel warns before fetching when the plan time is past it, and a site
card says so when the model returned no data.

The last fetched forecast is kept in localStorage, so the plan still works offline
at the field.

## Drift track

Holding one altitude with no airspeed of your own (a balloon, or a PPC at idle).
The track is stepped minute by minute using the wind at each step's midpoint time,
so a wind that changes through the hour bends the path. There's a dot every 15
minutes, and the label at the end is the altitude.

## Files

| Layer | File |
|---|---|
| Data | `src/data/logic/forecast-logic.ts`, `drift-logic.ts`, `plan-logic.ts`; `LaunchSite` etc. in `models.ts`; `launchSites` store in `db.ts` (DB v5) |
| State | `src/state/launch-site-store.ts`, `src/state/flight-plan-store.ts` |
| UI | `src/ui/pages/plan/*` (`PlanMiniMap.tsx` is the plan map), `src/ui/hooks/useFlightPlan.ts`, `src/ui/pages/map/plan-layers.ts` (map drawing) |

## Zones

More → **Zones**: draw areas on the zone map, or import KML, KMZ or GeoJSON, and rate each one:

| Rating | Color | Meaning |
|---|---|---|
| Good | green | Good landing zone |
| Caution | yellow (dashed outline) | Land with care |
| No land | red | Warning / do not land |

- **Draw**: *Draw a zone*, tap each corner on the zone map (Undo removes the
  last), then tap the first corner or *Done* (3+ corners). Name it, pick a rating,
  *Save zone*. Drawn zones are grouped under "Drawn on map".
- Only areas (Polygon / MultiPolygon, holes respected) become zones; points and
  lines are counted and skipped. One file can hold many areas; each is its own
  zone, grouped under the file name (delete one, or the whole file).
- On import each area's rating is guessed: words in its name/properties first
  ("LZ", "no landing", "caution", a `rating` property…), then its fill/line
  color by hue (KML `PolyStyle`, also through `StyleMap`; GeoJSON `fill`,
  `stroke`…). Anything else gets the "Unrated areas become" choice. Tap a rating
  to change it; tap a name to rename.
- Zones always show on the Flight Plan map. On the flying map they're on by
  default (toggle on the Zones page) and drawn beneath tracks and markers; a map
  tap inside a zone shows its name and rating.
- Flight plan: each drift's end point is checked against the zones. The site card
  shows **Ends in** for the cruise altitude, and a colored ■ on any altitude row
  whose drift ends in a zone. Overlapping zones report the most restrictive one.

Files: `src/data/zone-import.ts`, `src/data/logic/zone-logic.ts`, `zones` store in
`db.ts` (DB v6), `src/state/zone-store.ts`, `src/ui/pages/zones/*`,
`src/ui/pages/map/zone-layers.ts`, `useZoneLayers.ts` (zone map + drawing: `ZonesMap.tsx`, `DrawZonePanel.tsx`).

## Satellite imagery

Every map (flying, plan, zones) has a 🛰 button that switches it between the
street map and satellite. The choice is remembered per map. Imagery is a raster
layer above the street basemap and beneath all app layers (zones, tracks,
markers), so nothing else changes.

Provider (Settings → Satellite imagery):

| Provider | Coverage | Key | Notes |
|---|---|---|---|
| USGS (default) | US only | none | NAIP aerial orthoimagery, ~z16. Credit: "USDA, USGS The National Map: Orthoimagery" |
| Esri World Imagery | worldwide | free ArcGIS developer API key | `ibasemaps-api.arcgis.com`, keyed per Esri's Location Platform terms |
| MapTiler Satellite | worldwide | free MapTiler key | TileJSON `satellite-v2` |

Keys are stored only on the device. Viewed tiles are cached by the service worker
(`ultrapilot-satellite-v1`, 6000 tiles / 60 days).

### Download for offline (Settings → Satellite imagery)

For flying with no connection (e.g. a Wi-Fi-only iPad):

1. On Wi-Fi, choose launch sites in the Flight Plan (or it uses every saved site).
2. Pick a radius (3 / 5 / 10 nm) — the tile count and size estimate update.
3. **Download imagery**: zooms 9–16 around each site go into the same cache the map
   reads, so the map uses them offline. Already-saved tiles are skipped; failed
   tiles are counted — run again to retry. Persistent storage is requested so the
   browser doesn't evict them under storage pressure.
4. **Check saved** reports per site how many tiles are on the device (aim for 100%).

Downloaded tiles aren't subject to the 6000-tile / 60-day runtime limit. *Clear
saved imagery* removes them all. On iOS, use the app from the Home Screen: Safari
tabs can lose saved data after 7 days without a visit. Open the app once while
online and relaunch it before going offline, so the service worker is in control.

Files: `src/data/logic/tile-logic.ts`, `src/data/satellite-cache.ts`,
`src/state/offline-imagery-store.ts`, `src/ui/pages/settings/OfflineImagery.tsx`.

Files: `src/data/logic/basemap-logic.ts`, `src/state/basemap-store.ts`,
`src/ui/pages/map/useSatelliteLayer.ts`, `BasemapToggle.tsx`,
`src/ui/pages/settings/SatelliteSettings.tsx`.
