import type { Waypoint, Route } from '../models'

export interface RouteBundle {
  type: 'ultrapilot-routes'
  version: 1
  exportedAt: string
  waypoints: Waypoint[]
  routes: Route[]
}

export function buildRouteBundle(routes: Route[], waypoints: Waypoint[]): RouteBundle {
  return {
    type: 'ultrapilot-routes',
    version: 1,
    exportedAt: new Date().toISOString(),
    waypoints,
    routes,
  }
}

/** Download a RouteBundle as a .json file */
export function downloadBundle(bundle: RouteBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type ParseResult =
  | { ok: true; bundle: RouteBundle }
  | { ok: false; error: string }

export function parseBundle(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Not a valid JSON object' }
  const obj = raw as Record<string, unknown>
  if (obj['type'] !== 'ultrapilot-routes') return { ok: false, error: 'Not an UltraPilot routes file' }
  if (obj['version'] !== 1) return { ok: false, error: `Unsupported version: ${obj['version']}` }
  if (!Array.isArray(obj['waypoints'])) return { ok: false, error: 'Missing waypoints array' }
  if (!Array.isArray(obj['routes'])) return { ok: false, error: 'Missing routes array' }
  return {
    ok: true,
    bundle: {
      type: 'ultrapilot-routes',
      version: 1,
      exportedAt: String(obj['exportedAt'] ?? ''),
      waypoints: obj['waypoints'] as Waypoint[],
      routes: obj['routes'] as Route[],
    },
  }
}
