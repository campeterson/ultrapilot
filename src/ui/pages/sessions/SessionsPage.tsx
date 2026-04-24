import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'
import { useSessionStore } from '../../../state/session-store'
import { getEvents, getTrackPoints } from '../../../data/db'
import { trackEvent as analyticsTrack } from '../../../lib/analytics'
import { formatNM } from '../../../data/logic/gps-logic'
import { computeFlightTimeMs } from '../../../data/logic/session-logic'
import { downloadString, sessionFilename, toGPX, toOADSAll, toOADSSession } from '../../../data/export'
import type { Session, StampEvent } from '../../../data/models'
import { TimelineEventRow } from '../../components/TimelineEventRow'
import { SessionMap } from './SessionMap'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
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

function formatSessionDateParts(iso: string): { day: string; month: string; year: number } {
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString([], { day: '2-digit' }),
    month: d.toLocaleDateString([], { month: 'short' }),
    year: d.getFullYear(),
  }
}

function formatDurationHoursDecimal(startIso: string, endIso: string | null): string {
  const startMs = new Date(startIso).getTime()
  const endMs = endIso ? new Date(endIso).getTime() : Date.now()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '0.0'
  const hours = Math.max(0, (endMs - startMs) / 3600000)
  return (Math.round(hours * 10) / 10).toFixed(1)
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

function allSessionsFilename(ext: string): string {
  const stamp = String(Math.floor(Date.now() / 1000))
  return `ultrapilot-all-sessions-${stamp}.${ext}`
}

// ─── Session list ─────────────────────────────────────────────────────────────

function SessionRow({ session, onSelect }: { session: Session; onSelect: () => void }) {
  const { day, month } = formatSessionDateParts(session.startTime)
  const maxAGLft = Math.round(session.maxAGL * 3.28084)
  const durationHours = formatDurationHoursDecimal(session.startTime, session.endTime)

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
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
      <div style={{ width: '42px', flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontSize: '28px', lineHeight: 1, fontWeight: 700, color: theme.colors.cream, fontFamily: theme.font.mono }}>
          {day}
        </div>
        <div style={{ fontSize: theme.size.tiny, lineHeight: 1.2, color: theme.colors.dim, fontFamily: theme.font.primary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {month}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono }}>
          {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {` · ${formatNM(session.totalDistanceNM)} nm`}
          {maxAGLft > 0 ? ` · ${maxAGLft} ft AGL` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '22px', lineHeight: 1, color: theme.colors.cream, fontFamily: theme.font.mono, fontWeight: 700 }}>
          {durationHours}
        </div>
        <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.primary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          hr
        </div>
      </div>
    </button>
  )
}

function YearSeparator({ year }: { year: number }) {
  return (
    <div style={{
      padding: '10px 16px 6px',
      borderBottom: `1px solid ${theme.colors.darkBorder}`,
      color: theme.colors.light,
      fontSize: theme.size.small,
      fontWeight: 700,
      letterSpacing: '0.06em',
      fontFamily: theme.font.primary,
    }}>
      {year}
    </div>
  )
}

// ─── Session detail ───────────────────────────────────────────────────────────

