import { useEffect, useRef, useState } from 'react'
import { theme } from '../../theme'
import { useHasPanelTitleBar } from '../../shell/panel-title-context'
import { usePlacesStore, ADDED_SOURCE } from '../../../state/places-store'
import { PLACE_CATEGORIES } from '../../../data/logic/place-logic'
import { DRAWN_SOURCE, ZONE_RATINGS } from '../../../data/logic/zone-logic'
import { buttonStyle, chipStyle, sectionStyle, sectionTitle } from '../plan/plan-styles'
import { CATEGORY_COLORS } from '../map/place-layers'
import { AddPlacePanel } from './AddPlacePanel'
import { PlaceRow } from './PlaceRow'
import { PlaceForm } from './PlaceForm'

const ACCEPT = '.kml,.kmz,.geojson,.json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json'

/** Points and areas: launch sites, landing-zone ratings, points of interest. */
export function PlacesPage() {
  const hasTitleBar = useHasPanelTitleBar()
  const { places, load, importFile, exportPlaces, removeSource, showOnFlightMap, defaultRating, setSetting } = usePlacesStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [confirmSource, setConfirmSource] = useState<string | null>(null)

  useEffect(() => { load() }, [load])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const msgs: string[] = []
    for (const f of files) msgs.push(`${f.name}: ${await importFile(f)}`)
    setStatus(msgs.join('\n') || null)
  }

  const files = [...new Set(places.map(p => p.source))].filter(s => s !== ADDED_SOURCE && s !== DRAWN_SOURCE)
  const editing = places.find(p => p.id === editId)
  const small: React.CSSProperties = { fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '6px', lineHeight: 1.4 }

  return (
    <div style={{ padding: '12px', fontFamily: theme.font.primary, color: theme.colors.light }}>
      {!hasTitleBar && <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '10px' }}>Places</div>}

      <div style={sectionStyle}>
        <AddPlacePanel />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>Import / export</div>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} onChange={handleFile} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} style={{ ...buttonStyle(true), width: '100%' }}>Import KML / KMZ / GeoJSON</button>
        {status && <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginTop: '8px', whiteSpace: 'pre-line' }}>{status}</div>}
        <div style={small}>Points and areas are imported (lines are skipped). Type comes from the file when it says (UltraPilot exports, names like “LZ” or “no landing”, green/yellow/red colors); unrated areas become:</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          {ZONE_RATINGS.map(r => (
            <button key={r.id} onClick={() => setSetting('defaultRating', r.id)}
              style={{ ...chipStyle(defaultRating === r.id), borderColor: defaultRating === r.id ? CATEGORY_COLORS[r.id] : theme.colors.darkBorder }}>
              {r.short}
            </button>
          ))}
        </div>
        <div style={small}>Points with no type become points of interest.</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          <button disabled={!places.length} onClick={() => exportPlaces('geojson', places, 'UltraPilot places')} style={{ ...buttonStyle(false, !places.length), flex: 1 }}>Export GeoJSON</button>
          <button disabled={!places.length} onClick={() => exportPlaces('kml', places, 'UltraPilot places')} style={{ ...buttonStyle(false, !places.length), flex: 1 }}>Export KML</button>
        </div>
        <button onClick={() => setSetting('showOnFlightMap', !showOnFlightMap)}
          style={{ ...chipStyle(showOnFlightMap), width: '100%', marginTop: '10px', flex: 'none' }}>
          {showOnFlightMap ? '✓ Shown on flying map' : 'Show on flying map'}
        </button>
      </div>

      {places.length === 0 && <div style={{ color: theme.colors.dim, fontSize: theme.size.small }}>No places yet.</div>}
      {PLACE_CATEGORIES.map(c => {
        const list = places.filter(p => p.category === c.id)
        if (!list.length) return null
        return (
          <div key={c.id} style={sectionStyle}>
            <div style={{ ...sectionTitle, color: CATEGORY_COLORS[c.id] }}>{c.label} · {list.length}</div>
            {list.map(p => <PlaceRow key={p.id} place={p} onEdit={() => setEditId(p.id)} />)}
          </div>
        )
      })}

      {files.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>Imported files</div>
          {files.map(f => {
            const n = places.filter(p => p.source === f).length
            return (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: `1px solid ${theme.colors.darkBorder}`, padding: '4px 0' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: theme.size.small, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f} · {n}</span>
                {confirmSource === f ? (
                  <>
                    <button onClick={() => { removeSource(f); setConfirmSource(null) }} style={{ ...buttonStyle(), color: theme.colors.red, padding: '6px 10px' }}>Delete {n}</button>
                    <button onClick={() => setConfirmSource(null)} style={{ ...buttonStyle(), padding: '6px 10px' }}>✕</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmSource(f)} aria-label={`Delete places from ${f}`} style={{ ...buttonStyle(), padding: '6px', color: theme.colors.dim }}>🗑</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing && <PlaceForm place={editing} onClose={() => setEditId(null)} />}
    </div>
  )
}
