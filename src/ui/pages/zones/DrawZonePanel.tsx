import { useState } from 'react'
import { theme } from '../../theme'
import { useZoneStore } from '../../../state/zone-store'
import { DRAWN_SOURCE, MIN_ZONE_POINTS, ZONE_RATINGS } from '../../../data/logic/zone-logic'
import type { ZoneRating } from '../../../data/models'
import { buttonStyle, inputStyle } from '../plan/plan-styles'
import { ZONE_COLORS } from '../map/zone-layers'
import { ZonesMap, type LonLat } from './ZonesMap'

/** Map + draw controls: tap corners, then name and rate the zone. */
export function DrawZonePanel() {
  const { addDrawn, zones } = useZoneStore()
  const [draft, setDraft] = useState<LonLat[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [rating, setRating] = useState<ZoneRating>('good')

  const count = draft?.length ?? 0
  const canFinish = count >= MIN_ZONE_POINTS

  function start() {
    setDraft([]); setNaming(false)
    setName(`Zone ${zones.filter(z => z.source === DRAWN_SOURCE).length + 1}`)
  }
  function cancel() { setDraft(null); setNaming(false) }
  async function save() {
    if (!draft || !name.trim()) return
    if (await addDrawn(name.trim(), rating, draft)) cancel()
  }

  const rowStyle: React.CSSProperties = { display: 'flex', gap: '6px', marginTop: '8px' }
  return (
    <div>
      <ZonesMap draft={draft} draftRating={rating}
        onAddPoint={p => !naming && setDraft(d => (d ? [...d, p] : d))}
        onClose={() => canFinish && setNaming(true)} />

      {!draft && (
        <button onClick={start} style={{ ...buttonStyle(), width: '100%', marginTop: '8px' }}>✎ Draw a zone</button>
      )}

      {draft && !naming && (
        <>
          <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginTop: '8px' }}>
            {count === 0 ? 'Tap the map to place the first corner.'
              : canFinish ? `${count} corners — keep tapping, or tap the first corner / Done to finish.`
              : `${count} corner${count === 1 ? '' : 's'} — at least ${MIN_ZONE_POINTS} needed.`}
          </div>
          <div style={rowStyle}>
            <button onClick={cancel} style={{ ...buttonStyle(), flex: 1 }}>Cancel</button>
            <button onClick={() => setDraft(d => d?.slice(0, -1) ?? d)} disabled={count === 0} style={{ ...buttonStyle(false, count === 0), flex: 1 }}>Undo</button>
            <button onClick={() => setNaming(true)} disabled={!canFinish} style={{ ...buttonStyle(true, !canFinish), flex: 1 }}>Done</button>
          </div>
        </>
      )}

      {draft && naming && (
        <div style={{ marginTop: '8px' }}>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Zone name" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save() }} />
          <div style={rowStyle}>
            {ZONE_RATINGS.map(r => {
              const on = rating === r.id
              return (
                <button key={r.id} onClick={() => setRating(r.id)}
                  style={{ flex: 1, minHeight: theme.tapTarget, borderRadius: '8px', cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small,
                    border: `1px solid ${on ? ZONE_COLORS[r.id] : theme.colors.darkBorder}`, background: on ? `${ZONE_COLORS[r.id]}33` : 'none',
                    color: on ? theme.colors.cream : theme.colors.dim }}>
                  {r.short}
                </button>
              )
            })}
          </div>
          <div style={rowStyle}>
            <button onClick={() => setNaming(false)} style={{ ...buttonStyle(), flex: 1 }}>Back</button>
            <button onClick={save} disabled={!name.trim()} style={{ ...buttonStyle(true, !name.trim()), flex: 1 }}>Save zone</button>
          </div>
        </div>
      )}
    </div>
  )
}
