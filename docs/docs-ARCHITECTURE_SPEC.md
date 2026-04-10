# Aviator's Toolkit — Unified App Architecture Spec

## Purpose of This Document

This spec is a standing prompt for AI-assisted development sessions. Include it when building any module of the unified Aviator's Toolkit app. Its goal is to enforce a clean separation between portable logic and framework-specific UI, so the data layer can be reused when porting to Flutter or React Native.

---

## Golden Rule

**Every file belongs to exactly one of three layers: Data, State, or UI. No file spans two layers.**

---

## Layer 1: Data Layer (`src/data/`)

This is the portable core. It must contain **zero React imports** — no hooks, no components, no JSX. Everything here is plain TypeScript (`.ts` files only).

### `src/data/db.ts`
- Single IndexedDB connection using the `idb` library
- All object store definitions in one place
- Export typed CRUD functions per entity: `getAircraft(id)`, `putFlightEntry(entry)`, `listChecklistBinders()`, etc.
- Every function is `async` and returns plain objects — never reactive state

### `src/data/models.ts`
- TypeScript interfaces for every entity: `Aircraft`, `FlightEntry`, `ChecklistBinder`, `ChecklistItem`, `MaintenanceRecord`, `StampEvent`, etc.
- These types are the contract between all layers
- Include validation functions here: `isValidFlightEntry(entry): boolean`

### `src/data/logic/`
- Pure functions for business logic, one file per domain:
  - `checklist-logic.ts` — state machine transitions, completion calculations
  - `flight-logic.ts` — duration calculations, Hobbs derivation, export formatting
  - `maintenance-logic.ts` — compliance checks, interval calculations
  - `stamp-logic.ts` — cycle detection, derived stamp state from counts
- No side effects. Input → output. Testable without any framework.

### `src/data/export.ts`
- GPX, JSON, CSV, and text export formatters
- Takes plain objects, returns strings
- No DOM access — just string generation

### `src/data/import.ts`
- Parsers for imported files (GPX, JSON, OADS format)
- Returns typed model objects or validation errors

### Rule check
> If you are writing code in `src/data/` and feel the need to import from React, stop. You are in the wrong layer. Move the React-dependent part to `src/ui/` or `src/state/`.

---

## Layer 2: State Layer (`src/state/`)

Zustand stores that bridge the data layer and the UI. This is the **thinnest possible** glue — stores call data layer functions and expose reactive state to components.

### Pattern: One store per domain

```ts
// src/state/aircraft-store.ts
import { create } from 'zustand'
import { listAircraft, putAircraft, deleteAircraft } from '../data/db'
import type { Aircraft } from '../data/models'

interface AircraftStore {
  aircraft: Aircraft[]
  loading: boolean
  load: () => Promise<void>
  save: (a: Aircraft) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useAircraftStore = create<AircraftStore>((set) => ({
  aircraft: [],
  loading: true,
  load: async () => {
    const aircraft = await listAircraft()
    set({ aircraft, loading: false })
  },
  save: async (a) => {
    await putAircraft(a)
    const aircraft = await listAircraft()
    set({ aircraft })
  },
  remove: async (id) => {
    await deleteAircraft(id)
    const aircraft = await listAircraft()
    set({ aircraft })
  },
}))
```

### Rules
- Stores import from `src/data/` only — never from `src/ui/`
- Stores contain no rendering logic, no JSX
- Stores are the **only** place that calls IndexedDB functions
- Keep stores flat. If two stores need to coordinate, create a third store that composes them — don't create circular imports.

---

## Layer 3: UI Layer (`src/ui/`)

React components. This is the **only** layer that contains JSX and React hooks.

### Structure

```
src/ui/
  shell/           # App shell: nav, sidebar, top bar
  pages/           # One folder per major module (route)
    flights/
    checklists/
    aircraft/
    maintenance/
    logbook/
    instruments/   # UltraPilot GPS instruments
  components/      # Shared UI components (buttons, modals, cards, lists)
  hooks/           # React-specific hooks (useGPS, useWakeLock, useTimer)
```

### Rules
- Components get data from Zustand stores via hooks: `const { aircraft } = useAircraftStore()`
- Components call store actions, never data layer functions directly
- Components contain **no business logic** — if you're writing an `if` chain that determines checklist state, that belongs in `src/data/logic/`
- Keep components small. If a component file exceeds 150 lines, split it.

---

## Routing

Use `react-router` with lazy-loaded route modules:

```ts
const Flights = lazy(() => import('./ui/pages/flights/FlightsPage'))
const Checklists = lazy(() => import('./ui/pages/checklists/ChecklistsPage'))
```

Each page module is a self-contained folder with its own sub-components. The route structure mirrors the bottom nav or sidebar.

---

## PWA / Offline

- `vite-plugin-pwa` with Workbox for service worker generation
- Precache all built assets
- IndexedDB is the single source of truth — no network dependency
- `manifest.json` with Aviator's Toolkit branding, B612 font, warm cream theme

---

## Shared Design Tokens (`src/ui/theme.ts`)

```ts
export const theme = {
  colors: {
    background: '#FDF6E3',
    accent: '#C0392B',
    text: '#2C1810',
    surface: '#FFFFFF',
    muted: '#8B7355',
  },
  fontFamily: '"B612", monospace',
  tapTarget: '44px',  // minimum touch target
}
```

All components reference these tokens. No hardcoded colors or font names in component files.

---

## File Naming Conventions

- Data layer: `kebab-case.ts` (no JSX, no `.tsx`)
- State layer: `kebab-case-store.ts`
- UI layer: `PascalCase.tsx` for components, `use-kebab-case.ts` for hooks
- Tests: colocated as `*.test.ts` or `*.test.tsx`

---

## What Ports and What Doesn't

| Layer | Ports to Flutter/RN? | Notes |
|-------|----------------------|-------|
| `src/data/models.ts` | **Yes** — rewrite types as Dart classes or keep as TS | The schema is the schema |
| `src/data/logic/` | **Yes** — pure functions translate directly | Dart and TS are close enough syntactically |
| `src/data/db.ts` | **Partially** — swap IDB for Hive/Isar/SQLite | Same operations, different storage engine |
| `src/data/export.ts` | **Yes** — string generation is language-agnostic | |
| `src/state/` | **Replace** — swap Zustand for Riverpod/Provider | Same patterns, different library |
| `src/ui/` | **Rewrite** — this is the part you rebuild | Screens, not logic |

---

## Prompt Instructions for AI Sessions

When starting a new module, include this spec and say:

> "Build the [module name] module following the three-layer architecture in ARCHITECTURE_SPEC.md. Start with the data layer (models + logic + db functions), then the Zustand store, then the UI components. No business logic in components. No React imports in the data layer."

When reviewing AI-generated code, check:
1. Does any file in `src/data/` import from React? → **Reject**
2. Does any component call an IndexedDB function directly? → **Move to store**
3. Does any component contain business logic beyond simple display conditionals? → **Move to `src/data/logic/`**
4. Are there hardcoded colors or font names? → **Use theme tokens**
