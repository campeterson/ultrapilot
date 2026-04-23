// Single source of truth for the MapLibre PMTiles protocol handler. Both map
// components (MapPage, SessionMap) import this for the side-effect; the
// tilesets store calls registerArchive/unregisterArchive to expose downloaded
// archives to MapLibre as `pmtiles://<id>`.

import maplibregl from 'maplibre-gl'
import { Protocol, PMTiles, FileSource } from 'pmtiles'

const protocol = new Protocol()

declare global {
  // eslint-disable-next-line no-var
  var _ultrapilotPmtilesRegistered: boolean | undefined
}

if (!globalThis._ultrapilotPmtilesRegistered) {
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))
  globalThis._ultrapilotPmtilesRegistered = true
}

const registry = new Map<string, PMTiles>()

/** Register a downloaded archive under `pmtiles://<id>`. Idempotent.
 *  The Protocol uses File.name as the lookup key, so we pass `id` as the
 *  filename — MapLibre then requests tiles via `pmtiles://<id>/{z}/{x}/{y}`. */
export function registerArchive(id: string, blob: Blob): void {
  if (registry.has(id)) return
  const file = new File([blob], id)
  const archive = new PMTiles(new FileSource(file))
  protocol.add(archive)
  registry.set(id, archive)
}

export function unregisterArchive(id: string): void {
  // pmtiles Protocol has no public remove(); we drop the reference so the
  // archive is garbage-collected once the map stops requesting it. Future
  // tile requests for pmtiles://<id> will fail — which is fine because the
  // caller has already removed the source from the style.
  registry.delete(id)
}

export function isRegistered(id: string): boolean {
  return registry.has(id)
}
