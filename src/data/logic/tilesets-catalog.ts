import type { TilesetCatalogEntry } from '../models'

// Offline regional archives offered for download. Add entries here once the
// .pmtiles file is generated (via `pmtiles extract`) and hosted somewhere that
// supports HTTP Range requests (Netlify for <10 MB archives, Cloudflare R2 for
// anything bigger — see docs/05-OFFLINE_TILESETS.md).
//
// The `id` is the archive's lookup key on the pmtiles:// protocol and must be
// stable across releases (it's persisted in IndexedDB).
export const TILESET_CATALOG: TilesetCatalogEntry[] = []
