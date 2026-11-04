import { useState } from 'react'
import { theme } from '../../theme'
import { usePlacesStore, type PendingPlace } from '../../../state/places-store'
import { useUnits } from '../../hooks/useUnits'
import { coordinateError } from '../../../data/logic/plan-logic'
import { PLACE_CATEGORIES, placeAnchor } from '../../../data/logic/place-logic'
import { altitudeToFeet, convertAltitude, ALTITUDE_LABELS } from '../../../data/logic/units-logic'
import type { Place, PlaceCategory } from '../../../data/models'
import { buttonStyle, inputStyle, labelStyle } from '../plan/plan-styles'
import { CATEGORY_COLORS } from '../map/place-layers'

interface Props {
  /** Editing an existing place; otherwise a new point at `initial`. */
  place?: Place
  initial?: PendingPlace
  onClose: () => void
}

/** The form for a point started from a map tap (any map). */
export function PendingPlaceForm() {
  const { pending, setPending } = usePlacesStore()
  if (!pending) return null
  return <PlaceForm initial={pending} onClose={() => setPending(null)} />
}

/** Add or edit a place: name, category, and for points the coordinates. */
export function PlaceForm({ place, initial, onClose }: Props) {
  const units = useUnits()
  const { addPoint, update, places } = usePlacesStore()
  const isArea = place?.geometry.type === 'MultiPolygon'
  const anchor = place ? placeAnchor(place) : initial ? [initial.lon, initial.lat] : null
  const elev0 = place?.elevFt ?? initial?.elevFt ?? null
  const [category, setCategory] = useState<PlaceCategory>(place?.category ?? initial?.category ?? 'launch')
  const [name, setName] = useState(place?.name ?? initial?.name ?? `Place ${places.length + 1}`)
  const fmt = (v: number | undefined) => (v != null && Number.isFinite(v) ? v.toFixed(5) : '')
  const [lat, setLat] = useState(fmt(anchor?.[1]))
  const [lon, setLon] = useState(fmt(anchor?.[0]))
  const [elev, setElev] = useState(elev0 == null ? '' : String(Math.round(convertAltitude(elev0, units.altitude))))
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const la = parseFloat(lat), lo = parseFloat(lon)
    const err = !name.trim() ? 'Name is required' : isArea ? null : coordinateError(la, lo)
    if (err) { setError(err); return }
    const e = elev.trim() === '' ? null : parseFloat(elev)
    if (e !== null && !Number.isFinite(e)) { setError('Elevation must be a number'); return }
    const elevFt = e === null ? null : Math.round(altitudeToFeet(e, units.altitude))
    if (place) await update(place.id, { name: name.trim(), category, elevFt, ...(isArea ? {} : { lat: la, lon: lo }) })
    else await addPoint(name.trim(), category, la, lo, elevFt)
    onClose()
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: theme.colors.darkCard, border: `1px solid ${theme.colors.darkBorder}`, borderRadius: '16px', padding: '20px', width: 'min(340px, calc(100vw - 32px))', fontFamily: theme.font.primary, boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream, marginBottom: '14px' }}>
          {place ? `Edit ${isArea ? 'Area' : 'Point'}` : 'Add Place'}
        </div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus />
        <label style={{ ...labelStyle, marginTop: '10px' }}>Type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
        {isArea ? (
          category === 'launch' && <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '8px' }}>Flight plan uses the area’s first corner: {lat}, {lon}</div>
        ) : (
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
        )}
        {category === 'launch' && (
          <>
            <label style={{ ...labelStyle, marginTop: '10px' }}>Elevation ({ALTITUDE_LABELS[units.altitude]} MSL) — blank uses forecast terrain</label>
            <input style={inputStyle} value={elev} onChange={e => setElev(e.target.value)} inputMode="numeric" placeholder="auto" />
          </>
        )}
        {error && <div style={{ color: theme.colors.red, fontSize: theme.size.small, marginTop: '8px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={onClose} style={{ ...buttonStyle(), flex: 1 }}>Cancel</button>
          <button onClick={handleSave} style={{ ...buttonStyle(true), flex: 1 }}>Save</button>
        </div>
      </div>
    </div>
  )
}
