import { useEffect, useState } from 'react'
import { theme } from '../../theme'
import { useSessionStore } from '../../../state/session-store'
import { getEvents } from '../../../data/db'
import { trackEvent as analyticsTrack } from '../../../lib/analytics'
import { EVENT_LABELS, EVENT_COLORS, buildEventDetail } from '../../../data/logic/stamp-logic'
import { computeFlightTimeMs } from '../../../data/logic/session-logic'
import type { Session, StampEvent } from '../../../data/models'
import { SessionMap } from './SessionMap'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'In progress'
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
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

// ─── Session list ─────────────────────────────────────────────────────────────

function SessionRow({ session, onSelect }: { session: Session; onSelect: () => void }) {
  const maxAGLft = Math.round(session.maxAGL * 3.28084)
  const duration = formatDuration(session.startTime, session.endTime)

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '14px 16px',
        background: 'none',
        border: 'none',
        borderBottom: `1px solid ${theme.colors.darkBorder}`,
        cursor: 'pointer',
        textAlign: 'left',
        gap: '12px',
        minHeight: theme.tapTarget,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: theme.size.body, fontWeight: 700, color: theme.colors.cream, marginBottom: '3px', fontFamily: theme.font.primary }}>
          {formatDate(session.startTime)}
        </div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono }}>
          {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {duration}
          {maxAGLft > 0 ? ` · ${maxAGLft} ft AGL` : ''}
        </div>
      </div>
      <span style={{ color: theme.colors.dim, fontSize: '16px', flexShrink: 0 }}>›</span>
    </button>
  )
}

// ─── Session detail ───────────────────────────────────────────────────────────

function EventRow({ event }: { event: StampEvent }) {
  const color = EVENT_COLORS[event.type]
  const label = EVENT_LABELS[event.type]
  const detail = buildEventDetail(event)

  return (
    <div style={{ display: 'flex', gap: '10px', padding: '10px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}`, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <span style={{ fontFamily: theme.font.mono, fontSize: theme.size.body, color: theme.colors.cream, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {formatTime(event.ts)}
        </span>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
        <div style={{ width: '1px', minHeight: '12px', background: theme.colors.darkBorder }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: '1px' }}>
        <div style={{ fontSize: theme.size.body, color: theme.colors.cream, fontWeight: 700, marginBottom: '2px', fontFamily: theme.font.primary }}>{label}</div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, wordBreak: 'break-word', fontFamily: theme.font.primary }}>{detail}</div>
      </div>
    </div>
  )
}

function SessionDetail({ session, onBack }: { session: Session; onBack: () => void }) {
  const [events, setEvents] = useState<StampEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEvents(session.id).then(evs => {
      setEvents(evs)
      setLoading(false)
    })
  }, [session.id])

  const maxAGLft = Math.round(session.maxAGL * 3.28084)
  const flightMs = computeFlightTimeMs(events)
  const sessMs = session.endTime
    ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
    : 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: theme.colors.light,
            cursor: 'pointer', fontSize: '18px', padding: '4px 8px 4px 0',
            minHeight: theme.tapTarget, fontFamily: theme.font.primary,
          }}
        >
          ‹
        </button>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.colors.cream }}>{formatDate(session.startTime)}</div>
          <div style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{formatDuration(session.startTime, session.endTime)}</div>
        </div>
      </div>

      {/* Map — top half */}
      <div style={{ flexBasis: '45%', flexShrink: 0, minHeight: '220px', position: 'relative', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
        {!loading && <SessionMap session={session} events={events} />}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
        {[
          { label: 'FLIGHT', value: formatElapsed(flightMs) },
          { label: 'SESSION', value: formatElapsed(sessMs) },
          { label: 'MAX AGL', value: `${maxAGLft} ft` },
        ].map(card => (
          <div key={card.label} style={{ flex: 1, background: theme.colors.darkCard, borderRadius: '8px', padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.06em', marginBottom: '4px' }}>{card.label}</div>
            <div style={{ fontSize: '16px', color: theme.colors.cream, fontFamily: theme.font.mono, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim, fontSize: theme.size.body }}>Loading…</div>
        )}
        {!loading && events.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim, fontSize: theme.size.body }}>No events recorded.</div>
        )}
        {events.map(ev => <EventRow key={ev.id} event={ev} />)}
      </div>
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function SessionsPage() {
  const { sessions, loadingSessions, loadHistory, setHistorySession } = useSessionStore()
  const [selected, setSelected] = useState<Session | null>(null)

  useEffect(() => { loadHistory() }, [loadHistory])

  // Clear map overlay when page unmounts
  useEffect(() => () => { setHistorySession(null) }, [setHistorySession])

  function handleSelect(s: Session) {
    setSelected(s)
    setHistorySession(s.id)
    analyticsTrack('session_detail_viewed')
  }

  function handleBack() {
    setSelected(null)
    setHistorySession(null)
  }

  if (selected) {
    return <SessionDetail session={selected} onBack={handleBack} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>Sessions</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingSessions && (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim, fontSize: theme.size.body }}>Loading…</div>
        )}
        {!loadingSessions && sessions.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>◷</div>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.body }}>No sessions yet.</div>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.small, marginTop: '6px' }}>Tap Start Session on the map.</div>
          </div>
        )}
        {sessions.map(s => (
          <SessionRow key={s.id} session={s} onSelect={() => handleSelect(s)} />
        ))}
      </div>
    </div>
  )
}
