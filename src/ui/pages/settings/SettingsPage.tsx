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

const ALL_INSTRUMENTS: InstrumentId[] = [
  'gs', 'agl', 'msl', 'vs', 'hdg', 'dist', 'brg', 'brg_arrow',
  'etime', 'sess', 'maxalt', 'dtk', 'dtk_arrow', 'dte', 'xtk', 'ete',
]

const OVERLAY_INSTRUMENTS: Array<InstrumentId | null> = [
  null,
  'gs', 'agl', 'msl', 'vs', 'hdg', 'dist', 'brg', 'brg_arrow',
  'etime', 'sess', 'maxalt', 'dtk', 'dtk_arrow', 'dte', 'xtk', 'ete',
]

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

// ── Instrument Picker Modal ────────────────────────────────────────────────────

interface InstrumentPickerModalProps {
  current: InstrumentId | null
  includeNull: boolean   // overlays allow "Off"; strip slots don't
  onSelect: (id: InstrumentId | null) => void
  onClose: () => void
}

function InstrumentPickerModal({ current, includeNull, onSelect, onClose }: InstrumentPickerModalProps) {
  const options: Array<InstrumentId | null> = includeNull ? OVERLAY_INSTRUMENTS : ALL_INSTRUMENTS

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.colors.darkCard,
          border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '16px', padding: '20px', width: '300px',
          maxHeight: '70vh', overflowY: 'auto',
          fontFamily: theme.font.primary,
        }}
      >
        <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '16px' }}>
          Choose Instrument
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {options.map((id, i) => {
            const label = id ? INSTRUMENT_LABELS[id] : 'Off'
            const isActive = id === current
            return (
              <button
                key={id ?? `null-${i}`}
                onClick={() => { onSelect(id); onClose() }}
                style={{
                  padding: '12px 10px', borderRadius: '8px',
                  border: `2px solid ${isActive ? theme.colors.red : theme.colors.darkBorder}`,
                  background: isActive ? theme.colors.redDim : theme.colors.dark,
                  color: isActive ? theme.colors.cream : theme.colors.light,
                  cursor: 'pointer', fontFamily: theme.font.primary,
                  fontSize: theme.size.small, textAlign: 'center',
                  minHeight: theme.tapTarget,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: '14px', padding: '12px', borderRadius: '8px',
            border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
            color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
            fontSize: theme.size.body, minHeight: theme.tapTarget,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Slot Button ────────────────────────────────────────────────────────────────

function SlotButton({
  index,
  id,
  hiddenOnMobile,
  onTap,
}: {
  index: number
  id: InstrumentId
  hiddenOnMobile: boolean
  onTap: () => void
}) {
  return (
    <button
      onClick={onTap}
      style={{
        padding: '10px 12px', borderRadius: '8px',
        border: `2px solid ${hiddenOnMobile ? theme.colors.amber : theme.colors.red}`,
        background: hiddenOnMobile ? 'rgba(230,126,34,0.12)' : theme.colors.redDim,
        color: theme.colors.cream, cursor: 'pointer',
        fontFamily: theme.font.primary, fontSize: theme.size.small,
        textAlign: 'left', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', minHeight: theme.tapTarget, width: '100%',
      }}
    >
      <span style={{ color: theme.colors.dim, marginRight: '6px', fontFamily: theme.font.mono, fontSize: '11px' }}>#{index + 1}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>{INSTRUMENT_LABELS[id]}</span>
      {hiddenOnMobile && (
        <span style={{
          background: theme.colors.amber, color: '#fff',
          padding: '2px 6px', borderRadius: '4px',
          fontSize: '10px', fontWeight: 700, marginLeft: '6px',
        }}>hidden</span>
      )}
    </button>
  )
}

function EmptySlot({ index, onTap }: { index: number; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      style={{
        padding: '10px 12px', borderRadius: '8px',
        border: `2px dashed ${theme.colors.darkBorder}`,
        background: 'transparent', color: theme.colors.dim,
        cursor: 'pointer', fontFamily: theme.font.primary,
        fontSize: theme.size.small, textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: '6px',
        minHeight: theme.tapTarget, width: '100%',
      }}
    >
      <span style={{ color: theme.colors.dim, fontFamily: theme.font.mono, fontSize: '11px' }}>#{index + 1}</span>
      <span style={{ color: theme.colors.dim }}>+ Add</span>
    </button>
  )
}

// ── Overlay Slot Button ────────────────────────────────────────────────────────

function OverlaySlot({
  label,
  id,
  onTap,
}: {
  label: string
  id: InstrumentId | null
  onTap: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <span style={{ fontSize: theme.size.small, color: theme.colors.light, flex: 1 }}>{label}</span>
      <button
        onClick={onTap}
        style={{
          padding: '8px 14px', borderRadius: '8px',
          border: `1px solid ${id ? theme.colors.red : theme.colors.darkBorder}`,
          background: id ? theme.colors.redDim : theme.colors.darkCard,
          color: id ? theme.colors.cream : theme.colors.dim,
          cursor: 'pointer', fontFamily: theme.font.primary,
          fontSize: theme.size.small, minHeight: '36px',
          whiteSpace: 'nowrap',
        }}
      >
        {id ? INSTRUMENT_LABELS[id] : 'Off'}
      </button>
    </div>
  )
}

// ── Instrument Configurator ────────────────────────────────────────────────────

function InstrumentConfigurator() {
  const {
    strip, setStrip,
    mapLeft, mapRight, mapBottom,
    setMapLeft, setMapRight, setMapBottom,
    stripCount, setStripCount,
  } = useInstrumentStore()
  const layout = useResponsiveLayout()
  const isPhone = layout === 'phone'

  // Local strip state (committed on slot removal/add)
  const [localStrip, setLocalStrip] = useState<InstrumentId[]>(strip)

  // Picker state
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)       // strip slot index
  const [pickerOverlay, setPickerOverlay] = useState<'left' | 'right' | 'bottom' | null>(null)

  function openStripPicker(index: number) {
    setPickerSlot(index)
  }

  function removeFromStrip(index: number) {
    const next = localStrip.filter((_, i) => i !== index)
    setLocalStrip(next)
    setStrip(next)
  }

  function handleStripPick(id: InstrumentId | null) {
    if (id === null || pickerSlot === null) return
    const next = [...localStrip]
    if (pickerSlot < next.length) {
      next[pickerSlot] = id
    } else {
      next.push(id)
    }
    setLocalStrip(next)
    setStrip(next)
    setPickerSlot(null)
  }

  function handleOverlayPick(id: InstrumentId | null) {
    if (pickerOverlay === 'left')   setMapLeft(id)
    if (pickerOverlay === 'right')  setMapRight(id)
    if (pickerOverlay === 'bottom') setMapBottom(id)
    setPickerOverlay(null)
  }

  // Build slot list: filled slots + one empty "add" slot (up to 6)
  const slotCount = Math.min(6, localStrip.length + 1)
  const slots = Array.from({ length: slotCount }, (_, i) => i)

  return (
    <div style={{ padding: '12px 16px' }}>

      {/* Strip count selector */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '8px' }}>
        Strip slot count {isPhone && '(phone shows max 4)'}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        {([4, 5, 6] as const).map(n => (
          <button
            key={n}
            onClick={() => setStripCount(n)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              border: `2px solid ${stripCount === n ? theme.colors.red : theme.colors.darkBorder}`,
              background: stripCount === n ? theme.colors.redDim : theme.colors.dark,
              color: stripCount === n ? theme.colors.cream : theme.colors.light,
              cursor: 'pointer', fontFamily: theme.font.primary,
              fontSize: theme.size.body, fontWeight: stripCount === n ? 700 : 400,
              minHeight: theme.tapTarget,
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Strip slots */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Instrument strip — tap a slot to change, ✕ to remove
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
        {slots.map(i => {
          const id = localStrip[i]
          const hiddenOnMobile = isPhone && i >= 4
          if (id !== undefined) {
            return (
              <div key={i} style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1 }}>
                  <SlotButton
                    index={i}
                    id={id}
                    hiddenOnMobile={hiddenOnMobile}
                    onTap={() => openStripPicker(i)}
                  />
                </div>
                <button
                  onClick={() => removeFromStrip(i)}
                  style={{
                    width: '44px', height: '44px', borderRadius: '8px',
                    border: `1px solid ${theme.colors.darkBorder}`,
                    background: theme.colors.dark, color: theme.colors.dim,
                    cursor: 'pointer', fontSize: '18px', flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            )
          }
          if (localStrip.length < 6) {
            return <EmptySlot key={`empty-${i}`} index={i} onTap={() => openStripPicker(i)} />
          }
          return null
        })}
      </div>

      {/* Map overlay slots */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Map corner overlays — tap to change
      </div>
      <OverlaySlot label="Top Left"     id={mapLeft}   onTap={() => setPickerOverlay('left')} />
      <OverlaySlot label="Top Right"    id={mapRight}  onTap={() => setPickerOverlay('right')} />
      <OverlaySlot label="Bottom Right" id={mapBottom} onTap={() => setPickerOverlay('bottom')} />

      {/* Strip picker modal */}
      {pickerSlot !== null && (
        <InstrumentPickerModal
          current={localStrip[pickerSlot] ?? null}
          includeNull={false}
          onSelect={id => handleStripPick(id as InstrumentId)}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Overlay picker modal */}
      {pickerOverlay !== null && (
        <InstrumentPickerModal
          current={
            pickerOverlay === 'left' ? mapLeft
            : pickerOverlay === 'right' ? mapRight
            : mapBottom
          }
          includeNull={true}
          onSelect={handleOverlayPick}
          onClose={() => setPickerOverlay(null)}
        />
      )}
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
