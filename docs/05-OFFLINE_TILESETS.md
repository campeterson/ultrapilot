# UltraPilot — Offline Tilesets

How UltraPilot downloads, stores, and serves PMTiles archives for fully offline
basemap rendering. Complements `04-MAP_CONVENTIONS.md`.

---

## Goal

A pilot on the ground, before launch, can download a regional PMTiles archive
once. After that, the map renders the basemap from local storage with no
network — on the airfield, in the air, or anywhere cell service is spotty. The
online Protomaps style remains the fallback when no local archive covers the
view.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Catalog (hardcoded)                                       │
│    [{ id, name, bbox, url, estimatedSizeBytes }, …]        │
└──────────────────────┬─────────────────────────────────────┘
                       │ user taps "Download"
                       ▼
┌────────────────────────────────────────────────────────────┐
│  tilesets-store (Zustand)                                  │
│    download(url) → ReadableStream → Blob                   │
│    progress emitted on each chunk                           │
└──────────────────────┬─────────────────────────────────────┘
                       │ on complete
                       ▼
┌────────────────────────────────────────────────────────────┐
│  IndexedDB store `tilesets`                                │
│    { id, name, bbox, blob: Blob, sizeBytes, downloadedAt } │
└──────────────────────┬─────────────────────────────────────┘
                       │ on app boot, for each downloaded tileset
                       ▼
┌────────────────────────────────────────────────────────────┐
│  pmtiles Protocol registration                             │
│    new PMTiles(new FileSource(blob))                        │
│    protocol.add(archive) → pmtiles://<id>                  │
└──────────────────────┬─────────────────────────────────────┘
                       │ map style references pmtiles://<id>
                       ▼
┌────────────────────────────────────────────────────────────┐
│  MapLibre renders vector tiles locally, no network         │
└────────────────────────────────────────────────────────────┘
```

Three-layer split per `ARCHITECTURE_SPEC.md`:

- **Data** — `Tileset` model, `tilesets` IDB store, CRUD functions, download
  helper (fetch + stream → Blob). No React.
- **State** — `tilesets-store` exposes catalog + downloaded list + per-id
  download progress. Holds no Blobs in memory after download — the Blob lives
  in IDB; only metadata in store.
- **UI** — `TilesetsPage` renders catalog cards with download/delete buttons
  and progress bars. Map integration registers loaded archives on boot.

---

## Data model

```ts
export interface TilesetCatalogEntry {
  id: string                   // stable slug, e.g. "kc-metro-z14"
  name: string                 // human label
  description: string          // what the region covers
  bbox: [number, number, number, number]  // [minLon, minLat, maxLon, maxLat]
  url: string                  // HTTPS URL of the .pmtiles archive
  estimatedSizeBytes: number   // shown before download
  maxZoom: number              // informational — max detail level baked in
}

