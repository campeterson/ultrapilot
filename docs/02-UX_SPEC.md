# UltraPilot — UX Specification

## Navigation Model: The Garmin Pilot Pattern

The app follows the responsive panel pattern established by Garmin Pilot. The map is always "home." The bottom nav bar controls what fills the secondary content area. The behavior changes by form factor:

### Phone (< 768px width)

- Bottom nav bar is a fixed footer with 4 fixed tabs + More picker
- Tapping **Map** shows the full-screen map with floating instruments and controls
- Tapping any other tab (Timeline, Checklists, Wx/Apt) **replaces the entire content area** with that view — the map is hidden
- Tapping **Map** again returns to the full-screen map
- The instrument strip remains visible at the top in all views

### Tablet Portrait (768px–1024px width)

- The map fills the top ~52% of the screen
- Tapping a non-Map tab opens a **bottom panel** (~48%) showing that content
- A **chevron button** (˅/˄) centered at the bottom edge of the map toggles the panel open/closed without changing the selected tab
- Tapping **Map** collapses the panel and returns to full-screen map
- The map is always visible — it never gets replaced
- Full instrument strip spans the width

### Tablet Landscape (> 1024px width)

- The map fills the left side of the screen
- Tapping a non-Map tab opens a **right panel** (~310px) showing that content
- A **chevron button** (‹/›) on the right edge of the map toggles the panel open/closed
- Tapping **Map** collapses the panel and returns to full-screen map
- The map is always visible
- Full instrument strip spans the width

### Panel Transition Summary

| Form Factor | Map Position | Panel Position | Panel Toggle |
|---|---|---|---|
| Phone | Full screen (or hidden) | Replaces map | Nav tab tap |
| Tablet Portrait | Top ~52% | Bottom ~48% | Chevron ˅˄ |
| Tablet Landscape | Left side | Right ~310px | Chevron ‹› |

---

## Bottom Nav Bar

Fixed footer across all form factors. Contains:

### Fixed Tabs (always visible)

| Tab | Icon | Content |
|---|---|---|
| Map | Globe/map | Full-screen map with instruments and floating controls |
| Timeline | Clock | Session timeline with summary cards and event log |
| Checklists | Checkbox | Checklist list → individual checklist runner |
| Wx / Apt | Cloud | METAR display + nearby airports with distance/bearing |

### More Picker (rightmost position)

A "More" button (⋮ dots icon) that opens an **upward popover** with secondary views:

| View | Description |
|---|---|
| Instruments | Full-panel instrument display (large digital readouts) |
| Airports | Detailed airport browser (future) |
| Settings | App configuration |

The More picker works like Garmin Pilot's — less prominent than the fixed tabs, but provides access to views that don't need their own permanent nav slot.

When a More view is active, the More button shows the active (red) state.

---

## Instrument Strip

A horizontal bar at the **top of the screen**, below the system status bar, above the map. Always visible regardless of which tab is selected.

### Layout

- Spans full width
- Each instrument is a cell: label on top (small, dim), value below (large, cream), unit beside value (small, dim)
- Cells separated by subtle vertical borders
- A **gear button** (⚙) at the right end opens the instrument configurator

### Default Instruments (phone shows first 4, tablet shows all 6)

1. AGL — altitude above origin point (ft)
2. ALT (GPS) — MSL altitude from GPS (ft)
3. GND SPEED — ground speed (kt)
4. TRACK — ground track (°M)
5. DIST (ORIG) — distance to session origin (nm)
6. FLT TIME — elapsed flight time

### Instrument Configurator

- Full-screen overlay
- Lists all available data fields (10 total): GS, AGL, MSL, VS, HDG, DIST, BRG, FLT TIME, SESSION TIME, MAX AGL
- Tap to toggle on/off (max 5 per strip)
- Numbered circles show display order
- Save/Cancel buttons at bottom

### Available Instrument Fields

| ID | Label | Description |
|---|---|---|
| gs | GS | Ground speed (kt) |
| agl | AGL | Altitude above origin (ft) |
| msl | MSL | GPS altitude mean sea level (ft) |
| vs | VS | Vertical speed (fpm) — computed |
| hdg | HDG | Ground track / heading (°) |
| dist | DIST | Distance to origin (nm) |
| brg | BRG | Bearing to origin (°) |
| etime | FLT | Elapsed flight time |
| sess | SESS | Elapsed session time |
| maxalt | MAX | Maximum AGL achieved this session |

---

## Map View

### Map Content

- User position: red dot with white border, pulsing glow
- Track trail: dashed red line showing flight path
- Origin marker: hollow circle with "ORIGIN" label at session start position
- North arrow: top-right corner

### Floating Map Controls (bottom-left cluster)

- **Layers** button — map layer picker (future: satellite, aviation charts)
- **Position** button (▲) — re-center map on current position
- **STAMP** button — red circle, always accessible, triggers event stamping

### Floating Status (bottom-right)

- Recording indicator: green dot + "REC" + elapsed time
- Shows when GPS tracking is active

### Map Interactions

- Pan and zoom (standard touch gestures)
- Tap on origin marker to see coordinates
- Tap on track to see position at that point (future)

---

## Timeline View

The timeline is the canonical record of a flight session. Everything that happens during a session appears here.

