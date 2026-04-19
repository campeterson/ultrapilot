import { useEffect, useState } from 'react'
import { theme } from '../../theme'
import { useRouteStore } from '../../../state/route-store'
import { useWaypointStore } from '../../../state/waypoint-store'
import { useGPSStore } from '../../../state/gps-store'
import { useSessionStore } from '../../../state/session-store'
import { useAirportStore } from '../../../state/airport-store'
import type { Route, Waypoint } from '../../../data/models'
import type { NearbyAirport } from '../../../data/logic/airport-logic'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: `1px solid ${theme.colors.darkBorder}`,
  background: 'rgba(255,255,255,0.05)',
  color: theme.colors.cream,
  fontFamily: theme.font.primary,
  fontSize: theme.size.body,
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: theme.size.small,
  color: theme.colors.dim,
  fontFamily: theme.font.primary,
  marginBottom: '4px',
  display: 'block',
}

export function RoutesPage() {
  const { routes, loading, active, load, createRoute, removeRoute, activateRoute, deactivateRoute, setPreview } = useRouteStore()
  const { waypoints, load: loadWaypoints } = useWaypointStore()
  const position = useGPSStore(s => s.position)
  const session = useSessionStore(s => s.session)
  const { nearby: nearbyAirports, loadDatabase: loadAirports, refreshNearby } = useAirportStore()

  const [builderOpen, setBuilderOpen] = useState(false)
  const [editRoute, setEditRoute] = useState<Route | null>(null)
  const [detailRoute, setDetailRoute] = useState<Route | null>(null)

  useEffect(() => {
    load()
    loadWaypoints()
    loadAirports()
  }, [load, loadWaypoints, loadAirports])

  useEffect(() => {
    if (position) refreshNearby(position.lat, position.lon)
  }, [position, refreshNearby])

  function openNewBuilder() {
    setEditRoute(null)
    setBuilderOpen(true)
  }

  function openEditBuilder(r: Route) {
    setEditRoute(r)
    setDetailRoute(null)
    setBuilderOpen(true)
  }

  async function handleDelete(id: string) {
    await removeRoute(id)
    setDetailRoute(null)
  }

  function handleActivate(r: Route) {
    const lat = position?.lat ?? 0
    const lon = position?.lon ?? 0
    activateRoute(r.id, lat, lon)
    setDetailRoute(null)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${theme.colors.darkBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>Routes</span>
        <button
          onClick={openNewBuilder}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            background: theme.colors.red, color: '#fff', cursor: 'pointer',
            fontSize: theme.size.body, fontWeight: 700, fontFamily: theme.font.primary,
            minHeight: theme.tapTarget,
          }}
        >
          + New
        </button>
      </div>

      {/* Active route hint */}
      {active && (
        <div style={{
          padding: '10px 16px', background: theme.colors.redDim,
          borderBottom: `1px solid ${theme.colors.darkBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: theme.size.small, color: theme.colors.cream }}>
            Route active — leg {(active.legIndex + 1)}/{routes.find(r => r.id === active.routeId)?.waypointIds.length ?? '?'}
          </div>
          <button
            onClick={() => deactivateRoute()}
            style={{
              padding: '4px 10px', borderRadius: '6px', border: `1px solid ${theme.colors.darkBorder}`,
              background: 'none', color: theme.colors.light, cursor: 'pointer',
              fontFamily: theme.font.primary, fontSize: theme.size.small,
            }}
          >
            End
          </button>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim }}>Loading…</div>
        )}
        {!loading && routes.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✈</div>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.body }}>No routes yet.</div>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.small, marginTop: '6px' }}>Tap + New to build one from your waypoints.</div>
          </div>
        )}
        {routes.map(r => (
          <RouteRow
            key={r.id}
            route={r}
            isActive={active?.routeId === r.id}
            waypoints={waypoints}
            onTap={() => { setPreview(r.id); setDetailRoute(r) }}
          />
        ))}
      </div>

      {/* Detail modal */}
      {detailRoute && (
        <RouteDetailModal
          route={detailRoute}
          waypoints={waypoints}
          isActive={active?.routeId === detailRoute.id}
          hasSession={!!session}
          onActivate={() => handleActivate(detailRoute)}
          onDeactivate={() => deactivateRoute()}
          onEdit={() => openEditBuilder(detailRoute)}
          onDelete={() => handleDelete(detailRoute.id)}
          onClose={() => { setPreview(null); setDetailRoute(null) }}
        />
      )}

      {/* Builder modal */}
      {builderOpen && (
        <RouteBuilderModal
          waypoints={waypoints}
          nearbyAirports={nearbyAirports}
          editRoute={editRoute}
          onSave={async (name, wpIds) => {
            if (editRoute) {
              await useRouteStore.getState().updateRoute(editRoute.id, name, wpIds)
            } else {
              await createRoute(name, wpIds)
            }
            setBuilderOpen(false)
          }}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function RouteRow({ route, isActive, waypoints, onTap }: {
  route: Route
  isActive: boolean
  waypoints: Waypoint[]
  onTap: () => void
}) {
  const names = route.waypointIds
    .map(id => waypoints.find(w => w.id === id)?.name ?? '?')
    .join(' → ')

  return (
    <button
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.colors.darkBorder}`,
        background: isActive ? theme.colors.redDim : 'none',
        border: 'none', borderBottomWidth: '1px', borderBottomStyle: 'solid',
        borderBottomColor: theme.colors.darkBorder,
        cursor: 'pointer', textAlign: 'left', minHeight: theme.tapTarget,
        fontFamily: theme.font.primary,
      }}
    >
      <span style={{ fontSize: '18px', color: isActive ? theme.colors.red : theme.colors.dim, flexShrink: 0 }}>✈</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: theme.size.body, fontWeight: 700, color: theme.colors.cream, marginBottom: '2px' }}>
          {route.name}
          {isActive && <span style={{ marginLeft: '8px', fontSize: theme.size.tiny, color: theme.colors.red, letterSpacing: '0.05em' }}>ACTIVE</span>}
        </div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {route.waypointIds.length} legs{names ? ` · ${names}` : ''}
        </div>
      </div>
      <span style={{ fontSize: theme.size.small, color: theme.colors.dim, flexShrink: 0 }}>›</span>
    </button>
  )
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function RouteDetailModal({ route, waypoints, isActive, hasSession, onActivate, onDeactivate, onEdit, onDelete, onClose }: {
  route: Route
  waypoints: Waypoint[]
  isActive: boolean
  hasSession: boolean
  onActivate: () => void
  onDeactivate: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const names = route.waypointIds.map(id => waypoints.find(w => w.id === id)?.name ?? '?')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', zIndex: 300,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.colors.darkCard, border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '16px', padding: '24px', width: 'min(320px, calc(100vw - 32px))',
          fontFamily: theme.font.primary, maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream }}>{route.name}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.colors.dim, cursor: 'pointer', fontSize: '20px', padding: '0 0 0 12px', minHeight: theme.tapTarget }}
          >✕</button>
        </div>

        {/* Leg list */}
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {names.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: theme.colors.dim, width: '20px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: theme.size.body, color: theme.colors.light }}>
                {i === 0 ? '◉' : '⌖'} {name}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {hasSession && !isActive && (
            <button
              onClick={onActivate}
              style={{
                padding: '12px', borderRadius: '8px', border: 'none',
                background: theme.colors.red, color: '#fff', cursor: 'pointer',
                fontFamily: theme.font.primary, fontSize: theme.size.body, fontWeight: 700,
                minHeight: theme.tapTarget, letterSpacing: '0.04em',
              }}
            >
              ✈ Fly Route
            </button>
          )}
          {isActive && (
            <button
              onClick={onDeactivate}
              style={{
                padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.red}`,
                background: 'none', color: theme.colors.red, cursor: 'pointer',
                fontFamily: theme.font.primary, fontSize: theme.size.body, fontWeight: 700,
                minHeight: theme.tapTarget,
              }}
            >
              Stop Route
            </button>
          )}
          <button
            onClick={onEdit}
            style={{
              padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`,
              background: 'none', color: theme.colors.light, cursor: 'pointer',
              fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget,
            }}
          >
            Edit Route
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`,
                background: 'none', color: theme.colors.dim, cursor: 'pointer',
                fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget,
              }}
            >
              Delete Route
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`,
                  background: 'none', color: theme.colors.light, cursor: 'pointer',
                  fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget,
                }}
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: `2px solid ${theme.colors.red}`,
                  background: theme.colors.redDim, color: theme.colors.cream, cursor: 'pointer',
                  fontFamily: theme.font.primary, fontSize: theme.size.body, fontWeight: 700,
                  minHeight: theme.tapTarget,
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Builder modal ─────────────────────────────────────────────────────────────