function SessionDetail({ session, onBack, onTrash }: { session: Session; onBack: () => void; onTrash: () => void }) {
  const [events, setEvents] = useState<StampEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const trashSessionById = useSessionStore(s => s.trashSessionById)

  useEffect(() => {
    getEvents(session.id).then(evs => {
      setEvents(evs)
      setLoading(false)
    })
  }, [session.id])

  async function handleTrash() {
    await trashSessionById(session.id)
    setConfirmDelete(false)
    onTrash()
  }

  async function handleExportGPX() {
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const gpx = toGPX(session, pts, evts)
    downloadString(gpx, sessionFilename(session, 'gpx'), 'application/gpx+xml')
  }

  async function handleExportJSON() {
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const oads = toOADSSession(session, pts, evts)
    downloadString(JSON.stringify(oads, null, 2), sessionFilename(session, 'oads.json'), 'application/json')
  }

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
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.colors.cream }}>{formatDate(session.startTime)}</div>
          <div style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{formatDuration(session.startTime, session.endTime)}</div>
        </div>
        <button
          onClick={handleExportGPX}
          aria-label="Export GPX"
          style={{
            background: 'none', border: `1px solid ${theme.colors.darkBorder}`,
            color: theme.colors.light, cursor: 'pointer',
            padding: '8px 10px', borderRadius: '8px',
            minHeight: theme.tapTarget, fontFamily: theme.font.primary,
            fontSize: theme.size.small,
          }}
        >
          GPX
        </button>
        <button
          onClick={handleExportJSON}
          aria-label="Export OADS"
          style={{
            background: 'none', border: `1px solid ${theme.colors.darkBorder}`,
            color: theme.colors.light, cursor: 'pointer',
            padding: '8px 10px', borderRadius: '8px',
            minHeight: theme.tapTarget, fontFamily: theme.font.primary,
            fontSize: theme.size.small,
          }}
        >
          OADS
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete session"
          style={{
            background: 'none', border: `1px solid ${theme.colors.darkBorder}`,
            color: theme.colors.light, cursor: 'pointer',
            padding: '8px 10px', borderRadius: '8px',
            minHeight: theme.tapTarget, fontFamily: theme.font.primary,
            fontSize: theme.size.small,
          }}
        >
          Delete
        </button>
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
        {events.map(ev => <TimelineEventRow key={ev.id} event={ev} />)}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Move to trash?"
          message="The session will be moved to trash. You can restore it later."
          confirmLabel="Move to Trash"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleTrash}
        />
      )}
    </div>
  )
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, destructive = false, onCancel, onConfirm,
}: {
  title: string; message: string; confirmLabel: string; destructive?: boolean
  onCancel: () => void; onConfirm: () => void
}) {
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.colors.darkCard,
          border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '16px', padding: '20px', width: '300px',
          fontFamily: theme.font.primary,
        }}
      >
        <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginBottom: '16px', lineHeight: 1.4 }}>{message}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px',
              border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
              color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
              fontSize: theme.size.body, minHeight: theme.tapTarget,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px',
              border: `2px solid ${theme.colors.red}`,
              background: destructive ? theme.colors.red : theme.colors.redDim,
              color: theme.colors.cream, cursor: 'pointer', fontWeight: 700,
              fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Trash view ───────────────────────────────────────────────────────────────

