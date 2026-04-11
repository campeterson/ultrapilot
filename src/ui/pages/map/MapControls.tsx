import { useState } from 'react'
import { theme } from '../../theme'
import { useSessionStore } from '../../../state/session-store'
import { useGPSStore } from '../../../state/gps-store'
import { useInstrumentStore } from '../../../state/instrument-store'
import { useTimelineStore, buildStamp } from '../../../state/timeline-store'
import { useDirectToStore } from '../../../state/direct-to-store'
import { bulkAddTrackPoints } from '../../../data/db'
import { computeAGLft, bearing as getBearing, haversineNM } from '../../../data/logic/gps-logic'
import { formatInstrumentValue, getInstrumentColor } from '../../../data/logic/instrument-logic'
import { INSTRUMENT_LABELS, INSTRUMENT_UNITS, type InstrumentId } from '../../../data/models'
import { StampModal } from './StampModal'

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

function MapOverlayInstrument({ id, position }: { id: InstrumentId; position: OverlayPosition }) {
  const { values } = useInstrumentStore()
  const label = INSTRUMENT_LABELS[id]
  const unit = INSTRUMENT_UNITS[id]
  const displayValue = values ? formatInstrumentValue(id, values) : '—'
  const valueColor = values ? getInstrumentColor(id, values) : theme.colors.cream

  const isArrow = id === 'brg_arrow' || id === 'dtk_arrow'
  const bearingDeg = id === 'brg_arrow' ? (values?.brg ?? 0) : (values?.dtk ?? 0)
  const hasValue = id === 'dtk_arrow' ? values?.dtk !== null : true

  return (
    <div style={{ ...POSITION_STYLE[position], ...overlayCard }}>
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
            {hasValue ? `${Math.round(bearingDeg)}°` : '---'}
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
  const { session, sessionStatus } = useSessionStore()
  const { addStamp } = useTimelineStore()
  const { target: directTo, clearTarget } = useDirectToStore()
  const { mapLeft, mapRight, mapBottom } = useInstrumentStore()

  async function handleStamp(type: import('../../../data/models').StampEventType, note: string | null) {
    const pos = useGPSStore.getState().position
    if (!session || !pos) return
    const aglFt = computeAGLft(pos.altMSL, session.originAltMSL)
    await addStamp(buildStamp(session.id, type, pos.lat, pos.lon, pos.altMSL, aglFt / 3.28084, pos.speed, note))
    setStampOpen(false)
  }

  return (
    <>
      {/* Top-left overlay */}
      {mapLeft && <MapOverlayInstrument id={mapLeft} position="top-left" />}

      {/* Top-right overlay */}
      {mapRight && <MapOverlayInstrument id={mapRight} position="top-right" />}

      {/* Bottom-right overlay (sits above REC indicator) */}
      {mapBottom && <MapOverlayInstrument id={mapBottom} position="bottom-right" />}

      {/* Bottom-left: D→ indicator + recenter + cancel D→ */}
      <div style={{ position: 'absolute', bottom: '16px', left: '12px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 50, alignItems: 'center' }}>
        <DirectToIndicator />
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

      {/* STAMP button — center bottom */}
      {session && sessionStatus === 'active' && (
        <button
          onClick={() => setStampOpen(true)}
          style={{
            position: 'absolute',
            bottom: '16px',
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

  async function handleStart() {
    const pos = useGPSStore.getState().position
    if (!pos) { alert('Waiting for GPS fix…'); return }
    const s = await startSession(pos.lat, pos.lon, pos.altMSL)
    await addStamp({ sessionId: s.id, ts: Date.now(), type: 'session_start', lat: pos.lat, lon: pos.lon, altMSL: pos.altMSL, altAGL: 0, speed: pos.speed, note: null })
  }

  return (
    <button
      onClick={handleStart}
      style={{
        position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
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
