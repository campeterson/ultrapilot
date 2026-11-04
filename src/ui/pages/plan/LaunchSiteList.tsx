import { useState } from 'react'
import { theme } from '../../theme'
import { useLaunchSiteStore } from '../../../state/launch-site-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useGPSStore } from '../../../state/gps-store'
import { useUnits } from '../../hooks/useUnits'
import { MAX_PLAN_SITES } from '../../../data/logic/plan-logic'
import { altitudeText } from '../../../data/logic/units-logic'
import type { LaunchSite } from '../../../data/models'
import { LaunchSiteForm } from './LaunchSiteForm'
import { buttonStyle, sectionStyle, sectionTitle } from './plan-styles'

type FormState = { site?: LaunchSite; initial?: { lat: number; lon: number } } | null

/** Saved launch sites; tap to include in the plan (up to three). */
export function LaunchSiteList() {
  const { sites, remove } = useLaunchSiteStore()
  const { selectedSiteIds, toggleSite } = useFlightPlanStore()
  const position = useGPSStore(s => s.position)
  const units = useUnits()
  const [form, setForm] = useState<FormState>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const full = selectedSiteIds.length >= MAX_PLAN_SITES

  return (
    <div style={sectionStyle}>
      <div style={sectionTitle}>Launch sites · {selectedSiteIds.length}/{MAX_PLAN_SITES} chosen</div>
      {sites.length === 0 && (
        <div style={{ color: theme.colors.dim, fontSize: theme.size.small, marginBottom: '8px', lineHeight: 1.4 }}>
          No launch sites yet. Tap the map and choose “Add Launch Site”, or enter coordinates.
        </div>
      )}
      {sites.map(site => {
        const idx = selectedSiteIds.indexOf(site.id)
        const chosen = idx >= 0
        const disabled = !chosen && full
        return (
          <div key={site.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: `1px solid ${theme.colors.darkBorder}`, padding: '4px 0' }}>
            <button
              onClick={() => toggleSite(site.id)}
              disabled={disabled}
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minHeight: theme.tapTarget, background: 'none', border: 'none', textAlign: 'left', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, padding: 0, fontFamily: theme.font.primary }}
            >
              <span style={{ width: '26px', height: '26px', flexShrink: 0, borderRadius: '50%', border: `2px solid ${theme.colors.launchSite}`, background: chosen ? theme.colors.launchSite : 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: theme.size.small, fontWeight: 700 }}>
                {chosen ? idx + 1 : ''}
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ color: theme.colors.cream, fontSize: theme.size.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</div>
                <div style={{ color: theme.colors.dim, fontSize: theme.size.tiny, fontFamily: theme.font.mono }}>
                  {site.lat.toFixed(4)}, {site.lon.toFixed(4)}{site.elevFt != null ? ` · ${altitudeText(site.elevFt, units.altitude)}` : ''}
                </div>
              </span>
            </button>
            {confirmDelete === site.id ? (
              <>
                <button onClick={() => { remove(site.id); setConfirmDelete(null) }} style={{ ...buttonStyle(), color: theme.colors.red, padding: '6px 10px' }}>Delete</button>
                <button onClick={() => setConfirmDelete(null)} style={{ ...buttonStyle(), padding: '6px 10px' }}>✕</button>
              </>
            ) : (
              <>
                <button onClick={() => setForm({ site })} aria-label="Edit" style={{ ...buttonStyle(), padding: '6px' }}>✎</button>
                <button onClick={() => setConfirmDelete(site.id)} aria-label="Delete" style={{ ...buttonStyle(), padding: '6px', color: theme.colors.dim }}>🗑</button>
              </>
            )}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button onClick={() => setForm({})} style={{ ...buttonStyle(), flex: 1 }}>+ Coordinates</button>
        <button
          onClick={() => position && setForm({ initial: { lat: position.lat, lon: position.lon } })}
          disabled={!position}
          style={{ ...buttonStyle(false, !position), flex: 1 }}
        >+ My position</button>
      </div>
      {form && <LaunchSiteForm site={form.site} initial={form.initial} onClose={() => setForm(null)} />}
    </div>
  )
}
