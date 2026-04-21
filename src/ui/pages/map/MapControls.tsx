import { useState } from 'react'
import { theme } from '../../theme'
import { useSessionStore } from '../../../state/session-store'
import { useGPSStore } from '../../../state/gps-store'
import { useInstrumentStore } from '../../../state/instrument-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { useTimelineStore, buildStamp } from '../../../state/timeline-store'
import { useDirectToStore } from '../../../state/direct-to-store'
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout'
import { bulkAddTrackPoints } from '../../../data/db'
import { computeAGLft, bearing as getBearing, haversineNM, formatNM } from '../../../data/logic/gps-logic'
import { formatInstrumentValue, getInstrumentColor } from '../../../data/logic/instrument-logic'
import { INSTRUMENT_LABELS, INSTRUMENT_UNITS, type InstrumentId } from '../../../data/models'
import { StampModal } from './StampModal'
import { InstrumentPickerModal } from '../../shell/InstrumentPickerModal'
import { HSIInstrument } from './HSIInstrument'

interface MapControlsProps {
  onRecenter: () => void
}

const btnBase: React.CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  border: `1px solid ${theme.colors.darkBorder}`,
  background: 'rgba(14, 14, 20, 0.88)',
  color: theme.colors.cream,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '18px',
  backdropFilter: 'blur(6px)',
  fontFamily: theme.font.primary,
}

const overlayCard: React.CSSProperties = {
  background: 'rgba(14, 14, 20, 0.88)',
  border: `1px solid ${theme.colors.darkBorder}`,
  borderRadius: '12px',
  padding: '10px 16px',
  backdropFilter: 'blur(6px)',
  textAlign: 'center',
  minWidth: '80px',
}

type OverlayPosition = 'top-left' | 'top-right' | 'bottom-right'

const POSITION_STYLE: Record<OverlayPosition, React.CSSProperties> = {
  'top-left':     { position: 'absolute', top: '12px', left: '12px',  zIndex: 50 },
  'top-right':    { position: 'absolute', top: '12px', right: '12px', zIndex: 50 },
  'bottom-right': { position: 'absolute', bottom: '70px', right: '12px', zIndex: 50 },
}

/** Arrow SVG pointing up (rotation applied via parent transform) */
function ArrowSVG({ color, size = 36 }: { color: string; size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -12 16 24" width={size} height={size}>
      <polygon points="0,-10 5,7 0,3 -5,7" fill={color} />
    </svg>
  )
}

/** Directional arrow icon — shown when map is in Track Up mode */
function TrackUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -12 20 24" width="22" height="22">
      <polygon points="0,-10 6,8 0,4 -6,8" fill={theme.colors.cream} stroke={theme.colors.red} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

/** Compass rose icon with N — shown when map is in North Up mode */
function NorthUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24" width="22" height="22">
      <circle cx="0" cy="0" r="10" fill="none" stroke={theme.colors.cream} strokeWidth="1.2" opacity="0.7" />
      <polygon points="0,-8 3,0 0,8 -3,0" fill={theme.colors.cream} opacity="0.85" />
      <polygon points="0,-8 3,0 0,0" fill={theme.colors.red} />
      <text x="0" y="-10.5" textAnchor="middle" fontSize="5" fontWeight="700" fill={theme.colors.cream} fontFamily="sans-serif">N</text>
    </svg>
  )
}

