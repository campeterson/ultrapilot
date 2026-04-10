import { useState } from 'react'
import { theme } from '../../theme'
import { useSessionStore } from '../../../state/session-store'
import { useGPSStore } from '../../../state/gps-store'
import { useTimelineStore, buildStamp } from '../../../state/timeline-store'
import { computeAGLft } from '../../../data/logic/gps-logic'
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

export function MapControls({ onRecenter }: MapControlsProps) {
  const [stampOpen, setStampOpen] = useState(false)
  const { session, sessionStatus } = useSessionStore()
  const { addStamp } = useTimelineStore()

  async function handleStamp(type: import('../../../data/models').StampEventType, note: string | null) {
    const pos = useGPSStore.getState().position
    if (!session || !pos) return
    const aglFt = computeAGLft(pos.altMSL, session.originAltMSL)
    const stamp = buildStamp(
      session.id,
      type,
      pos.lat,
      pos.lon,
      pos.altMSL,
      aglFt / 3.28084,  // back to meters
      pos.speed,
      note
    )
    await addStamp(stamp)
    setStampOpen(false)
  }

  return (
    <>
      {/* Bottom-left floating controls */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 50,
        }}
      >
        <button style={btnBase} onClick={onRecenter} title="Re-center on position">
          ▲
        </button>
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

      {/* Start session button when no session */}
      {!session && (
        <StartSessionButton />
      )}

      {/* Recording indicator */}
      {session && sessionStatus === 'active' && (
        <RecordingIndicator />
      )}

      {stampOpen && (
        <StampModal onSelect={handleStamp} onClose={() => setStampOpen(false)} />
      )}
    </>
  )
}

function RecordingIndicator() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '16px',
        right: '12px',
        background: 'rgba(14,14,20,0.88)',
        border: `1px solid ${theme.colors.darkBorder}`,
        borderRadius: '20px',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        zIndex: 50,
        backdropFilter: 'blur(6px)',
      }}
    >
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: theme.colors.green, display: 'inline-block' }} />
      <span style={{ fontSize: theme.size.small, color: theme.colors.light, fontFamily: theme.font.primary }}>REC</span>
    </div>
  )
}

function StartSessionButton() {
  const { startSession } = useSessionStore()
  const { addStamp } = useTimelineStore()

  async function handleStart() {
    const pos = useGPSStore.getState().position
    if (!pos) {
      alert('Waiting for GPS fix…')
      return
    }
    const s = await startSession(pos.lat, pos.lon, pos.altMSL)
    // Auto-stamp session start
    await addStamp({
      sessionId: s.id,
      ts: Date.now(),
      type: 'session_start',
      lat: pos.lat,
      lon: pos.lon,
      altMSL: pos.altMSL,
      altAGL: 0,
      speed: pos.speed,
      note: null,
    })
  }

  return (
    <button
      onClick={handleStart}
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '14px 28px',
        borderRadius: '10px',
        border: 'none',
        background: theme.colors.red,
        color: '#fff',
        cursor: 'pointer',
        fontSize: '15px',
        fontWeight: 700,
        fontFamily: theme.font.primary,
        letterSpacing: '0.06em',
        zIndex: 50,
        boxShadow: '0 2px 16px rgba(192,57,43,0.4)',
        minHeight: theme.tapTarget,
      }}
    >
      START SESSION
    </button>
  )
}