export interface Tileset {
  id: string                   // matches catalog id
  name: string
  bbox: [number, number, number, number]
  blob: Blob                   // the .pmtiles bytes
  sizeBytes: number            // actual
  downloadedAt: string         // ISO
  sourceUrl: string            // URL it came from
}
```

`Tileset.blob` lives in IndexedDB — `idb` can store `Blob` natively.
All maplibre access goes through an in-memory `PMTiles` instance built
from that Blob on app boot.

---

## IndexedDB schema change

Bump `DB_VERSION` from 3 → 4. Add `tilesets` store, `keyPath: 'id'`.
No indexes required — catalog is small (dozens of entries tops).

Migration: existing stores untouched.

---

## Download flow

```ts
async function downloadTileset(entry: TilesetCatalogEntry, onProgress: (p: number) => void) {
  const res = await fetch(entry.url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length') || entry.estimatedSizeBytes)
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(received / total)
  }
  const blob = new Blob(chunks, { type: 'application/octet-stream' })
  await saveTileset({
    id: entry.id,
    name: entry.name,
    bbox: entry.bbox,
    blob,
    sizeBytes: blob.size,
    downloadedAt: new Date().toISOString(),
    sourceUrl: entry.url,
  })
}
```

No resume semantics in Phase 1 — a failed or cancelled download just drops the
partial chunks and requires a restart.

---

## Map integration

On app boot (before MapPage mounts), load all stored `Tileset` records,
instantiate `PMTiles(new FileSource(blob))`, and register each with the
shared `Protocol`:

```ts
for (const ts of await dbListTilesets()) {
  const archive = new PMTiles(new FileSource(ts.blob))
  protocol.add(archive)  // queryable at pmtiles://<id>
}
```

Then, when at least one archive is loaded, MapLibre gets a local style with
layers generated via `protomaps-themes-base` pointing at the local source.
The selector logic lives in `ui/pages/map/map-style.ts`:

```ts
export function resolveStyle(loaded: Tileset[]): string | StyleSpecification {
  if (loaded.length === 0) return PROTOMAPS_STYLE_LIGHT  // online
  return buildLocalStyle(loaded[0].id)                    // first archive wins
}
```

Phase 1 keeps it simple: first archive is used when any are loaded. Phase 2
adds bbox-aware selection (use local when map center lies inside archive bbox;
otherwise fall back online).

---

## Catalog location

Phase 1: hardcoded `TILESET_CATALOG` array in `src/data/logic/tilesets-catalog.ts`.
Phase 2 candidate: a JSON file fetched from the hosting CDN, so new regions can
be added without shipping a new app build.

---

## Sizing and hosting

### Netlify (static deploy)

Per Netlify staff guidance, **the recommended maximum size for a single file
in a static deploy is 10 MB**. Larger files upload but are discouraged — they
deploy slowly, cache poorly at the edge, and have caused past timeouts.

This severely constrains PMTiles archives on Netlify. Practical budgets:

| Zoom range | Typical size for a 50 km × 50 km region | Netlify-friendly? |
|---|---|---|
| z0–10  | ~1–3 MB       | Yes — plenty of headroom |
| z0–12  | ~5–15 MB      | Marginal — one file at the limit |
| z0–13  | ~15–40 MB     | No — discouraged |
| z0–14  | ~40–100 MB    | No |
| z0–15  | ~100–300 MB   | No |

So on Netlify, the realistic sweet spot is a **z0–12 regional overview**
(~5–15 MB) and/or a **z0–14 slice of a tight bbox** (e.g., 20 km radius around
one home field, ~10–25 MB) kept under the ceiling by aggressive bbox cropping.

### Cloudflare R2 (recommended for real use)

`04-MAP_CONVENTIONS.md` already flags R2 for production. Free tier:

- 10 GB storage
- 10 M Class-A + 10 M Class-B operations per month
- **Zero egress fees** — downloads cost nothing

Range requests work out of the box. A single 500 MB state-wide z0–14 archive
fits comfortably. The only cost is 10 min of setup: create an R2 bucket,
enable public access or attach a worker for auth, point the catalog URL at
the R2 endpoint.

### Recommendation

Start with Netlify — cheap and no extra infra — by publishing one or two
**tight-bbox, moderate-zoom archives** under 10 MB as a proof of concept.
Move to R2 when you want full home-region coverage or broader zoom. The app
code does not care where archives are hosted — only the `url` field on each
catalog entry changes.

---

## Generating archives

Use the Protomaps CLI [`pmtiles extract`](https://docs.protomaps.com/pmtiles/cli#extract)
against the public daily planet build:

```bash
pmtiles extract \
  https://build.protomaps.com/20260101.pmtiles \
  kc-metro-z14.pmtiles \
  --bbox=-94.9,38.7,-94.3,39.3 \
  --maxzoom=14
```

Outputs a standalone `.pmtiles` file. Upload to Netlify or R2, then add an
entry to `TILESET_CATALOG` with matching `bbox`, `id`, `url`, and
`estimatedSizeBytes`.

Aim for archives small enough that the hosting target is happy and the pilot's
download over LTE finishes in under a minute.

---

## Phase plan

**Phase 1 (this doc, implementable now)**
- Tileset data model + IndexedDB store.
- Zustand store with per-id download progress state.
- Tilesets UI under More → Offline Maps.
- First catalog entry pointing at a placeholder URL.
- Map integration: when any archive is loaded, render from it; otherwise
  fall back to online Protomaps.

**Phase 2 (follow-up)**
- Bbox-aware archive selection (multi-archive support in one session).
- Remote catalog JSON so new regions can be published without app redeploy.
- Download resumption via HTTP Range requests.
- Per-archive expiry / "update available" indicator.
