import { theme } from '../../theme'
import { usePlacesStore } from '../../../state/places-store'
import { PLACE_CATEGORIES } from '../../../data/logic/place-logic'
import type { Place, PlaceCategory } from '../../../data/models'
import { buttonStyle } from '../plan/plan-styles'
import { CATEGORY_COLORS } from '../map/place-layers'

/** One place: shape + name (tap to edit), type picker, delete. */
export function PlaceRow({ place, onEdit }: { place: Place; onEdit: () => void }) {
  const { update, remove } = usePlacesStore()
  const color = CATEGORY_COLORS[place.category]
  const area = place.geometry.type === 'MultiPolygon'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: `1px solid ${theme.colors.darkBorder}`, padding: '4px 0' }}>
      <span title={area ? 'Area' : 'Point'} style={{ width: '14px', height: '14px', flexShrink: 0, background: area ? `${color}66` : color,
        border: `2px solid ${color}`, borderRadius: area ? '3px' : '50%' }} />
      <button onClick={onEdit}
        style={{ flex: 1, minWidth: 0, minHeight: theme.tapTarget, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, fontFamily: theme.font.primary }}>
        <div style={{ color: theme.colors.cream, fontSize: theme.size.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</div>
        <div style={{ color: theme.colors.dim, fontSize: theme.size.tiny, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{area ? 'Area' : 'Point'} · {place.source}</div>
      </button>
      <select value={place.category} onChange={e => update(place.id, { category: e.target.value as PlaceCategory })}
        aria-label="Type"
        style={{ minHeight: theme.tapTarget, maxWidth: '120px', borderRadius: '8px', border: `1px solid ${color}`, background: theme.colors.darkCard,
          color: theme.colors.cream, fontFamily: theme.font.primary, fontSize: theme.size.small, padding: '0 6px', colorScheme: 'dark' }}>
        {PLACE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.short}</option>)}
      </select>
      <button onClick={() => remove(place.id)} aria-label="Delete place" style={{ ...buttonStyle(), padding: '6px', color: theme.colors.dim }}>✕</button>
    </div>
  )
}
