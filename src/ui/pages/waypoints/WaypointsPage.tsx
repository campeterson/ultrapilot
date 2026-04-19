import { useEffect, useState } from 'react'
import { theme } from '../../theme'
import { useWaypointStore } from '../../../state/waypoint-store'
import { useRouteStore } from '../../../state/route-store'
import { useGPSStore } from '../../../state/gps-store'
import { useSessionStore } from '../../../state/session-store'
import { useDirectToStore } from '../../../state/direct-to-store'
import type { Waypoint } from '../../../data/models'

function newId() {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

interface FormState {
  name: string
  lat: string
  lon: string
  note: string
}

const EMPTY_FORM: FormState = { name: '', lat: '', lon: '', note: '' }

export function WaypointsPage() {
  const { waypoints, loading, load, save, remove, shareWaypoint, shareAllWaypoints } = useWaypointStore()
  const { importFile } = useRouteStore()
  const { position } = useGPSStore()
  const { session } = useSessionStore()
  const { setTarget: setDirectTo } = useDirectToStore()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [detailWp, setDetailWp] = useState<Waypoint | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  useEffect(() => { load() }, [load])

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const msg = await importFile(file)
    setImportStatus(msg)
    setTimeout(() => setImportStatus(null), 4000)
  }

  function openNew() {
    setForm({ ...EMPTY_FORM, name: `Waypoint ${waypoints.length + 1}` })
    setError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    const lat = parseFloat(form.lat)
    const lon = parseFloat(form.lon)
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (isNaN(lat) || lat < -90 || lat > 90) { setError('Latitude must be −90 to 90.'); return }
    if (isNaN(lon) || lon < -180 || lon > 180) { setError('Longitude must be −180 to 180.'); return }

    const w: Waypoint = {
      id: newId(),
      name: form.name.trim(),
      lat,
      lon,
      note: form.note.trim() || null,
      createdAt: new Date().toISOString(),
    }
    await save(w)
    setFormOpen(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.colors.darkBorder}`,
    background: 'rgba(255,255,255,0.05)',
    color: theme.colors.cream,
    fontFamily: theme.font.primary,
    fontSize: theme.size.body,
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: theme.size.small,
    color: theme.colors.dim,
    fontFamily: theme.font.primary,
    marginBottom: '4px',
    display: 'block',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${theme.colors.darkBorder}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream, flex: 1 }}>Waypoints</span>
        <input
          id="wp-import-input"
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        <label
          htmlFor="wp-import-input"
          style={{
            padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`,
            color: theme.colors.light, cursor: 'pointer', fontSize: theme.size.body,
            fontFamily: theme.font.primary, minHeight: theme.tapTarget,
            display: 'flex', alignItems: 'center',
          }}
        >
          Import
        </label>
        {waypoints.length > 0 && (
          <button
            onClick={() => shareAllWaypoints()}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`,
              background: 'none', color: theme.colors.light, cursor: 'pointer',
              fontSize: theme.size.body, fontFamily: theme.font.primary, minHeight: theme.tapTarget,
            }}
          >
            Share All
          </button>
        )}
        <button
          onClick={openNew}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            background: theme.colors.red, color: '#fff', cursor: 'pointer',
            fontSize: theme.size.body, fontWeight: 700, fontFamily: theme.font.primary,
            minHeight: theme.tapTarget,
          }}
        >
          + New
        </button>
      </div>

      {/* Import status toast */}
      {importStatus && (
        <div style={{
          padding: '10px 16px', background: theme.colors.darkCard,
          borderBottom: `1px solid ${theme.colors.darkBorder}`,
          fontSize: theme.size.small, color: theme.colors.cream,
        }}>
          {importStatus}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim, fontSize: theme.size.body }}>Loading…</div>
        )}
        {!loading && waypoints.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⌖</div>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.body }}>No waypoints yet.</div>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.small, marginTop: '6px' }}>Tap + New or long-press the map.</div>
          </div>
        )}
        {waypoints.map(wp => (
          <WaypointRow key={wp.id} waypoint={wp} onTap={() => setDetailWp(wp)} />
        ))}
      </div>

      {/* Waypoint detail modal */}
      {detailWp && (
        <div
          onClick={() => setDetailWp(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 16px',
            zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.colors.darkCard,
              border: `1px solid ${theme.colors.darkBorder}`,
              borderRadius: '16px',
              padding: '24px',
              width: 'min(320px, calc(100vw - 32px))',
              fontFamily: theme.font.primary,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream }}>{detailWp.name}</div>
                <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '4px' }}>
                  {detailWp.lat.toFixed(5)}, {detailWp.lon.toFixed(5)}
                </div>
              </div>
              <button
                onClick={() => setDetailWp(null)}
                style={{
                  background: 'none', border: 'none', color: theme.colors.dim,
                  cursor: 'pointer', fontSize: '20px', padding: '0 0 0 12px',
                  minHeight: theme.tapTarget, flexShrink: 0,
                }}
              >✕</button>
            </div>

            {detailWp.note && (
              <div style={{
                fontSize: theme.size.body, color: theme.colors.light,
                background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                padding: '10px 12px', marginBottom: '16px',
              }}>
                {detailWp.note}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {session && (
                <button
                  onClick={() => {
                    setDirectTo({
                      lat: detailWp.lat,
                      lon: detailWp.lon,
                      name: detailWp.name,
                      fromLat: position?.lat ?? detailWp.lat,
                      fromLon: position?.lon ?? detailWp.lon,
                    })
                    setDetailWp(null)
                  }}
                  style={{
                    padding: '12px', borderRadius: '8px', border: 'none',
                    background: theme.colors.red, color: '#fff', cursor: 'pointer',
                    fontFamily: theme.font.primary, fontSize: theme.size.body,
                    fontWeight: 700, minHeight: theme.tapTarget,
                    letterSpacing: '0.04em',
                  }}
                >
                  ◇ Direct To
                </button>
              )}
              <button
                onClick={() => { shareWaypoint(detailWp.id); setDetailWp(null) }}
                style={{
                  padding: '12px', borderRadius: '8px',
                  border: `1px solid ${theme.colors.darkBorder}`,
                  background: 'none', color: theme.colors.magenta, cursor: 'pointer',
                  fontFamily: theme.font.primary, fontSize: theme.size.body,
                  minHeight: theme.tapTarget,
                }}
              >
                ↑ Share Waypoint
              </button>
              <button
                onClick={() => { remove(detailWp.id); setDetailWp(null) }}
                style={{
                  padding: '12px', borderRadius: '8px',
                  border: `1px solid ${theme.colors.darkBorder}`,
                  background: 'none', color: theme.colors.dim, cursor: 'pointer',
                  fontFamily: theme.font.primary, fontSize: theme.size.body,
                  minHeight: theme.tapTarget,
                }}
              >
                Delete Waypoint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New waypoint modal */}
      {formOpen && (
        <div
          onClick={() => setFormOpen(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '60px',
            paddingBottom: theme.safeNavHeight,
            overflowY: 'auto',
            zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.colors.darkCard,
              border: `1px solid ${theme.colors.darkBorder}`,
              borderRadius: '16px',
              padding: '24px',
              width: 'min(320px, calc(100vw - 32px))',
              fontFamily: theme.font.primary,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: theme.colors.cream, marginBottom: '20px' }}>New Waypoint</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Landing field"
                />
              </div>
              {position && (
                <button
                  onClick={() => setForm(f => ({ ...f, lat: position.lat.toFixed(6), lon: position.lon.toFixed(6) }))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.colors.darkBorder}`,
                    background: 'rgba(255,255,255,0.05)',
                    color: theme.colors.light,
                    cursor: 'pointer',
                    fontFamily: theme.font.primary,
                    fontSize: theme.size.small,
                    textAlign: 'left',
                    minHeight: theme.tapTarget,
                  }}
                >
                  ⌖ Use current location — {position.lat.toFixed(5)}, {position.lon.toFixed(5)}
                </button>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Latitude (decimal)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                    placeholder="38.9517"
                    inputMode="decimal"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Longitude (decimal)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    step="any"
                    value={form.lon}
                    onChange={e => setForm(f => ({ ...f, lon: e.target.value }))}
                    placeholder="-92.3341"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Note (optional)</label>
                <input
                  style={inputStyle}
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Grass strip, N/S runway"
                />
              </div>
            </div>

            {error && (
              <div style={{ color: theme.colors.red, fontSize: theme.size.small, marginTop: '10px' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setFormOpen(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: `1px solid ${theme.colors.darkBorder}`,
                  background: 'none', color: theme.colors.light, cursor: 'pointer',
                  fontFamily: theme.font.primary, fontSize: theme.size.body,
                  minHeight: theme.tapTarget,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: 'none', background: theme.colors.red, color: '#fff',
                  cursor: 'pointer', fontFamily: theme.font.primary,
                  fontSize: theme.size.body, fontWeight: 700,
                  minHeight: theme.tapTarget,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WaypointRow({ waypoint, onTap }: { waypoint: Waypoint; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.colors.darkBorder}`,
        background: 'none',
        border: 'none',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: theme.colors.darkBorder,
        cursor: 'pointer',
        textAlign: 'left',
        minHeight: theme.tapTarget,
        fontFamily: theme.font.primary,
      }}
    >
      <span style={{ fontSize: '18px', color: theme.colors.dim, flexShrink: 0 }}>⌖</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: theme.size.body, fontWeight: 700, color: theme.colors.cream, marginBottom: '2px' }}>{waypoint.name}</div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono }}>
          {waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)}
        </div>
        {waypoint.note && (
          <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginTop: '2px' }}>{waypoint.note}</div>
        )}
      </div>
      <span style={{ fontSize: theme.size.small, color: theme.colors.dim, flexShrink: 0 }}>›</span>
    </button>
  )
}
