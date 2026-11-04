# Flight Planning (What-If Drift)

A pre-flight "what if" tool. The variables are **where** (up to 5 launch sites) and
**when** (a date and hour, usually tomorrow morning). For each site it fetches a
wind forecast and plots constant-altitude drift tracks on the map.

## Using it

The plan has its own map inside the Flight Plan panel (More → Flight Plan), the
same on phone and tablet. **The main map is for flying only**: it shows no launch
sites or drift tracks.

1. **Launch sites** are places of type *Launch site* (see Places below): a point,
   or an area, which launches from its first corner. Add one by tapping an empty
   spot on the plan map, with *+ Coordinates* / *+ My position*, from the main
   map's tap menu (*Add Place*; on airports the elevation is filled in), or by
   setting any place's type to Launch site. Elevation is optional; leave it blank
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
| Data | `src/data/logic/forecast-logic.ts`, `drift-logic.ts`, `plan-logic.ts`; `LaunchSite` (derived from places) in `models.ts` |
| State | `src/state/flight-plan-store.ts`; launch sites come from `src/state/places-store.ts` |
| UI | `src/ui/pages/plan/*` (`PlanMiniMap.tsx` is the plan map), `src/ui/hooks/useFlightPlan.ts`, `src/ui/pages/map/plan-layers.ts` (map drawing) |

## Places

More → **Places**: user points and areas (like ForeFlight's user waypoints and map
markup). Each has a type:

| Type | Color | Use |
|---|---|---|
| Launch site | orange (points marked "L") | Offered in the Flight Plan. An area launches from its **first corner**. |
| Good landing zone | green | Drift "Ends in" check |
| Caution | yellow, dashed outline | Drift "Ends in" check |
| Do not land | red | Drift "Ends in" check |
| Point of interest | purple | Reference only |

Ratings only affect drift checks when the place is an **area** (a point has no inside).

- **Add**: on the Places map, *+ Add point* then tap; or *Draw area*, tap corners
  (Undo), finish with the first corner or *Done*, name it and pick a type. Tap any
  place on the map, or its name in the list, to edit it (name, type, coordinates
  for points, elevation for launch sites). The list is grouped by type, with a
  type picker on every row.
- **Import** KML, KMZ or GeoJSON: points and areas (lines are skipped). The type comes
  from UltraPilot's own export (`category` property / KML ExtendedData), else names
  and properties ("launch", "LZ", "no landing", "caution"…), else area fill color
  by hue; otherwise areas get the chosen default and points become points of interest.
  Places whose id is already here are skipped, so re-importing an export doesn't
  duplicate. Imported files are listed with a *Delete all* per file.
- **Export** everything as **GeoJSON** (`category`, `elevFt`, `note`, `id` properties,
  plus simplestyle colors) or **KML** (one Style per type, ExtendedData for
  category / elevation / id). Both round-trip exactly.
- Places show on the plan map and the Places map, and on the flying map unless
  turned off; a flying-map tap inside a rated area shows its name and rating.

Storage: one `places` IndexedDB store (DB v7). Upgrading from v6 converts the
old `launchSites` and `zones` stores into places with the same ids, so flight-plan
selections and stored forecasts carry over.

Files: `src/data/place-io.ts` (import/export), `src/data/logic/place-logic.ts`
(categories, launch-site/zone views), `src/data/logic/zone-logic.ts`,
`src/state/places-store.ts`, `src/ui/pages/places/*`, `src/ui/pages/map/place-layers.ts`,
`usePlaceLayers.ts`.

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
