import { useState } from 'react'
import { theme } from '../../theme'
import { useLiveGroupStore, type LiveProfile } from '../../../state/live-group-store'
import { useFlightModeStore } from '../../../state/flight-mode-store'
import { defaultRole, isGroundRole, LIVE_ROLES, MAX_CALLSIGN, type LiveRole } from '../../../data/logic/live-logic'
import { normalizeHex } from '../../../data/logic/traffic-logic'
import { buttonStyle, inputStyle, labelStyle } from '../plan/plan-styles'

/** Callsign + role, kept on this device and reused for every group. */
export function LiveProfileForm({ onDone }: { onDone?: () => void }) {
  const { profile, setProfile } = useLiveGroupStore()
  const mode = useFlightModeStore(s => s.mode)
  const [callsign, setCallsign] = useState(profile?.callsign ?? '')
  const [role, setRole] = useState<LiveRole>(profile?.role ?? defaultRole(mode))
  const [hex, setHex] = useState(profile?.hex ?? '')
  const hexOk = !hex.trim() || normalizeHex(hex) != null
  const valid = callsign.trim().length > 0 && hexOk

  async function save() {
    if (!valid) return
    const p: LiveProfile = { callsign: callsign.trim().slice(0, MAX_CALLSIGN), role, hex: isGroundRole(role) ? null : normalizeHex(hex) }
    await setProfile(p)
    onDone?.()
  }

  return (
    <div>
      <label style={labelStyle}>Callsign — tail number, “BALLOON 1”, “CHASE”, or your name</label>
      <input style={inputStyle} value={callsign} maxLength={MAX_CALLSIGN} placeholder="Callsign"
        onChange={e => setCallsign(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') void save() }} />
      <label style={{ ...labelStyle, marginTop: '10px' }}>Role</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {LIVE_ROLES.map(r => {
          const on = role === r.id
          const color = theme.colors.liveRoles[r.id]
          return (
            <button key={r.id} onClick={() => setRole(r.id)}
              style={{ flex: '1 1 30%', minHeight: theme.tapTarget, borderRadius: '8px', cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small,
                border: `1px solid ${on ? color : theme.colors.darkBorder}`, background: on ? `${color}33` : 'none', color: on ? theme.colors.cream : theme.colors.dim }}>
              {r.label}
            </button>
          )
        })}
      </div>
      {!isGroundRole(role) && (
        <>
          <label style={{ ...labelStyle, marginTop: '10px' }}>ADS-B Out hex code (optional) — so traffic doesn’t show your own aircraft</label>
          <input style={{ ...inputStyle, fontFamily: theme.font.mono, borderColor: hexOk ? undefined : theme.colors.red }} value={hex} maxLength={8} placeholder="e.g. A1B2C3"
            aria-label="ADS-B hex code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={e => setHex(e.target.value.toUpperCase())} />
          {!hexOk && <div style={{ color: theme.colors.red, fontSize: theme.size.tiny, marginTop: '4px' }}>6 characters, 0–9 and A–F</div>}
        </>
      )}
      <button onClick={save} disabled={!valid} style={{ ...buttonStyle(true, !valid), width: '100%', marginTop: '10px' }}>Save</button>
    </div>
  )
}
