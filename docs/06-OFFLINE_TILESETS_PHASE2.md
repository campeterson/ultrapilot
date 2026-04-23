# 06 — Offline Tilesets, Phase 2 Planning

Follow-up to [05-OFFLINE_TILESETS.md](./05-OFFLINE_TILESETS.md). Phase 1
(download-and-store infra) is merged at v1.3.0; this document captures the
design decisions needed before we populate the catalog.

## Where Phase 1 left us

Working and type-checked:

- `src/data/models.ts` — `Bbox`, `TilesetCatalogEntry`, `Tileset`
- `src/data/db.ts` — `tilesets` object store (IDB v4), CRUD functions
- `src/data/logic/tileset-download.ts` — streaming fetch w/ progress, `formatBytes`
- `src/data/logic/tilesets-catalog.ts` — hardcoded catalog (currently one
  placeholder entry `kc-metro-z12` pointing at `example.invalid`)
- `src/state/tilesets-store.ts` — Zustand store: `catalog`, `downloaded`,
  per-id `downloads` progress, `init / download / remove`
- `src/ui/pages/map/pmtiles-protocol.ts` — single Protocol instance,
  `registerArchive(id, blob)` / `unregisterArchive(id)`
- `src/ui/pages/tilesets/TilesetsPage.tsx` — list, progress bars, remove
- `src/ui/shell/MorePicker.tsx` + `AppShell.tsx` — "Offline Maps" entry;
  `useTilesetsStore.getState().init()` called on boot

**Not yet wired:** map-style doesn't yet prefer local `pmtiles://<id>` when an
archive is present. Deliberately deferred until we know what the catalog
actually contains.

## Open decisions from 2026-04-22 conversation

### 1. Hosting: Cloudflare R2 vs Netlify static

**Context.** Netlify staff recommend ≤10MB per file. R2 has no per-file cap,
zero egress, 10GB free.

| | Netlify `public/tilesets/*.pmtiles` | Cloudflare R2 |
|---|---|---|
| Setup | zero — drop files in repo | bucket + custom domain + CORS |
| Max region size | ~10MB practical | unbounded |
| Satellite viable? | no | yes |
| On-the-fly extract viable? | no (no Range on deploy archive) | yes |
| Cost at 10GB | free | free |

**Recommendation.** Move to R2 now, before we generate any real archives.
Everything we might want next (bigger vector regions, satellite, on-the-fly
extract) lands on R2; Netlify only keeps us in the toy-demo zone.

### 2. Satellite imagery

A different content type from vector — raster PMTiles (PNG/JPEG). MapLibre can
render both, but UX needs a **basemap mode toggle** (Vector / Satellite /
Hybrid), not satellite-as-another-region.

Licensing picks the approach:

- **Sentinel-2** (ESA, free, CC-BY). 10m resolution, permissive. Cloud-cover
  mosaic varies; AWS Open Data hosts cloud-free composites.
- **USGS NAIP** (US only, 0.6–1m, free). High-resolution agricultural imagery
  — ideal for PPC fields, ranches, off-airport landings.
- **Mapbox / Esri / ArcGIS** — paid tiles, API-gated. Out of scope for an
  offline-first app.
- **Bing** — free for personal/dev use up to a limit; tricky TOS for PWA.

**Recommendation.** NAIP for US ops (matches PPC/ultralight demographic),
Sentinel-2 mosaic as a global fallback. Both can be tiled to PMTiles via
`rio-mbtiles` or `gdal2mbtiles` + `pmtiles convert`.

### 3. How users pick what to download

Two flavors:

**(a) Curated catalog** (today's shape).
- We pre-run `pmtiles extract` for named regions, host archives on R2, list
  them in `tilesets-catalog.ts`.
- Users tap Download on a region they want.
- Pros: fixed, predictable sizes; no heavy client-side work; works with any
  hosting that supports plain GETs.
- Cons: we choose the regions; awkward for pilots outside predefined areas.

**(b) Draw-a-box + on-the-fly extract**.
- We host one planet-scale archive (Protomaps full planet ≈ 107 GB) on R2.
- User draws a rectangle on the map → client uses `pmtiles extract` (it
  supports HTTP Range to pull only the needed tiles) → saves the resulting
  trimmed archive to IDB.
- Pros: any region, any size (within the user's patience). This is the
  "ForeFlight feel."
- Cons: requires R2; extract time ~30s–5min depending on area + zoom;
  client-side `pmtiles extract` needs the `pmtiles` package's extract helper
  (or we wrap a WASM build).

**Recommendation.** Ship (a) first with 2–4 curated regions + 1 satellite
region as proof of concept. Add (b) as a "Custom region" button in the same
page once (a) is validated.

## Satellite + vector — rendering plan

Style files become mode-aware. Add a `basemapMode` setting (enum:
`vector | satellite | hybrid`) and branch the MapLibre style source:

- `vector` → existing Protomaps vector style (current default)
- `satellite` → raster source pointing at either the hosted URL or a local
  `pmtiles://<satellite-id>` if the user downloaded the satellite archive
- `hybrid` → satellite raster below, vector roads/labels above (trim the
  vector style to just the overlay layers)

Store: `map-settings-store.ts` gets `basemapMode`. UI: segmented control in
`MapControls.tsx` or `SettingsPage.tsx`.

## Concrete next steps (in rough order)

1. **Set up R2 bucket** (`ultrapilot-tiles`) with a custom domain and a CORS
   policy that allows the deployed Netlify origin + localhost dev ports.
2. **Extract + upload the first 2 vector regions.** Candidates: KC Metro
   z0–12 (~8MB) and a larger area (e.g. Missouri) z0–13 (~40MB — tests the
   "bigger than Netlify" codepath).
3. **Add one NAIP satellite region** at matching extent (~100–300MB for a
   county-sized area) to validate the raster pipeline end-to-end.
4. **Update `tilesets-catalog.ts`** with real R2 URLs; verify Range requests
   work from the app.
5. **Wire the map to prefer local archives.** On map init, check
   `isRegistered(id)` for any catalog entry whose `bbox` covers the current
   viewport; if so, layer its source above the hosted tiles. (Simpler
   alternative: always load both, let MapLibre's source-layer ordering
   handle overlap.)
6. **Add `basemapMode` + segmented UI control.**
7. **Iterate on sizing** — measure actual IDB storage used across a typical
   pilot's download set (say 3 regions + satellite for home area).
8. **Only then** consider Phase 2 option (b) — draw-a-box extract.

## Decisions still needed from the user

- [ ] Confirm R2 + custom domain (vs falling back to Netlify + only small regions)
- [ ] Satellite license choice: NAIP-only US, Sentinel-2 global, or both
- [ ] Initial catalog regions (KC + what else?)
- [ ] Basemap mode default: vector (current) or hybrid