function MapOverlayInstrument({ id, position, onClick }: { id: InstrumentId; position: OverlayPosition; onClick?: () => void }) {
  const { values } = useInstrumentStore()
  const label = INSTRUMENT_LABELS[id]
  const unit = INSTRUMENT_UNITS[id]
  const displayValue = values ? formatInstrumentValue(id, values) : '—'
  const valueColor = values ? getInstrumentColor(id, values) : theme.colors.cream

  const isArrow = id === 'brg_arrow' || id === 'dtk_arrow'
  const absBearing = id === 'brg_arrow' ? (values?.brg ?? 0) : (values?.dtk ?? 0)
  // Relative to current track so "up" = direction of travel
  const bearingDeg = ((absBearing - (values?.hdg ?? 0)) + 360) % 360
  const hasValue = id === 'dtk_arrow' ? values?.dtk !== null : true

  // HSI gets its own full rendering
  if (id === 'hsi') {
    return (
      <div
        onClick={onClick}
        style={{
          ...POSITION_STYLE[position],
          background: 'transparent',
          cursor: onClick ? 'pointer' : undefined,
        }}
      >
        <HSIInstrument
          hdg={values?.hdg ?? 0}
          dtk={values?.dtk ?? null}
          xtk={values?.xtk ?? null}
          brg={values?.brg ?? 0}
          dist={values?.dist ?? 0}
          size={160}
        />
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      style={{ ...POSITION_STYLE[position], ...overlayCard, cursor: onClick ? 'pointer' : undefined }}
    >
      <div style={{
        fontSize: theme.size.tiny,
        color: theme.colors.dim,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        marginBottom: '6px',
        lineHeight: 1,
      }}>
        {label}
      </div>

      {isArrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: hasValue ? 1 : 0.3 }}>
          <div style={{ transform: `rotate(${bearingDeg}deg)`, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowSVG color={valueColor} size={32} />
          </div>
          <div style={{ fontSize: theme.size.small, fontFamily: theme.font.mono, color: theme.colors.dim, lineHeight: 1 }}>
            {id === 'brg_arrow'
              ? (values ? `${formatNM(values.dist)} nm` : '---')
              : (hasValue ? `${Math.round(bearingDeg)}°` : '---')}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '32px', color: valueColor, fontFamily: theme.font.mono, fontWeight: 700, lineHeight: 1 }}>
            {displayValue}
          </div>
          {unit && (
            <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '4px', lineHeight: 1 }}>
              {unit}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DirectToIndicator() {
  const { target: directTo } = useDirectToStore()
  const { position } = useGPSStore()

  if (!directTo || !position) return null

  const brg = getBearing(position.lat, position.lon, directTo.lat, directTo.lon)
  const dist = haversineNM(position.lat, position.lon, directTo.lat, directTo.lon)

  return (
    <div style={{ ...overlayCard, border: `1px solid rgba(224,64,251,0.45)` }}>
      <div style={{
        fontSize: theme.size.tiny,
        color: theme.colors.magenta,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        marginBottom: '6px',
        lineHeight: 1,
        fontWeight: 700,
        maxWidth: '90px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        D→ {directTo.name}
      </div>
      <div style={{ transform: `rotate(${brg}deg)`, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
        <ArrowSVG color={theme.colors.magenta} size={32} />
      </div>
      <div style={{ fontSize: '32px', fontWeight: 700, color: theme.colors.magenta, fontFamily: theme.font.mono, lineHeight: 1 }}>
        {dist.toFixed(1)}
      </div>
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '4px', lineHeight: 1 }}>nm</div>
    </div>
  )
}

export function MapControls({ onRecenter }: MapControlsProps) {
  const [stampOpen, setStampOpen] = useState(false)
  const [overlayPicker, setOverlayPicker] = useState<'left' | 'right' | 'bottom' | null>(null)
  const { session, sessionStatus } = useSessionStore()
  const { addStamp } = useTimelineStore()
  const { target: directTo, clearTarget } = useDirectToStore()
  const { mapLeft, mapRight, mapBottom, setMapLeft, setMapRight, setMapBottom } = useInstrumentStore()
  const { showMapOverlays, mapOrientation, setOrientation } = useMapSettingsStore()
  const layout = useResponsiveLayout()

  // On tablet-portrait, the chevron toggle sits at bottom-center of the map area.
  // Push STAMP up to clear it.
  const stampBottom = layout === 'tablet-portrait' ? '72px' : '16px'

  function handleOverlayPick(id: InstrumentId | null) {
    if (overlayPicker === 'left')   setMapLeft(id)
    if (overlayPicker === 'right')  setMapRight(id)
    if (overlayPicker === 'bottom') setMapBottom(id)
    setOverlayPicker(null)
  }

  async function handleStamp(type: import('../../../data/models').StampEventType, note: string | null) {
    const pos = useGPSStore.getState().position
    if (!session || !pos) return
    const aglFt = computeAGLft(pos.altMSL, session.originAltMSL)
    await addStamp(buildStamp(session.id, type, pos.lat, pos.lon, pos.altMSL, aglFt / 3.28084, pos.speed, note))
    setStampOpen(false)
  }

  return (
    <>
      {/* Map overlay instruments — shown when enabled in Settings */}
      {showMapOverlays && mapLeft && <MapOverlayInstrument id={mapLeft} position="top-left" onClick={() => setOverlayPicker('left')} />}
      {showMapOverlays && mapRight && <MapOverlayInstrument id={mapRight} position="top-right" onClick={() => setOverlayPicker('right')} />}
      {showMapOverlays && mapBottom && <MapOverlayInstrument id={mapBottom} position="bottom-right" onClick={() => setOverlayPicker('bottom')} />}

      {/* Bottom-left: D→ indicator + orientation toggle + recenter + cancel D→ */}
      <div style={{ position: 'absolute', bottom: '16px', left: '12px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 50, alignItems: 'center' }}>
        <DirectToIndicator />
        <button
          style={btnBase}
          onClick={() => setOrientation(mapOrientation === 'track-up' ? 'north-up' : 'track-up')}
          title={mapOrientation === 'track-up' ? 'Track Up — tap for North Up' : 'North Up — tap for Track Up'}
          aria-label={`Orientation: ${mapOrientation === 'track-up' ? 'Track Up' : 'North Up'}`}
        >
          {mapOrientation === 'track-up' ? <TrackUpIcon /> : <NorthUpIcon />}
        </button>
        <button style={btnBase} onClick={onRecenter} title="Re-center on position">▲</button>
        {directTo && (
          <button
            onClick={clearTarget}
            title="Cancel Direct-To"
            style={{
              ...btnBase,
              width: 'auto',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: theme.colors.magenta,
              borderColor: theme.colors.magenta,
              whiteSpace: 'nowrap',
            }}
          >
            × D→
          </button>
        )}
      </div>

      {/* STAMP button — center bottom (pushed up on tablet-portrait to clear chevron) */}
      {session && sessionStatus === 'active' && (
        <button
          onClick={() => setStampOpen(true)}
          style={{
            position: 'absolute',
            bottom: stampBottom,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.15)',
            background: theme.colors.red,
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: theme.font.primary,
            letterSpacing: '0.08em',
            zIndex: 50,
            boxShadow: '0 2px 16px rgba(192,57,43,0.5)',
          }}
        >
          STAMP
        </button>
      )}

      {!session && <StartSessionButton />}
      {session && sessionStatus === 'active' && <RecordingIndicator />}

      {stampOpen && (
        <StampModal onSelect={handleStamp} onClose={() => setStampOpen(false)} />
      )}

      {overlayPicker !== null && (
        <InstrumentPickerModal
          current={overlayPicker === 'left' ? mapLeft : overlayPicker === 'right' ? mapRight : mapBottom}
          includeNull={true}
          onSelect={handleOverlayPick}
          onClose={() => setOverlayPicker(null)}
        />
      )}
    </>
  )
}

function RecordingIndicator() {
  const { session, endCurrentSession, clearTrackBuffer } = useSessionStore()
  const { maxAGLft } = useInstrumentStore()
  const { addStamp } = useTimelineStore()
  const [modalOpen, setModalOpen] = useState(false)

  async function handleEnd() {
    if (!session) return
    const sessionId = session.id
    const pos = useGPSStore.getState().position
    const originLat = session.originLat
    const originLon = session.originLon
    const originAlt = session.originAltMSL

    const buf = clearTrackBuffer()
    if (buf.length > 0) await bulkAddTrackPoints(buf)
    await addStamp({ sessionId, ts: Date.now(), type: 'session_end',
      lat: pos?.lat ?? originLat, lon: pos?.lon ?? originLon,
      altMSL: pos?.altMSL ?? originAlt, altAGL: 0, speed: pos?.speed ?? 0, note: null })
    await endCurrentSession(maxAGLft, 0)
    setModalOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        style={{
          position: 'absolute', bottom: '16px', right: '12px',
          background: 'rgba(14,14,20,0.88)', border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '20px', padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: '6px',
          zIndex: 50, backdropFilter: 'blur(6px)', cursor: 'pointer',
          minHeight: theme.tapTarget,
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: theme.colors.green, display: 'inline-block' }} />
        <span style={{ fontSize: theme.size.small, color: theme.colors.light, fontFamily: theme.font.primary }}>REC</span>
      </button>

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: theme.safeNavHeight, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.colors.darkCard, border: `1px solid ${theme.colors.darkBorder}`, borderRadius: '16px', padding: '28px 24px', width: '280px', fontFamily: theme.font.primary }}>
            <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '8px' }}>End Session?</div>
            <div style={{ fontSize: theme.size.body, color: theme.colors.dim, marginBottom: '24px', lineHeight: 1.5 }}>
              GPS tracking will stop and the session will be saved.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`, background: 'none', color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget }}>Cancel</button>
              <button onClick={handleEnd} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: theme.colors.red, color: '#fff', cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.body, fontWeight: 700, minHeight: theme.tapTarget }}>End Session</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StartSessionButton() {
  const { startSession } = useSessionStore()
  const { addStamp } = useTimelineStore()
  const layout = useResponsiveLayout()

  // On tablet-portrait, clear the panel chevron at bottom-center of the map area.
  const bottom = layout === 'tablet-portrait' ? '80px' : '24px'

  async function handleStart() {
    const pos = useGPSStore.getState().position
    if (!pos) { alert('Waiting for GPS fix…'); return }
    useInstrumentStore.getState().resetRolling()
    useInstrumentStore.getState().resetMaxAGL()
    const s = await startSession(pos.lat, pos.lon, pos.altMSL)
    await addStamp({ sessionId: s.id, ts: Date.now(), type: 'session_start', lat: pos.lat, lon: pos.lon, altMSL: pos.altMSL, altAGL: 0, speed: pos.speed, note: null })
  }

  return (
    <button
      onClick={handleStart}
      style={{
        position: 'absolute', bottom, left: '50%', transform: 'translateX(-50%)',
        padding: '14px 28px', borderRadius: '10px', border: 'none',
        background: theme.colors.red, color: '#fff', cursor: 'pointer',
        fontSize: '15px', fontWeight: 700, fontFamily: theme.font.primary,
        letterSpacing: '0.06em', zIndex: 50,
        boxShadow: '0 2px 16px rgba(192,57,43,0.4)', minHeight: theme.tapTarget,
      }}
    >
      START SESSION
    </button>
  )
}
