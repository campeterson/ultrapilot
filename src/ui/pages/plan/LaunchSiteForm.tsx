import { useState } from 'react'
import { theme } from '../../theme'
import { useLaunchSiteStore } from '../../../state/launch-site-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useUnits } from '../../hooks/useUnits'
import { coordinateError } from '../../../data/logic/plan-logic'
import { altitudeToFeet, convertAltitude, ALTITUDE_LABELS } from '../../../data/logic/units-logic'
import type { LaunchSite } from '../../../data/models'
import { buttonStyle, inputStyle, labelStyle } from './plan-styles'

interface Props {
  /** Editing an existing site; otherwise a new one at `initial`. */
  site?: LaunchSite
  initial?: { lat: number; lon: number; name?: string; elevFt?: number | null }
  onClose: () => void
}

/** The form for a site started from a map tap (main map or plan map). */
export function PendingLaunchSiteForm() {
  const { pending, setPending } = useLaunchSiteStore()
  if (!pending) return null
  return <LaunchSiteForm initial={pending} onClose={() => setPending(null)} />
}

/** Modal to name a launch site and confirm or type its coordinates. */
export function LaunchSiteForm({ site, initial, onClose }: Props) {
  const units = useUnits()
  const { add, update, sites } = useLaunchSiteStore()
  const src = site ?? initial
  const elev0 = site?.elevFt ?? initial?.elevFt ?? null
  const [name, setName] = useState(site?.name ?? initial?.name ?? `Launch ${sites.length + 1}`)
  const [lat, setLat] = useState(src ? src.lat.toFixed(5) : '')
  const [lon, setLon] = useState(src ? src.lon.toFixed(5) : '')
  const [elev, setElev] = useState(elev0 == null ? '' : String(Math.round(convertAltitude(elev0, units.altitude))))
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const la = parseFloat(lat), lo = parseFloat(lon)
    const err = !name.trim() ? 'Name is required' : coordinateError(la, lo)
    if (err) { setError(err); return }
    const e = elev.trim() === '' ? null : parseFloat(elev)
    if (e !== null && !Number.isFinite(e)) { setError('Elevation must be a number'); return }
    const elevFt = e === null ? null : Math.round(altitudeToFeet(e, units.altitude))
    if (site) {
      await update({ ...site, name: name.trim(), lat: la, lon: lo, elevFt })
    } else {
      const created = await add(name.trim(), la, lo, elevFt)
      // A new site joins the plan if there's room
      useFlightPlanStore.getState().toggleSite(created.id)
    }
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: theme.colors.darkCard, border: `1px solid ${theme.colors.darkBorder}`, borderRadius: '16px', padding: '20px', width: 'min(320px, calc(100vw - 32px))', fontFamily: theme.font.primary, boxSizing: 'border-box' }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream, marginBottom: '14px' }}>
          {site ? 'Edit Launch Site' : 'Add Launch Site'}
        </div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Latitude</label>
            <input style={inputStyle} value={lat} onChange={e => setLat(e.target.value)} inputMode="decimal" placeholder="38.90000" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Longitude</label>
            <input style={inputStyle} value={lon} onChange={e => setLon(e.target.value)} inputMode="decimal" placeholder="-94.60000" />
          </div>
        </div>
        <label style={{ ...labelStyle, marginTop: '10px' }}>Elevation ({ALTITUDE_LABELS[units.altitude]} MSL) — blank uses forecast terrain</label>
        <input style={inputStyle} value={elev} onChange={e => setElev(e.target.value)} inputMode="numeric" placeholder="auto" />
        {error && <div style={{ color: theme.colors.red, fontSize: theme.size.small, marginTop: '8px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={onClose} style={{ ...buttonStyle(), flex: 1 }}>Cancel</button>
          <button onClick={handleSave} style={{ ...buttonStyle(true), flex: 1 }}>Save</button>
        </div>
      </div>
    </div>
  )
}