function RouteBuilderModal({ waypoints, nearbyAirports, editRoute, onSave, onClose }: {
  waypoints: Waypoint[]
  nearbyAirports: NearbyAirport[]
  editRoute: Route | null
  onSave: (name: string, waypointIds: string[]) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(editRoute?.name ?? `Route ${Date.now().toString().slice(-4)}`)
  const [selectedIds, setSelectedIds] = useState<string[]>(editRoute?.waypointIds ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleWaypoint(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function moveUp(index: number) {
    if (index === 0) return
    setSelectedIds(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setSelectedIds(prev => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  async function addAirportAsWaypoint(ap: NearbyAirport) {
    // Create or reuse a waypoint for this airport
    const existing = useWaypointStore.getState().waypoints.find(w => w.name === ap.id)
    if (existing) {
      if (!selectedIds.includes(existing.id)) setSelectedIds(prev => [...prev, existing.id])
      return
    }
    const wp: Waypoint = {
      id: `wp-apt-${ap.id}`,
      name: ap.id,
      lat: ap.lat,
      lon: ap.lon,
      note: ap.name,
      createdAt: new Date().toISOString(),
    }
    await useWaypointStore.getState().save(wp)
    setSelectedIds(prev => [...prev, wp.id])
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    if (selectedIds.length < 2) { setError('A route needs at least 2 waypoints.'); return }
    setSaving(true)
    await onSave(name.trim(), selectedIds)
    setSaving(false)
  }

  const orderedWps = selectedIds.map(id => waypoints.find(w => w.id === id)).filter((w): w is Waypoint => !!w)
  const unselected = waypoints.filter(w => !selectedIds.includes(w.id))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '40px', paddingBottom: theme.safeNavHeight, overflowY: 'auto',
        zIndex: 300,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.colors.darkCard, border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '16px', padding: '24px', width: 'min(340px, calc(100vw - 32px))',
          fontFamily: theme.font.primary, flexShrink: 0,
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: theme.colors.cream, marginBottom: '20px' }}>
          {editRoute ? 'Edit Route' : 'New Route'}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Route name</label>
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Field loop"
          />
        </div>

        {/* Ordered legs */}
        {orderedWps.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '8px' }}>Route legs (tap ↑↓ to reorder, × to remove)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {orderedWps.map((wp, i) => (
                <div
                  key={wp.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: theme.colors.dark, borderRadius: '8px', padding: '8px 10px',
                  }}
                >
                  <span style={{ fontSize: '12px', color: theme.colors.dim, width: '18px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: theme.size.body, color: theme.colors.cream, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wp.name}</span>
                  <button onClick={() => moveUp(i)} style={reorderBtnStyle} disabled={i === 0}>↑</button>
                  <button onClick={() => moveDown(i)} style={reorderBtnStyle} disabled={i === orderedWps.length - 1}>↓</button>
                  <button
                    onClick={() => setSelectedIds(prev => prev.filter(x => x !== wp.id))}
                    style={{ ...reorderBtnStyle, color: theme.colors.dim }}
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add waypoints */}
        {unselected.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '8px' }}>Add waypoints</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
              {unselected.map(wp => (
                <button
                  key={wp.id}
                  onClick={() => toggleWaypoint(wp.id)}
                  style={{
                    padding: '10px 12px', borderRadius: '8px',
                    border: `1px solid ${theme.colors.darkBorder}`,
                    background: 'none', color: theme.colors.light, cursor: 'pointer',
                    fontFamily: theme.font.primary, fontSize: theme.size.body,
                    textAlign: 'left', minHeight: theme.tapTarget,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  <span style={{ color: theme.colors.dim }}>⌖</span>
                  {wp.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {waypoints.length === 0 && nearbyAirports.length === 0 && (
          <div style={{ color: theme.colors.dim, fontSize: theme.size.small, marginBottom: '16px', textAlign: 'center' }}>
            No waypoints saved yet. Create some in the Wpts tab first.
          </div>
        )}

        {/* Nearby airports */}
        {nearbyAirports.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '8px' }}>Nearby airports</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
              {nearbyAirports
                .filter(ap => {
                  // Hide airports already in the route (matched by name === ap.id)
                  const wpForAp = waypoints.find(w => w.name === ap.id) ?? { id: `wp-apt-${ap.id}` }
                  return !selectedIds.includes(wpForAp.id)
                })
                .map(ap => (
                  <button
                    key={ap.id}
                    onClick={() => addAirportAsWaypoint(ap)}
                    style={{
                      padding: '10px 12px', borderRadius: '8px',
                      border: `1px solid ${theme.colors.darkBorder}`,
                      background: 'none', color: theme.colors.light, cursor: 'pointer',
                      fontFamily: theme.font.primary, fontSize: theme.size.body,
                      textAlign: 'left', minHeight: theme.tapTarget,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ color: theme.colors.cyan, fontFamily: theme.font.mono, fontWeight: 700, flexShrink: 0 }}>{ap.id}</span>
                      <span style={{ color: theme.colors.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ap.name}</span>
                    </div>
                    <span style={{ color: theme.colors.dim, fontSize: theme.size.small, flexShrink: 0, fontFamily: theme.font.mono }}>
                      {ap.distNM.toFixed(1)} nm
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {error && <div style={{ color: theme.colors.red, fontSize: theme.size.small, marginBottom: '10px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`,
              background: 'none', color: theme.colors.light, cursor: 'pointer',
              fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
              background: theme.colors.red, color: '#fff', cursor: 'pointer',
              fontFamily: theme.font.primary, fontSize: theme.size.body, fontWeight: 700,
              minHeight: theme.tapTarget, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Route'}
          </button>
        </div>
      </div>
    </div>
  )
}

const reorderBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: theme.colors.light, cursor: 'pointer',
  padding: '4px 6px', fontSize: '14px', minHeight: '32px', minWidth: '28px',
}

