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
4. **Drift track** section (modelled on isitwindy's Drift Track card):
   - On a phone, a map inside the panel shows all chosen sites and their tracks
     together; it re-frames when sites, forecast, or the drawn tracks change. On a
     tablet the main map beside the panel does this.
   - **Scrub** the hour: one hour before the plan time, the plan hour, and two hours
     after, all on the hour. Also in the bar floating over the main map.
   - **Cruise alt**, **Duration** (30–120 min), and **Compare altitudes**. On:
     every altitude is drawn, colored by altitude. Off: only the cruise altitude,
     one track per site colored by site, so three sites compare cleanly.
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
| UI | `src/ui/pages/plan/*`, `src/ui/hooks/useFlightPlan.ts`, `src/ui/pages/map/plan-layers.ts` (shared drawing), `usePlanMapLayers.ts` |
