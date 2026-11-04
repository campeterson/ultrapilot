import { useState } from 'react'
import { theme } from '../../theme'
import { usePlacesStore } from '../../../state/places-store'
import { MIN_ZONE_POINTS } from '../../../data/logic/zone-logic'
import { PLACE_CATEGORIES } from '../../../data/logic/place-logic'
import type { PlaceCategory } from '../../../data/models'
import { buttonStyle, inputStyle } from '../plan/plan-styles'
import { CATEGORY_COLORS } from '../map/place-layers'
import { PlacesMap, type LonLat } from './PlacesMap'
import { PlaceForm } from './PlaceForm'

/** Places map + add controls: tap to add a point, or tap corners to draw an area. */
export function AddPlacePanel() {
  const { addArea, places, setPending } = usePlacesStore()
  const [mode, setMode] = useState<'idle' | 'point' | 'area'>('idle')
  const [draft, setDraft] = useState<LonLat[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<PlaceCategory>('good')
  const [editId, setEditId] = useState<string | null>(null)

  const count = draft?.length ?? 0
  const canFinish = count >= MIN_ZONE_POINTS
  const editing = places.find(p => p.id === editId)

  function startArea() { setMode('area'); setDraft([]); setNaming(false); setName(`Area ${places.length + 1}`) }
  function cancel() { setMode('idle'); setDraft(null); setNaming(false) }
  async function saveArea() {
    if (!draft || !name.trim()) return
    if (await addArea(name.trim(), category, draft)) cancel()
  }

  const row: React.CSSProperties = { display: 'flex', gap: '6px', marginTop: '8px' }
  const hint: React.CSSProperties = { fontSize: theme.size.small, color: theme.colors.light, marginTop: '8px' }
  return (
    <div>
      <PlacesMap draft={draft} draftCategory={category} pointMode={mode === 'point'}
        onAddPoint={p => !naming && setDraft(d => (d ? [...d, p] : d))}
        onClose={() => canFinish && setNaming(true)}
        onPlacePoint={([lon, lat]) => { setMode('idle'); setPending({ lat, lon, category: 'poi', name: `Point ${places.length + 1}` }) }}
        onSelect={setEditId} />

      {mode === 'idle' && (
        <>
          <div style={row}>
            <button onClick={() => setMode('point')} style={{ ...buttonStyle(), flex: 1 }}>+ Add point</button>
            <button onClick={startArea} style={{ ...buttonStyle(), flex: 1 }}>✎ Draw area</button>
          </div>
          <div style={{ ...hint, color: theme.colors.dim, fontSize: theme.size.tiny }}>Tap a place on the map to edit it.</div>
        </>
      )}

      {mode === 'point' && (
        <>
          <div style={hint}>Tap the map where the point goes.</div>
          <div style={row}><button onClick={cancel} style={{ ...buttonStyle(), flex: 1 }}>Cancel</button></div>
        </>
      )}

      {mode === 'area' && !naming && (
        <>
          <div style={hint}>
            {count === 0 ? 'Tap the map to place the first corner.'
              : canFinish ? `${count} corners — keep tapping, or tap the first corner / Done to finish.`
              : `${count} corner${count === 1 ? '' : 's'} — at least ${MIN_ZONE_POINTS} needed.`}
          </div>
          <div style={row}>
            <button onClick={cancel} style={{ ...buttonStyle(), flex: 1 }}>Cancel</button>
            <button onClick={() => setDraft(d => d?.slice(0, -1) ?? d)} disabled={count === 0} style={{ ...buttonStyle(false, count === 0), flex: 1 }}>Undo</button>
            <button onClick={() => setNaming(true)} disabled={!canFinish} style={{ ...buttonStyle(true, !canFinish), flex: 1 }}>Done</button>
          </div>
        </>
      )}

      {mode === 'area' && naming && (
        <div style={{ marginTop: '8px' }}>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Area name" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveArea() }} />
          <div style={{ ...row, flexWrap: 'wrap' }}>
            {PLACE_CATEGORIES.map(c => {
              const on = category === c.id
              return (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  style={{ flex: '1 1 30%', minHeight: theme.tapTarget, borderRadius: '8px', cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small,
                    border: `1px solid ${on ? CATEGORY_COLORS[c.id] : theme.colors.darkBorder}`, background: on ? `${CATEGORY_COLORS[c.id]}33` : 'none',
                    color: on ? theme.colors.cream : theme.colors.dim }}>
                  {c.label}
                </button>
              )
            })}
          </div>
          {category === 'launch' && <div style={{ ...hint, color: theme.colors.dim, fontSize: theme.size.tiny }}>The flight plan launches from the first corner you tapped.</div>}
          <div style={row}>
            <button onClick={() => setNaming(false)} style={{ ...buttonStyle(), flex: 1 }}>Back</button>
            <button onClick={saveArea} disabled={!name.trim()} style={{ ...buttonStyle(true, !name.trim()), flex: 1 }}>Save area</button>
          </div>
        </div>
      )}

      {editing && <PlaceForm place={editing} onClose={() => setEditId(null)} />}
    </div>
  )
}