### Summary Cards (top of timeline)

Three cards in a horizontal row:

| Card | Value |
|---|---|
| FLIGHT | Elapsed flight time (takeoff to landing) |
| SESSION | Elapsed session time (session start to now) |
| MAX AGL | Peak AGL altitude achieved |

### Event Timeline

A vertical timeline with:

- Vertical line on the left connecting events
- Colored dots at each event (blue = session, green = completion/takeoff, amber = engine, red = active)
- Event name (bold, cream) and timestamp (dim, right-aligned)
- Sub-detail line (dim) with coordinates, checklist counts, or flight data at that moment

### Event Types

| Event | Auto/Manual | Color | Sub-detail |
|---|---|---|---|
| Session Start | Auto | Blue | Coordinates |
| Checklist Complete | Auto | Green | "Checklist completed (n/n)" |
| Wing Layout | Manual stamp | Default | Coordinates |
| Engine Start | Manual stamp | Amber | "Warmup cycle" or "Flight cycle" |
| Engine Shutdown | Manual stamp | Amber | — |
| Takeoff | Manual stamp | Green | AGL + GS at stamp time |
| Landing | Manual stamp | Green | AGL + GS at stamp time |
| Custom Event | Manual stamp | Default | Coordinates + user note |
| Session End | Auto/Manual | Blue | Coordinates |

### Stamp Interaction

Tapping STAMP opens an event picker:

- List of common event types (predefined + user-customizable)
- Each stamp records: timestamp, GPS coordinates, current AGL, current GS
- Completing a checklist automatically creates a stamp
- Quick-stamp: tapping STAMP without selecting a type creates a generic timestamped waypoint

---

## Checklists View

### Checklist List

- Shows all checklists for the current session/aircraft profile
- Each row shows: name, item count, status badge (Done / Active / Pending)
- Active checklist highlighted with amber border
- Tapping a checklist opens the checklist runner

### Checklist Runner

- Full-screen (phone) or fills the panel (tablet)
- Each item is a tappable row (44px minimum height)
- Tapping an item checks it off (green checkmark)
- Progress indicator at top: "4 of 12"
- Completing all items: auto-stamps the timeline, shows completion state
- Back button returns to checklist list

### Checklist Management (Settings)

- Create, edit, delete, reorder checklists
- Import/export checklists as JSON
- Share checklists via base64 URL (same pattern as Aviator Checklist app)
- PPC-specific default templates included

---

## Weather / Airports View

### METAR Display

- Airport identifier + age of report
- Flight category badge (VFR/MVFR/IFR/LIFR) with color coding
- Raw METAR string in monospace font
- Decoded summary line: wind, visibility, ceiling, temp/dewpoint, altimeter

### Nearby Airports

- List sorted by distance from current position
- Each entry: identifier (bold), name, distance + bearing
- Tapping an airport shows detail (future: runway info, frequencies, fuel)
- Refresh button to update based on current position

### Data Source

- METAR: Aviation Weather API (requires internet — display "No data" when offline with last-fetched time)
- Nearby airports: Embedded airport database (JSON, ~3,500 US public airports with coordinates, name, identifier)

---

## Instruments View (via More picker)

Full-panel instrument display for at-a-glance monitoring.

### Layout

- Two **hero instruments** at top (large format): Ground Speed and AGL — these are the two most critical values for PPC flight
- Below: 2-column grid of remaining instruments in large digital format
- All values update in real-time from GPS
- Each instrument shows: label (small, dim), value (large, cream), unit (small, dim)

This view is for tablet split-screen use — map on left, instruments on right — giving a cockpit-like display.

---

## Session Lifecycle

### Starting a Session

1. User opens UltraPilot
2. Taps "Start Session" (or sessions auto-start — TBD)
3. App requests GPS permission
4. Origin point is set to current position
5. Session timer begins
6. GPS tracking begins (position logged at configurable interval)
7. "Session Start" event auto-stamped on timeline

### During a Session

- GPS continuously tracked
- Instruments update in real-time
- User stamps events, runs checklists, checks weather
- All activity flows into the timeline

### Ending a Session

1. User taps "End Session" (accessible from Settings or a long-press on the recording indicator)
2. "Session End" event auto-stamped
3. GPS tracking stops
4. Session summary displayed
5. Export options presented: GPX, JSON

### Session Data Model

A session contains:

- Session metadata: start time, end time, origin coordinates, device info
- Track points: array of {timestamp, lat, lon, altMSL, speed, heading}
- Events: array of {timestamp, type, lat, lon, altAGL, altMSL, speed, note}
- Checklist completions: array of {timestamp, checklistName, itemsCompleted}

---

## Export

### GPX Export

Primary interchange format. Contains:

- Track segment with all logged GPS points
- Waypoints for each stamped event
- Metadata: session start/end times, device, app version

### JSON Export

Full-fidelity export of the session data model, including all events, checklist completions, and computed values (max AGL, total distance, etc.).

---

## Minimum Tap Targets

All interactive elements must be at least **44 × 44 px**. This includes:

- Nav bar buttons
- Checklist items
- Stamp button and event picker items
- Instrument configurator toggles
- Airport list items
- Chevron toggle buttons

This is critical for cockpit use — PPC pilots may be wearing gloves and the cart vibrates.
