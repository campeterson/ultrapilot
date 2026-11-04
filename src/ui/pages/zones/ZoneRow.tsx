import { useState } from 'react'
import { theme } from '../../theme'
import { useZoneStore } from '../../../state/zone-store'
import { ZONE_RATINGS } from '../../../data/logic/zone-logic'
import type { Zone } from '../../../data/models'
import { buttonStyle, inputStyle } from '../plan/plan-styles'
import { ZONE_COLORS } from '../map/zone-layers'

/** One zone: name (tap to rename), rating buttons, delete. */
export function ZoneRow({ zone }: { zone: Zone }) {
  const { setRating, rename, remove } = useZoneStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(zone.name)

  function commit() {
    setEditing(false)
    if (name.trim() && name.trim() !== zone.name) rename(zone.id, name.trim())
    else setName(zone.name)
  }

  return (
    <div style={{ borderTop: `1px solid ${theme.colors.darkBorder}`, padding: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0, background: ZONE_COLORS[zone.rating] }} />
        {editing ? (
          <input style={{ ...inputStyle, flex: 1 }} value={name} autoFocus onChange={e => setName(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit() }} />
        ) : (
          <button onClick={() => setEditing(true)}
            style={{ flex: 1, minHeight: theme.tapTarget, background: 'none', border: 'none', textAlign: 'left', color: theme.colors.cream, fontFamily: theme.font.primary, fontSize: theme.size.body, cursor: 'pointer', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {zone.name}
          </button>
        )}
        <button onClick={() => remove(zone.id)} aria-label="Delete zone" style={{ ...buttonStyle(), padding: '6px', color: theme.colors.dim }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        {ZONE_RATINGS.map(r => {
          const on = zone.rating === r.id
          return (
            <button key={r.id} onClick={() => setRating(zone.id, r.id)}
              style={{ flex: 1, minHeight: theme.tapTarget, borderRadius: '8px', cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small,
                border: `1px solid ${on ? ZONE_COLORS[r.id] : theme.colors.darkBorder}`,
                background: on ? `${ZONE_COLORS[r.id]}33` : 'none', color: on ? theme.colors.cream : theme.colors.dim }}>
              {r.short}
            </button>
          )
        })}
      </div>
    </div>
  )
}
