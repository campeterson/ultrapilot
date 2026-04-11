import { useState } from 'react'
import { useSessionStore } from '../../../state/session-store'
import { useInstrumentStore } from '../../../state/instrument-store'
import { useTimelineStore } from '../../../state/timeline-store'
import { useGPSStore } from '../../../state/gps-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout'
import { getTrackPoints, getEvents } from '../../../data/db'
import { toGPX, toJSON, downloadString, sessionFilename } from '../../../data/export'
import { theme } from '../../theme'
import { INSTRUMENT_LABELS, type InstrumentId } from '../../../data/models'

const ALL_INSTRUMENTS: InstrumentId[] = ['gs', 'agl', 'msl', 'vs', 'hdg', 'dist', 'brg', 'etime', 'sess', 'maxalt', 'dtk', 'dte', 'xtk', 'ete']
const OVERLAY_OPTIONS: Array<InstrumentId | null> = [null, 'gs', 'agl', 'msl', 'vs', 'hdg', 'dist', 'brg', 'etime', 'sess', 'maxalt', 'dtk', 'dte', 'xtk', 'ete']

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}`, minHeight: theme.tapTarget }}>
      <span style={{ fontSize: theme.size.body, color: theme.colors.light }}>{label}</span>
      {children}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: '10px 16px 6px', fontSize: theme.size.small, color: theme.colors.dim, letterSpacing: '0.08em', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      {title}
    </div>
  )
}

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '48px', height: '28px', borderRadius: '14px', border: 'none',
        background: value ? theme.colors.red : theme.colors.darkCard,
        cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
        outline: `1px solid ${theme.colors.darkBorder}`,
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: '4px',
        left: value ? '24px' : '4px',
        width: '20px', height: '20px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  )
}

/** Cycle through overlay options on each tap */
function OverlayCycleButton({ value, onSelect }: { value: InstrumentId | null; onSelect: (id: InstrumentId | null) => void }) {
  function cycle() {
    const idx = OVERLAY_OPTIONS.indexOf(value)
    onSelect(OVERLAY_OPTIONS[(idx + 1) % OVERLAY_OPTIONS.length] ?? null)
  }

  return (
    <button
      onClick={cycle}
      style={{
        padding: '8px 14px', borderRadius: '8px',
        border: `1px solid ${value ? theme.colors.red : theme.colors.darkBorder}`,
        background: value ? theme.colors.redDim : theme.colors.darkCard,
        color: value ? theme.colors.cream : theme.colors.dim,
        cursor: 'pointer', fontFamily: theme.font.primary,
        fontSize: theme.size.small, minHeight: '36px',
        whiteSpace: 'nowrap',
      }}
    >
      {value ? INSTRUMENT_LABELS[value] : 'Off'}
    </button>
  )
}

function InstrumentConfigurator() {
  const { strip, setStrip, mapLeft, mapRight, setMapLeft, setMapRight } = useInstrumentStore()
  const [selected, setSelected] = useState<InstrumentId[]>(strip)
  const layout = useResponsiveLayout()
  const isPhone = layout === 'phone'

  function toggle(id: InstrumentId) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id)
      if (prev.length >= 6) return prev
      return [...prev, id]
    })
  }

  function save() {
    setStrip(selected)
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Strip config */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Select up to 6 for the top strip. Tap to toggle.
        {isPhone && ' On mobile, only positions 1–4 are shown.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
        {ALL_INSTRUMENTS.map((id) => {
          const isSelected = selected.includes(id)
          const order = selected.indexOf(id)          // 0-based position in strip
          const hiddenOnMobile = isPhone && isSelected && order >= 4

          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              style={{
                padding: '10px 12px', borderRadius: '8px',
                border: `2px solid ${isSelected ? (hiddenOnMobile ? theme.colors.amber : theme.colors.red) : theme.colors.darkBorder}`,
                background: isSelected ? (hiddenOnMobile ? 'rgba(230,126,34,0.12)' : theme.colors.redDim) : theme.colors.dark,
                color: isSelected ? theme.colors.cream : theme.colors.light,
                cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small,
                textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                minHeight: theme.tapTarget,
              }}
            >
              <span>{INSTRUMENT_LABELS[id]}</span>
              {isSelected && (
                <span style={{
                  borderRadius: '4px',
                  background: hiddenOnMobile ? theme.colors.amber : theme.colors.red,
                  color: '#fff',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  marginLeft: '6px',
                }}>
                  {hiddenOnMobile ? 'hidden' : `#${order + 1}`}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <button
        onClick={save}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
          background: theme.colors.red, color: '#fff', cursor: 'pointer',
          fontFamily: theme.font.primary, fontSize: theme.size.body, fontWeight: 700,
          minHeight: theme.tapTarget, marginBottom: '20px',
        }}
      >
        Save Strip
      </button>

      {/* Map overlay config */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Map corner overlays — large floating instruments on the map.
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: theme.size.small, color: theme.colors.light, flex: 1 }}>Top Left</span>
        <OverlayCycleButton value={mapLeft} onSelect={setMapLeft} />
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span style={{ fontSize: theme.size.small, color: theme.colors.light, flex: 1 }}>Top Right</span>
        <OverlayCycleButton value={mapRight} onSelect={setMapRight} />
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { session, sessionStatus, endCurrentSession } = useSessionStore()
  const { maxAGLft } = useInstrumentStore()
  const { showDirectionLine, showDistanceRings, recordTrack, showInstrumentStrip, toggle } = useMapSettingsStore()
  const [showInstrConfig, setShowInstrConfig] = useState(false)

  async function handleExportGPX() {
    if (!session) return
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const gpx = toGPX(session, pts, evts)
    downloadString(gpx, sessionFilename(session, 'gpx'), 'application/gpx+xml')
  }

  async function handleExportJSON() {
    if (!session) return
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const json = toJSON(session, pts, evts)
    downloadString(json, sessionFilename(session, 'json'), 'application/json')
  }

  async function handleEndSession() {
    if (!session) return
    if (!confirm('End the current session?')) return
    const pos = useGPSStore.getState().position
    await endCurrentSession(maxAGLft, 0)
    const { addStamp } = useTimelineStore.getState()
    await addStamp({
      sessionId: session.id,
      ts: Date.now(),
      type: 'session_end',
      lat: pos?.lat ?? session.originLat,
      lon: pos?.lon ?? session.originLon,
      altMSL: pos?.altMSL ?? session.originAltMSL,
      altAGL: 0,
      speed: pos?.speed ?? 0,
      note: null,
    })
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      {session && sessionStatus === 'active' && (
        <>
          <SectionHeader title="CURRENT SESSION" />
          <Row label="Export GPX">
            <button onClick={handleExportGPX} style={actionBtn}>GPX</button>
          </Row>
          <Row label="Export JSON">
            <button onClick={handleExportJSON} style={actionBtn}>JSON</button>
          </Row>
          <Row label="End Session">
            <button onClick={handleEndSession} style={{ ...actionBtn, background: theme.colors.red }}>End</button>
          </Row>
        </>
      )}

      <SectionHeader title="RECORDING" />
      <Row label="Record GPS Track">
        <Toggle value={recordTrack} onToggle={() => toggle('recordTrack')} />
      </Row>

      <SectionHeader title="MAP DISPLAY" />
      <Row label="Direction Line">
        <Toggle value={showDirectionLine} onToggle={() => toggle('showDirectionLine')} />
      </Row>
      <Row label="Distance Rings (0.5 / 1 / 2 nm)">
        <Toggle value={showDistanceRings} onToggle={() => toggle('showDistanceRings')} />
      </Row>

      <SectionHeader title="INSTRUMENTS" />
      <Row label="Instrument Strip">
        <Toggle value={showInstrumentStrip} onToggle={() => toggle('showInstrumentStrip')} />
      </Row>
      <Row label="Configure Strip &amp; Overlays">
        <button onClick={() => setShowInstrConfig(v => !v)} style={actionBtn}>
          {showInstrConfig ? 'Hide' : 'Edit'}
        </button>
      </Row>
      {showInstrConfig && <InstrumentConfigurator />}

      <SectionHeader title="ABOUT" />
      <Row label="Version">
        <span style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{__APP_VERSION__}</span>
      </Row>
      <Row label="UltraPilot">
        <span style={{ fontSize: theme.size.small, color: theme.colors.dim }}>Aviator's Toolkit</span>
      </Row>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: `1px solid ${theme.colors.darkBorder}`,
  background: theme.colors.darkCard, color: theme.colors.cream, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: theme.size.small, minHeight: '36px',
}
