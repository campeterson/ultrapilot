import { useState } from 'react'
import { useSessionStore } from '../../../state/session-store'
import { useInstrumentStore } from '../../../state/instrument-store'
import { useTimelineStore } from '../../../state/timeline-store'
import { useGPSStore } from '../../../state/gps-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { useFlightModeStore } from '../../../state/flight-mode-store'
import { useWindreaderStore } from '../../../state/windreader-store'
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout'
import { getTrackPoints, getEvents } from '../../../data/db'
import { toGPX, toOADSSession, downloadString, sessionFilename } from '../../../data/export'
import { formatImportStats } from '../../../data/import'
import { theme } from '../../theme'
import { INSTRUMENT_LABELS, type InstrumentId } from '../../../data/models'
// INSTRUMENT_LABELS used in InstrumentConfigurator below
import { InstrumentPickerModal } from '../../shell/InstrumentPickerModal'
import { PAGE_LAYOUTS, PAGE_LAYOUT_IDS, type PageLayoutId } from '../../../data/logic/instrument-layouts'
import { LayoutThumbnail } from '../instruments/LayoutThumbnail'


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

function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', outline: `1px solid ${theme.colors.darkBorder}`, flexShrink: 0 }}>
      {options.map(o => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          style={{
            minWidth: theme.tapTarget, minHeight: theme.tapTarget, padding: '0 10px', border: 'none',
            background: o.value === value ? theme.colors.red : theme.colors.darkCard,
            color: o.value === value ? '#fff' : theme.colors.light,
            fontFamily: theme.font.primary, fontSize: theme.size.small, cursor: 'pointer',
          }}
        >
          {o.label}
        </button>
      ))}
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

// ── Instruments Page Layout Picker ────────────────────────────────────────────

