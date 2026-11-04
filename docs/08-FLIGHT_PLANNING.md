# Flight Planning (What-If Drift)

A pre-flight "what if" tool. The variables are **where** (up to 3 launch sites) and
**when** (a date and hour, usually tomorrow morning). For each site it fetches a
wind forecast and plots constant-altitude drift tracks on the map.

## Using it

1. **Launch sites**: tap the map → *Add Launch Site*. It also works on airports and
   waypoints; for an airport, its elevation is filled in. Or go More → Flight Plan →
   *+ Coordinates* / *+ My position*. Elevation is optional; leave it blank to use the
   forecast model's terrain height.
2. **Choose sites**: tap a site in the list or on the map (a numbered red dot means
   chosen). Max 3.
3. **Date / time / model / altitudes / drift duration**, then *Get forecast*.
4. **Scrub** the hour: one hour before the plan time, the plan hour, and two hours
   after, all on the hour. Available in the panel and in the bar over the map.

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

Models: Best match, HRRR (`ncep_hrrr_conus`), GFS, ECMWF IFS, ICON, GEM.
HRRR covers only the US and about 18 h ahead (48 h on 00/06/12/18z runs). If a
model doesn't reach the plan time it returns no data, and the site shows "—".

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
| UI | `src/ui/pages/plan/*`, `src/ui/hooks/useFlightPlan.ts`, `src/ui/pages/map/usePlanMapLayers.ts` |
