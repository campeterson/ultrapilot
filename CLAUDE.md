# CLAUDE.md — UltraPilot

## What This Is

UltraPilot is an offline-first PWA cockpit companion for ultralight and PPC pilots. It combines GPS flight tracking, timestamped event logging, checklists, METAR weather, and nearby airport awareness into a single map-centric app.

## Spec Documents

Read these before making changes:

- `docs/ARCHITECTURE_SPEC.md` — **Read first.** Three-layer architecture (Data / State / UI). The golden rule: every file belongs to exactly one layer.
- `docs/01-PROJECT_BRIEF.md` — Vision, target users, scope
- `docs/02-UX_SPEC.md` — Garmin Pilot navigation pattern, all views, session lifecycle
- `docs/03-TECH_ARCH.md` — Stack, file structure, data models, GPS, maps, build order
- `docs/08-FLIGHT_PLANNING.md` — Flight plan (what-if winds, drift tracks), Places (launch sites, landing zones, POIs; KML/GeoJSON import/export), satellite imagery
- `docs/09-LIVE_GROUP.md` — Live Group: real-time group location sharing (relay, callsigns, invites)
- `docs/10-TRAFFIC.md` — ADS-B traffic: `/api/traffic` proxy, when it's fetched (session / switch / group), own-target filtering

## Architecture Rules (Summary)

The full rules are in `ARCHITECTURE_SPEC.md`. The short version:

| Layer | Location | Contains | Never Contains |
|---|---|---|---|
| Data | `src/data/` | Models, pure logic, DB functions, export/import | React imports, hooks, JSX, side effects |
| State | `src/state/` | Zustand stores calling data layer | JSX, rendering logic, direct DOM access |
| UI | `src/ui/` | React components, hooks, JSX | Business logic, direct IndexedDB calls |

**If you're writing code in `src/data/` and feel the need to import from React, stop. Move the React-dependent part to `src/ui/` or `src/state/`.**

## Stack

React + TypeScript + Vite + Zustand + `idb` library + Leaflet.js. PWA via `vite-plugin-pwa`.

## Design System

- **Font:** B612 (Google Fonts, cached by service worker)
- **Primary accent:** `#C0392B` (red)
- **Data values:** `#FDF6E3` (cream) on dark background
- **Background:** `#141418` (dark)
- **Cards:** `#1e1e24`
- **Dim text:** `#667`
- **Minimum tap target:** 44 × 44 px on all interactive elements
- **All tokens** in `src/ui/theme.ts` — no hardcoded colors or font names in components

## Responsive Behavior (Garmin Pilot Pattern)

Every section (every tab except Map) shows either **split** with the map or **full screen**:

| Device | Split | Full screen | Switching |
|---|---|---|---|
| Phone | — (no split) | Section replaces the map | Always full screen; no title bar |
| Tablet portrait | Map top 50%, section bottom 50% | Section covers the map | Title bar: ⤢ Full / ◧ Split, ✕ back to map |
| Tablet landscape | Map left 50%, section right 50% | Section covers the map | Title bar: ⤢ Full / ◧ Split, ✕ back to map |

The split/full choice is one remembered preference (`src/state/panel-store.ts`), so the next
section opens the same way. The map stays mounted under a full-screen section.

The **instrument ribbon belongs to the flying map**: it shows only while the map is on screen
(Map tab, or a tablet split — in a landscape split it spans the map column only) and is hidden
behind any full-screen section, which then uses that space. Inside a tablet section the title
bar names it, so pages hide their own heading (`useHasPanelTitleBar()`).

**Tapping "Map" (or ✕) always returns to full-screen map with the section closed.**

## Domain Knowledge

- **PPC ≠ PPG.** Powered Parachute pilots sit in a cart with free hands and use foot steering. This app is PPC-first.
- **Two engine cycles per flight:** warmup (start → shutdown) then flight (start → takeoff → landing → shutdown).
- **"Kiting" is a mental briefing, not a checklist.** Don't make it tappable.
- **AGL = current MSL minus origin MSL.** Not terrain-aware.
- **Session = a day at the field.** May contain multiple flights.

## Code Review Checklist

When reviewing AI-generated code, check:

1. Does any file in `src/data/` import from React? → **Reject**
2. Does any component call an IndexedDB function directly? → **Move to store**
3. Does any component contain business logic beyond simple display conditionals? → **Move to `src/data/logic/`**
4. Are there hardcoded colors or font names? → **Use theme tokens**
5. Are all interactive elements at least 44 × 44 px? → **Fix**
6. Does the file belong to exactly one layer? → **Split if it spans two**

## Testing

- Test on phone (iOS Safari, Chrome Android) AND tablet (iPad Safari)
- Test with GPS enabled and disabled (app should degrade gracefully)
- Test offline: load app, kill network, verify all non-weather features work
- Verify 44px tap targets with browser dev tools touch emulation

## Starting a New Module

> "Build the [module name] module following the three-layer architecture in ARCHITECTURE_SPEC.md. Start with the data layer (models + logic + db functions), then the Zustand store, then the UI components. No business logic in components. No React imports in the data layer."
