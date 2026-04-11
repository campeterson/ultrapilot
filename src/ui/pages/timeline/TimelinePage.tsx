import { useEffect, useState } from 'react'
import { useSessionStore } from '../../../state/session-store'
import { useTimelineStore, buildStamp } from '../../../state/timeline-store'
import { useInstrumentStore } from '../../../state/instrument-store'
import { useGPSStore } from '../../../state/gps-store'
import { EVENT_LABELS, EVENT_COLORS, buildEventDetail } from '../../../data/logic/stamp-logic'
import { computeFlightTimeMs } from '../../../data/logic/session-logic'
import { computeAGLft } from '../../../data/logic/gps-logic'
import { theme } from '../../theme'
import { StampModal } from '../map/StampModal'
import type { StampEvent, StampEventType } from '../../../data/models'

const EVENT_ICONS: Record<StampEventType, string> = {
  session_start:      '▶',
  session_end:        '■',
  takeoff:            '↑',
  landing:            '↓',
  engine_start:       '⊕',
  engine_shutdown:    '⊗',
  checklist_complete: '✓',
  wing_layout:        '⌒',
  weather:            '☁',
  waypoint:           '⌖',
  preflight:          '◈',
  maneuver:           '↺',
  custom:             '★',
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '0:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function SummaryCards({ events, maxAGLft, sessionStart }: { events: StampEvent[]; maxAGLft: number; sessionStart: number }) {
  const flightMs = computeFlightTimeMs(events)
  const sessMs = Date.now() - sessionStart

  return (
    <div style={{ display: 'flex', gap: '8px', padding: '12px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      {[
        { label: 'FLIGHT', value: formatElapsed(flightMs) },
        { label: 'SESSION', value: formatElapsed(sessMs) },
        { label: 'MAX AGL', value: `${Math.round(maxAGLft)} ft` },
      ].map(card => (
        <div
          key={card.label}
          style={{
            flex: 1,
            background: theme.colors.darkCard,
            borderRadius: '8px',
            padding: '10px 8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.06em', marginBottom: '4px' }}>
            {card.label}
          </div>
          <div style={{ fontSize: '16px', color: theme.colors.cream, fontFamily: theme.font.mono, fontWeight: 700 }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function EventRow({ event }: { event: StampEvent }) {
  const color = EVENT_COLORS[event.type]
  const label = EVENT_LABELS[event.type]
  const detail = buildEventDetail(event)
  const icon = EVENT_ICONS[event.type]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 16px',
      borderBottom: `1px solid ${theme.colors.darkBorder}`,
      minHeight: '44px',
    }}>
      {/* Time — left of dot, vertically centered */}
      <span style={{
        fontFamily: theme.font.mono,
        fontSize: theme.size.small,
        color: theme.colors.dim,
        minWidth: '38px',
        textAlign: 'right',
        flexShrink: 0,
        lineHeight: 1,
      }}>
        {formatTime(event.ts)}
      </span>

      {/* Colored icon circle */}
      <div style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '11px',
        color: '#fff',
        fontFamily: theme.font.mono,
        lineHeight: 1,
      }}>
        {icon}
      </div>

      {/* Event name + detail */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: theme.size.body, color: theme.colors.cream, fontWeight: 700, lineHeight: 1.2 }}>
          {label}
        </div>
        {detail && (
          <div style={{ fontSize: theme.size.small, color: theme.colors.dim, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}

export function TimelinePage() {
  const { session, sessionStatus } = useSessionStore()
  const { events, loadEvents, addStamp } = useTimelineStore()
  const { maxAGLft } = useInstrumentStore()
  const [stampOpen, setStampOpen] = useState(false)

  useEffect(() => {
    if (session) loadEvents(session.id)
  }, [session?.id])

  async function handleStamp(type: StampEventType, note: string | null) {
    const pos = useGPSStore.getState().position
    if (!session || !pos) return
    const aglFt = computeAGLft(pos.altMSL, session.originAltMSL)
    await addStamp(buildStamp(
      session.id,
      type,
      pos.lat,
      pos.lon,
      pos.altMSL,
      aglFt / 3.28084,
      pos.speed,
      note
    ))
    setStampOpen(false)
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.colors.dim, fontFamily: theme.font.primary }}>
        No active session
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <SummaryCards events={events} maxAGLft={maxAGLft} sessionStart={new Date(session.startTime).getTime()} />
        <div>
          {events.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim, fontSize: theme.size.body }}>
              No events yet. Use STAMP to log events.
            </div>
          ) : (
            events.map(ev => <EventRow key={ev.id} event={ev} />)
          )}
        </div>
      </div>

      {sessionStatus === 'active' && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.colors.darkBorder}`, flexShrink: 0 }}>
          <button
            onClick={() => setStampOpen(true)}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '10px',
              border: 'none',
              background: theme.colors.red,
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: theme.font.primary,
              letterSpacing: '0.08em',
              minHeight: theme.tapTarget,
              boxShadow: '0 2px 12px rgba(192,57,43,0.4)',
            }}
          >
            STAMP
          </button>
        </div>
      )}

      {stampOpen && (
        <StampModal onSelect={handleStamp} onClose={() => setStampOpen(false)} />
      )}
    </div>
  )
}