function PageLayoutPicker() {
  const pageLayoutId = useInstrumentStore(s => s.pageLayoutId)
  const setPageLayout = useInstrumentStore(s => s.setPageLayout)

  return (
    <div style={{ padding: '12px 16px 16px' }}>
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Instruments page layout — tap to choose
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        {PAGE_LAYOUT_IDS.map(id => {
          const layout = PAGE_LAYOUTS[id]
          const active = id === pageLayoutId
          return (
            <button
              key={id}
              onClick={() => setPageLayout(id as PageLayoutId)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                padding: '10px 8px', borderRadius: '10px',
                border: `2px solid ${active ? theme.colors.red : theme.colors.darkBorder}`,
                background: active ? theme.colors.redDim : theme.colors.dark,
                color: active ? theme.colors.cream : theme.colors.light,
                cursor: 'pointer',
                fontFamily: theme.font.primary,
                fontSize: theme.size.small,
                fontWeight: active ? 700 : 400,
                minHeight: theme.tapTarget,
              }}
            >
              <LayoutThumbnail layoutId={id as PageLayoutId} active={active} size={80} />
              <span style={{ textAlign: 'center', lineHeight: 1.2 }}>
                {layout.name}
                <span style={{ display: 'block', fontSize: theme.size.tiny, color: theme.colors.dim, fontWeight: 400, marginTop: '2px' }}>
                  {layout.slots.length} slots
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { session, sessionStatus, endCurrentSession, importFile } = useSessionStore()
  const { maxAGLft } = useInstrumentStore()
  const { showDirectionLine, directionLineMode, directionLineMinutes, setDirectionLineMode, setDirectionLineMinutes, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, toggle } = useMapSettingsStore()
  const { mode: flightMode, setMode: setFlightMode } = useFlightModeStore()
  const windreader = useWindreaderStore()
  const [showInstrConfig, setShowInstrConfig] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  async function handleExportGPX() {
    if (!session) return
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const gpx = toGPX(session, pts, evts)
    downloadString(gpx, sessionFilename(session, 'gpx'), 'application/gpx+xml')
  }

  async function handleExportJSON() {
    if (!session) return
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const oads = toOADSSession(session, pts, evts)
    downloadString(JSON.stringify(oads, null, 2), sessionFilename(session, 'oads.json'), 'application/json')
  }

  async function handleEndSession() {
    if (!session) return
    if (!confirm('End the current session?')) return
    const pos = useGPSStore.getState().position
    await endCurrentSession(maxAGLft)
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

  async function handleImportSessionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { stats } = await importFile(file.name, await file.arrayBuffer(), n =>
        confirm(`${n} session${n === 1 ? '' : 's'} already exist. Replace duplicates?`))
      setImportStatus(formatImportStats(stats))
    } catch (err) {
      setImportStatus(`Import failed: ${err instanceof Error ? err.message : 'Import failed'}`)
    }
    setTimeout(() => setImportStatus(null), 5000)
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      <SectionHeader title="FLIGHT MODE" />
      <Row label="Aircraft">
        <Segmented
          value={flightMode}
          options={[{ value: 'powered', label: 'POWERED' }, { value: 'lta', label: 'BALLOON / LTA' }]}
          onChange={setFlightMode}
        />
      </Row>

      {flightMode === 'lta' && (
        <>
          <SectionHeader title="WINDREADER" />
          <Row label="Altitude Band">
            <Segmented
              value={windreader.bandFt}
              options={[{ value: 50, label: '50 FT' }, { value: 100, label: '100 FT' }, { value: 200, label: '200 FT' }]}
              onChange={v => windreader.setSetting('bandFt', v)}
            />
          </Row>
          <Row label="Speed Units">
            <Segmented
              value={windreader.units}
              options={[{ value: 'kt', label: 'KT' }, { value: 'mph', label: 'MPH' }, { value: 'kmh', label: 'KM/H' }]}
              onChange={v => windreader.setSetting('units', v)}
            />
          </Row>
          <Row label="Panel on Map">
            <Toggle value={windreader.showMapPanel} onToggle={() => windreader.setSetting('showMapPanel', !windreader.showMapPanel)} />
          </Row>
          <Row label="Wind Lines on Map">
            <Toggle value={windreader.showMapLines} onToggle={() => windreader.setSetting('showMapLines', !windreader.showMapLines)} />
          </Row>
          {windreader.showMapLines && (
            <Row label="Wind Line Length">
              <Segmented
                value={windreader.lineMinutes}
                options={[{ value: 5, label: '5 MIN' }, { value: 10, label: '10 MIN' }, { value: 30, label: '30 MIN' }]}
                onChange={v => windreader.setSetting('lineMinutes', v)}
              />
            </Row>
          )}
        </>
      )}

      {session && sessionStatus === 'active' && (
        <>
          <SectionHeader title="CURRENT SESSION" />
          <Row label="Export GPX">
            <button onClick={handleExportGPX} style={actionBtn}>GPX</button>
          </Row>
          <Row label="Export OADS">
            <button onClick={handleExportJSON} style={actionBtn}>OADS</button>
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
      {showDirectionLine && (
        <>
          {/* LTA always projects by time — a fixed 2 nm means little at balloon speeds */}
          {flightMode === 'powered' && (
            <Row label="Line Length">
              <Segmented
                value={directionLineMode}
                options={[{ value: 'distance', label: '2 NM' }, { value: 'time', label: 'TIME' }]}
                onChange={setDirectionLineMode}
              />
            </Row>
          )}
          {(directionLineMode === 'time' || flightMode === 'lta') && (
            <Row label="Look Ahead">
              <Segmented
                value={directionLineMinutes}
                options={[{ value: 5, label: '5 MIN' }, { value: 10, label: '10 MIN' }, { value: 30, label: '30 MIN' }]}
                onChange={setDirectionLineMinutes}
              />
            </Row>
          )}
        </>
      )}
      <Row label="Distance Rings (0.5 / 1 / 2 nm)">
        <Toggle value={showDistanceRings} onToggle={() => toggle('showDistanceRings')} />
      </Row>

      <SectionHeader title="INSTRUMENTS" />
      <Row label="Top Strip">
        <Toggle value={showInstrumentStrip} onToggle={() => toggle('showInstrumentStrip')} />
      </Row>
      <Row label="Map Overlays">
        <Toggle value={showMapOverlays} onToggle={() => toggle('showMapOverlays')} />
      </Row>
      <Row label="Configure Strip &amp; Overlays">
        <button onClick={() => setShowInstrConfig(v => !v)} style={actionBtn}>
          {showInstrConfig ? 'Hide' : 'Edit'}
        </button>
      </Row>
      {showInstrConfig && <InstrumentConfigurator />}

      <SectionHeader title="INSTRUMENTS PAGE" />
      <PageLayoutPicker />

      <SectionHeader title="SESSION DATA" />
      <input
        id="session-import-input"
        type="file"
        accept=".json,.gpx,.kml,.kmz,application/json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,text/xml"
        style={{ display: 'none' }}
        onChange={handleImportSessionFile}
      />
      <Row label="Import Session File">
        <label
          htmlFor="session-import-input"
          style={{
            ...actionBtn,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Import
        </label>
      </Row>
      {importStatus && (
        <div style={{
          padding: '10px 16px', background: theme.colors.darkCard,
          borderBottom: `1px solid ${theme.colors.darkBorder}`,
          fontSize: theme.size.small, color: theme.colors.cream,
        }}>
          {importStatus}
        </div>
      )}

      <SectionHeader title="ABOUT" />
      <Row label="Version">
        <span style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{__APP_VERSION__}</span>
      </Row>
      <Row label="Part of">
        <a
          href="https://aviatorstoolkit.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: theme.size.small, color: theme.colors.magenta, textDecoration: 'none' }}
        >
          Aviator's Toolkit ↗
        </a>
      </Row>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: `1px solid ${theme.colors.darkBorder}`,
  background: theme.colors.darkCard, color: theme.colors.cream, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: theme.size.small, minHeight: '36px',
}
