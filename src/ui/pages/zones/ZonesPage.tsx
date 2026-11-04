import { useEffect, useRef, useState } from 'react'
import { theme } from '../../theme'
import { useZoneStore } from '../../../state/zone-store'
import { ZONE_RATINGS } from '../../../data/logic/zone-logic'
import { buttonStyle, chipStyle, sectionStyle, sectionTitle } from '../plan/plan-styles'
import { ZONE_COLORS } from '../map/zone-layers'
import { ZoneRow } from './ZoneRow'
import { DrawZonePanel } from './DrawZonePanel'

/** Import KML/KMZ/GeoJSON areas and rate each: good, caution, do not land. */
export function ZonesPage() {
  const { zones, load, importFile, removeSource, showOnFlightMap, defaultRating, setSetting } = useZoneStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [confirmSource, setConfirmSource] = useState<string | null>(null)

  useEffect(() => { load() }, [load])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const msgs: string[] = []
    for (const f of files) msgs.push(`${f.name}: ${await importFile(f)}`)
    setStatus(msgs.join('\n') || null)
  }

  const sources = [...new Set(zones.map(z => z.source))]

  return (
    <div style={{ padding: '12px', fontFamily: theme.font.primary, color: theme.colors.light }}>
      <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '10px' }}>Zones</div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>Zone map</div>
        <DrawZonePanel />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>Import areas</div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, lineHeight: 1.4, marginBottom: '8px' }}>
          KML, KMZ or GeoJSON polygons. Each area is rated from its name or color when it says
          (e.g. green fill, “LZ”, “no landing”); otherwise it gets the rating below. Change any rating after import.
        </div>
        <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginBottom: '4px' }}>Unrated areas become</div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          {ZONE_RATINGS.map(r => (
            <button key={r.id} onClick={() => setSetting('defaultRating', r.id)}
              style={{ ...chipStyle(defaultRating === r.id), borderColor: defaultRating === r.id ? ZONE_COLORS[r.id] : theme.colors.darkBorder }}>
              <span style={{ color: ZONE_COLORS[r.id] }}>■</span> {r.short}
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" multiple accept=".kml,.kmz,.geojson,.json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json"
          onChange={handleFile} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} style={{ ...buttonStyle(true), width: '100%' }}>Import KML / GeoJSON</button>
        {status && <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginTop: '8px', whiteSpace: 'pre-line' }}>{status}</div>}
        <button onClick={() => setSetting('showOnFlightMap', !showOnFlightMap)}
          style={{ ...chipStyle(showOnFlightMap), width: '100%', marginTop: '10px', flex: 'none' }}>
          {showOnFlightMap ? '✓ Shown on flying map' : 'Show on flying map'}
        </button>
        <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '4px' }}>Zones always show on the Flight Plan map.</div>
      </div>

      {sources.length === 0 && (
        <div style={{ color: theme.colors.dim, fontSize: theme.size.small }}>No zones yet.</div>
      )}
      {sources.map(source => (
        <div key={source} style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ ...sectionTitle, marginBottom: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }}>{source}</div>
            {confirmSource === source ? (
              <>
                <button onClick={() => { removeSource(source); setConfirmSource(null) }} style={{ ...buttonStyle(), color: theme.colors.red, padding: '6px 10px' }}>Delete all</button>
                <button onClick={() => setConfirmSource(null)} style={{ ...buttonStyle(), padding: '6px 10px' }}>✕</button>
              </>
            ) : (
              <button onClick={() => setConfirmSource(source)} aria-label="Delete file's zones" style={{ ...buttonStyle(), padding: '6px', color: theme.colors.dim }}>🗑</button>
            )}
          </div>
          {zones.filter(z => z.source === source).map(z => <ZoneRow key={z.id} zone={z} />)}
        </div>
      ))}
    </div>
  )
}