function TrashRow({
  session, onRestore, onDelete,
}: {
  session: Session
  onRestore: () => void
  onDelete: () => void
}) {
  const maxAGLft = Math.round(session.maxAGL * 3.28084)
  const duration = formatDuration(session.startTime, session.endTime)

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '12px 16px', gap: '10px',
      borderBottom: `1px solid ${theme.colors.darkBorder}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: theme.size.body, fontWeight: 700, color: theme.colors.cream, marginBottom: '3px' }}>
          {formatDate(session.startTime)}
        </div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, fontFamily: theme.font.mono }}>
          {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {duration}
          {maxAGLft > 0 ? ` · ${maxAGLft} ft AGL` : ''}
        </div>
      </div>
      <button
        onClick={onRestore}
        style={{
          padding: '8px 10px', borderRadius: '8px',
          border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
          color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
          fontSize: theme.size.small, minHeight: theme.tapTarget, flexShrink: 0,
        }}
      >
        Restore
      </button>
      <button
        onClick={onDelete}
        style={{
          padding: '8px 10px', borderRadius: '8px',
          border: `1px solid ${theme.colors.red}`,
          background: 'none', color: theme.colors.red,
          cursor: 'pointer', fontFamily: theme.font.primary,
          fontSize: theme.size.small, minHeight: theme.tapTarget, flexShrink: 0,
        }}
      >
        Delete
      </button>
    </div>
  )
}

function TrashView({ onBack }: { onBack: () => void }) {
  const { deletedSessions, loadingDeleted, loadDeleted, restoreSessionById, deleteSessionById } = useSessionStore()
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null)

  useEffect(() => { loadDeleted() }, [loadDeleted])

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    await deleteSessionById(confirmDelete.id)
    setConfirmDelete(null)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
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
        <span style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>Trash</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingDeleted && (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim, fontSize: theme.size.body }}>Loading…</div>
        )}
        {!loadingDeleted && deletedSessions.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.body }}>Trash is empty.</div>
          </div>
        )}
        {deletedSessions.map(s => (
          <TrashRow
            key={s.id}
            session={s}
            onRestore={() => restoreSessionById(s.id)}
            onDelete={() => setConfirmDelete(s)}
          />
        ))}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete permanently?"
          message="This will permanently remove the session, its track, and all stamps. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function SessionsPage() {
  const { sessions, loadingSessions, loadHistory, setHistorySession } = useSessionStore()
  const justEndedSessionId = useSessionStore(s => s.justEndedSessionId)
  const consumeJustEndedSessionId = useSessionStore(s => s.consumeJustEndedSessionId)
  const [selected, setSelected] = useState<Session | null>(null)
  const [showTrash, setShowTrash] = useState(false)

  useEffect(() => { loadHistory() }, [loadHistory])

  // Clear map overlay when page unmounts
  useEffect(() => () => { setHistorySession(null) }, [setHistorySession])

  // After a session ends, AppShell opens this page and leaves the ended
  // session id on the store. Auto-open its detail view once the list loads.
  useEffect(() => {
    if (!justEndedSessionId) return
    const ended = sessions.find(s => s.id === justEndedSessionId)
    if (!ended) return
    setSelected(ended)
    setHistorySession(ended.id)
    analyticsTrack('session_detail_viewed')
    consumeJustEndedSessionId()
  }, [justEndedSessionId, sessions, setHistorySession, consumeJustEndedSessionId])

  function handleSelect(s: Session) {
    setSelected(s)
    setHistorySession(s.id)
    analyticsTrack('session_detail_viewed')
  }

  function handleBack() {
    setSelected(null)
    setHistorySession(null)
  }

  function handleTrashFromDetail() {
    setSelected(null)
    setHistorySession(null)
    loadHistory()
  }

  async function handleExportAll() {
    if (sessions.length === 0) return
    const exported = await Promise.all(sessions.map(async (s) => {
      const [trackPoints, events] = await Promise.all([getTrackPoints(s.id), getEvents(s.id)])
      return { session: s, trackPoints, events }
    }))
    const oads = toOADSAll(exported)
    downloadString(
      JSON.stringify(oads, null, 2),
      allSessionsFilename('oads.json'),
      'application/json'
    )
  }

  if (showTrash) {
    return <TrashView onBack={() => { setShowTrash(false); loadHistory() }} />
  }

  if (selected) {
    return <SessionDetail session={selected} onBack={handleBack} onTrash={handleTrashFromDetail} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      <div style={{
        padding: '14px 16px 10px', borderBottom: `1px solid ${theme.colors.darkBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>Sessions</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleExportAll}
            disabled={sessions.length === 0}
            style={{
              background: 'none', border: 'none', color: sessions.length === 0 ? theme.colors.dim : theme.colors.light,
              cursor: sessions.length === 0 ? 'default' : 'pointer', fontFamily: theme.font.primary,
              fontSize: theme.size.small, padding: '6px 4px',
              textDecoration: 'underline',
            }}
          >
            Export All
          </button>
          <button
            onClick={() => setShowTrash(true)}
            style={{
              background: 'none', border: 'none', color: theme.colors.light,
              cursor: 'pointer', fontFamily: theme.font.primary,
              fontSize: theme.size.small, padding: '6px 4px',
              textDecoration: 'underline',
            }}
          >
            Trash
          </button>
        </div>
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
        {sessions.map((s, index) => {
          const year = formatSessionDateParts(s.startTime).year
          const prevYear = index > 0 ? formatSessionDateParts(sessions[index - 1].startTime).year : null
          const showYearHeader = index === 0 || year !== prevYear

          return (
            <Fragment key={s.id}>
              {showYearHeader && <YearSeparator year={year} />}
              <SessionRow session={s} onSelect={() => handleSelect(s)} />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
