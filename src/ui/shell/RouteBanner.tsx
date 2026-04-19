import { useRouteStore } from '../../state/route-store'
import { useWaypointStore } from '../../state/waypoint-store'
import { useGPSStore } from '../../state/gps-store'
import { useMapSettingsStore } from '../../state/map-settings-store'
import { theme } from '../theme'

/** Slim banner shown when a route is active. Floats below the instrument strip. */
export function RouteBanner() {
  const active = useRouteStore(s => s.active)
  const routes = useRouteStore(s => s.routes)
  const waypoints = useWaypointStore(s => s.waypoints)
  const position = useGPSStore(s => s.position)
  const showStrip = useMapSettingsStore(s => s.showInstrumentStrip)
  const { nextLeg, prevLeg, deactivateRoute } = useRouteStore()

  if (!active) return null

  const route = routes.find(r => r.id === active.routeId)
  if (!route) return null

  const legWp = waypoints.find(w => w.id === route.waypointIds[active.legIndex])
  const total = route.waypointIds.length
  const leg = active.legIndex + 1

  const top = showStrip ? `calc(${theme.safeStripHeight} + 4px)` : 'calc(env(safe-area-inset-top, 0px) + 4px)'

  const fromLat = position?.lat ?? 0
  const fromLon = position?.lon ?? 0

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 150,
        background: 'rgba(20,20,24,0.92)',
        border: `1px solid ${theme.colors.red}`,
        borderRadius: '20px',
        padding: '6px 10px 6px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
        maxWidth: 'calc(100vw - 32px)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Leg info */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ fontSize: '10px', color: theme.colors.dim, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
          {route.name} · {leg}/{total}
        </div>
        <div style={{ fontSize: theme.size.body, fontWeight: 700, color: theme.colors.cream, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
          {legWp?.name ?? '—'}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <BannerBtn onClick={() => prevLeg(fromLat, fromLon)} disabled={active.legIndex === 0}>‹</BannerBtn>
        <BannerBtn onClick={() => nextLeg(fromLat, fromLon)}>›</BannerBtn>
        <BannerBtn onClick={() => deactivateRoute()} style={{ color: theme.colors.dim }}>✕</BannerBtn>
      </div>
    </div>
  )
}

function BannerBtn({ onClick, disabled, children, style }: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: `1px solid ${theme.colors.darkBorder}`,
        borderRadius: '8px',
        color: disabled ? theme.colors.darkBorder : (theme.colors.light),
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: theme.font.primary,
        fontSize: '16px',
        minHeight: '32px',
        minWidth: '32px',
        padding: '0 6px',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
