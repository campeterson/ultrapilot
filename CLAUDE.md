# CLAUDE.md — UltraPilot

## What This Is

UltraPilot is an offline-first PWA cockpit companion for ultralight and PPC pilots. It combines GPS flight tracking, timestamped event logging, checklists, METAR weather, and nearby airport awareness into a single map-centric app.

## Spec Documents

Read these before making changes:

- `docs/ARCHITECTURE_SPEC.md` — **Read first.** Three-layer architecture (Data / State / UI). The golden rule: every file belongs to exactly one layer.
- `docs/01-PROJECT_BRIEF.md` — Vision, target users, scope
- `docs/02-UX_SPEC.md` — Garmin Pilot navigation pattern, all views, session lifecycle
- `docs/03-TECH_ARCH.md` — Stack, file structure, data models, GPS, maps, build order

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

| Width | Map | Panel | Nav Tab Behavior |
|---|---|---|---|
| < 768px (phone) | Full screen OR hidden | Replaces map | Tab takes over entire content area |
| 768–1024px (tablet portrait) | Top ~52% | Bottom ~48% | Tab opens bottom panel; chevron toggles |
| > 1024px (tablet landscape) | Left side | Right 310px | Tab opens right panel; chevron toggles |

**Tapping "Map" always returns to full-screen map with panel collapsed.**

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
